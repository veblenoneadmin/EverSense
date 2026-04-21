// backend/api/invoices.js — Bi-weekly payroll invoices.
// Salary (monthly) is split in half: period 1 = 1st-15th, period 2 = 16th-end.
// Generated automatically on the 15th + last day of each month by the
// invoiceScheduler. Accountants/admins see all, staff see their own.

import express from 'express';
import { prisma } from '../lib/prisma.js';
import { randomUUID } from 'crypto';
import { requireAuth, withOrgScope, requireRole } from '../lib/rbac.js';

const router = express.Router();

// ── Lazy invoices table ───────────────────────────────────────────────────────
let tableReady = false;
export async function ensureInvoicesTable() {
  if (tableReady) return;
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `invoices` (' +
      '  `id` VARCHAR(191) NOT NULL,' +
      '  `userId` VARCHAR(36) NOT NULL,' +
      '  `orgId` VARCHAR(191) NOT NULL,' +
      '  `periodStart` DATE NOT NULL,' +
      '  `periodEnd` DATE NOT NULL,' +
      '  `issueDate` DATE NOT NULL,' +
      '  `salary` DECIMAL(12,2) NOT NULL DEFAULT 0,' +
      '  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0,' +
      '  `leaveDays` INT NOT NULL DEFAULT 0,' +
      '  `leaveBreakdown` TEXT NULL,' +
      '  `status` VARCHAR(20) NOT NULL DEFAULT \'ISSUED\',' +
      '  `notes` TEXT NULL,' +
      '  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      '  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),' +
      '  PRIMARY KEY (`id`),' +
      '  UNIQUE KEY `invoices_user_period_key` (`userId`, `orgId`, `periodStart`, `periodEnd`),' +
      '  KEY `invoices_orgId_idx` (`orgId`),' +
      '  KEY `invoices_userId_idx` (`userId`),' +
      '  KEY `invoices_issueDate_idx` (`issueDate`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    tableReady = true;
    console.log('  ✅ invoices table ready');
  } catch (e) {
    console.warn('  ⚠️  invoices table:', e.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function isoDate(d) {
  // YYYY-MM-DD in UTC
  return new Date(d).toISOString().slice(0, 10);
}

// Period for a given issue date: either 1-15 or 16-lastDay of that month.
export function periodForIssueDate(issueDate) {
  const d = new Date(issueDate);
  const year  = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day   = d.getUTCDate();

  let start, end;
  if (day <= 15) {
    start = new Date(Date.UTC(year, month, 1));
    end   = new Date(Date.UTC(year, month, 15));
  } else {
    start = new Date(Date.UTC(year, month, 16));
    end   = new Date(Date.UTC(year, month + 1, 0)); // last day of month
  }
  return { start, end };
}

// Count approved leave days that fall inside [start, end]. Returns {count, breakdown}.
async function leavesInPeriod(userId, orgId, start, end) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, type, startDate, endDate, days, reason
       FROM leaves
      WHERE userId = ? AND orgId = ? AND status = 'APPROVED'
        AND startDate <= ? AND endDate >= ?`,
    userId, orgId, end, start
  ).catch(() => []);

  let count = 0;
  const breakdown = [];
  for (const r of rows) {
    const s = new Date(Math.max(new Date(r.startDate).getTime(), new Date(start).getTime()));
    const e = new Date(Math.min(new Date(r.endDate).getTime(), new Date(end).getTime()));
    const days = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    count += days;
    breakdown.push({
      type: r.type,
      from: isoDate(s),
      to:   isoDate(e),
      days,
      reason: r.reason || null,
    });
  }
  return { count, breakdown };
}

// ── Core: generate (or refresh) invoices for a given issue date across org ──
// For each employee with a salary on their employee_profile, create one invoice
// for the current period if it doesn't already exist. Returns { created, skipped }.
export async function generateInvoicesForOrg(orgId, issueDate = new Date()) {
  await ensureInvoicesTable();
  const { start, end } = periodForIssueDate(issueDate);
  const issueIso = isoDate(issueDate);

  // Non-client employees who have a salary set
  const profiles = await prisma.$queryRawUnsafe(
    "SELECT ep.userId, ep.salary " +
    "FROM employee_profiles ep " +
    "JOIN memberships m ON m.userId = ep.userId AND m.orgId = ep.orgId " +
    "WHERE ep.orgId = ? AND m.role <> 'CLIENT' AND ep.salary IS NOT NULL AND ep.salary > 0",
    orgId
  ).catch(() => []);

  let created = 0, skipped = 0;
  for (const p of profiles) {
    // Dedupe on (userId, orgId, periodStart, periodEnd)
    const exists = await prisma.$queryRawUnsafe(
      'SELECT id FROM invoices WHERE userId = ? AND orgId = ? AND periodStart = ? AND periodEnd = ? LIMIT 1',
      p.userId, orgId, isoDate(start), isoDate(end)
    ).catch(() => []);
    if (exists.length) { skipped++; continue; }

    const salary = Number(p.salary);
    const amount = +(salary / 2).toFixed(2);
    const leaves = await leavesInPeriod(p.userId, orgId, start, end);

    await prisma.$executeRawUnsafe(
      'INSERT INTO invoices (id, userId, orgId, periodStart, periodEnd, issueDate, salary, amount, leaveDays, leaveBreakdown, status, createdAt, updatedAt) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))',
      randomUUID(), p.userId, orgId, isoDate(start), isoDate(end), issueIso,
      salary, amount, leaves.count, leaves.breakdown.length ? JSON.stringify(leaves.breakdown) : null, 'ISSUED'
    );
    created++;
  }

  console.log(`[Invoices] org=${orgId} period=${isoDate(start)}→${isoDate(end)} created=${created} skipped=${skipped}`);
  return { created, skipped, periodStart: isoDate(start), periodEnd: isoDate(end) };
}

// ── Middleware: decide if user sees everyone or just themselves ─────────────
async function roleFor(userId, orgId) {
  const m = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true },
  });
  return m?.role || 'STAFF';
}

// ── GET /api/invoices — list invoices ────────────────────────────────────────
router.get('/', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureInvoicesTable();
    const role = await roleFor(req.user.id, req.orgId);
    const isPrivileged = ['OWNER', 'ADMIN', 'HALL_OF_JUSTICE', 'ACCOUNTANT'].includes(role);

    const params = [req.orgId];
    let sql = `SELECT i.*, u.name AS userName, u.email AS userEmail
                 FROM invoices i
                 LEFT JOIN \`User\` u ON u.id = i.userId
                WHERE i.orgId = ?`;
    if (!isPrivileged) { sql += ' AND i.userId = ?'; params.push(req.user.id); }
    sql += ' ORDER BY i.issueDate DESC, i.userId ASC LIMIT 500';

    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    res.json({
      invoices: rows.map(r => ({
        ...r,
        leaveBreakdown: r.leaveBreakdown ? safeParse(r.leaveBreakdown) : [],
        salary: Number(r.salary),
        amount: Number(r.amount),
        leaveDays: Number(r.leaveDays || 0),
      })),
      role,
      isPrivileged,
    });
  } catch (err) {
    console.error('[Invoices] GET / error:', err);
    res.status(500).json({ error: err.message });
  }
});

function safeParse(s) { try { return JSON.parse(s); } catch { return []; } }

// ── POST /api/invoices — manual create (admin/accountant) ───────────────────
router.post('/', requireAuth, withOrgScope, requireRole('ACCOUNTANT'), async (req, res) => {
  try {
    await ensureInvoicesTable();
    const { userId, periodStart, periodEnd, issueDate, salary, amount, notes } = req.body;
    if (!userId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'userId, periodStart, periodEnd required' });
    }
    const start = new Date(periodStart);
    const end   = new Date(periodEnd);
    const issue = issueDate ? new Date(issueDate) : end;

    // Pull salary from employee_profile if not provided
    let salaryNum = salary != null ? Number(salary) : null;
    if (salaryNum == null) {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT salary FROM employee_profiles WHERE userId = ? AND orgId = ? LIMIT 1',
        userId, req.orgId
      ).catch(() => []);
      salaryNum = rows[0]?.salary != null ? Number(rows[0].salary) : 0;
    }
    const amountNum = amount != null ? Number(amount) : +(salaryNum / 2).toFixed(2);

    const leaves = await leavesInPeriod(userId, req.orgId, start, end);

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      'INSERT INTO invoices (id, userId, orgId, periodStart, periodEnd, issueDate, salary, amount, leaveDays, leaveBreakdown, status, notes, createdAt, updatedAt) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))',
      id, userId, req.orgId, isoDate(start), isoDate(end), isoDate(issue),
      salaryNum, amountNum, leaves.count,
      leaves.breakdown.length ? JSON.stringify(leaves.breakdown) : null, 'ISSUED', notes || null
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('[Invoices] POST / error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/generate — manual trigger for this org ───────────────
// Optional body { date: "YYYY-MM-DD" } to target a specific period.
router.post('/generate', requireAuth, withOrgScope, requireRole('ACCOUNTANT'), async (req, res) => {
  try {
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const result = await generateInvoicesForOrg(req.orgId, date);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Invoices] generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/invoices/:id — status/notes update ───────────────────────────
router.patch('/:id', requireAuth, withOrgScope, requireRole('ACCOUNTANT'), async (req, res) => {
  try {
    await ensureInvoicesTable();
    const { id } = req.params;
    const { status, notes, amount, salary, periodStart, periodEnd, issueDate } = req.body;

    const sets = [];
    const vals = [];
    if (status !== undefined && ['ISSUED', 'PAID', 'VOID'].includes(status)) { sets.push('status = ?'); vals.push(status); }
    if (notes !== undefined)       { sets.push('notes = ?'); vals.push(notes || null); }
    if (amount !== undefined)      { sets.push('amount = ?'); vals.push(Number(amount)); }
    if (salary !== undefined)      { sets.push('salary = ?'); vals.push(Number(salary)); }
    if (periodStart !== undefined) { sets.push('periodStart = ?'); vals.push(isoDate(periodStart)); }
    if (periodEnd !== undefined)   { sets.push('periodEnd = ?'); vals.push(isoDate(periodEnd)); }
    if (issueDate !== undefined)   { sets.push('issueDate = ?'); vals.push(isoDate(issueDate)); }

    if (!sets.length) return res.json({ success: true });

    sets.push('updatedAt = NOW(3)');
    await prisma.$executeRawUnsafe(
      `UPDATE invoices SET ${sets.join(', ')} WHERE id = ? AND orgId = ?`,
      ...vals, id, req.orgId
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Invoices] PATCH error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/invoices/:id ─────────────────────────────────────────────────
router.delete('/:id', requireAuth, withOrgScope, requireRole('ACCOUNTANT'), async (req, res) => {
  try {
    await ensureInvoicesTable();
    await prisma.$executeRawUnsafe(
      'DELETE FROM invoices WHERE id = ? AND orgId = ?', req.params.id, req.orgId
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Invoices] DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
