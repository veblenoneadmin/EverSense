// backend/api/leaves.js — Receives approved leave records synced from HRSense
// Also exposes user-facing endpoints for in-app leave requests.

import express from 'express';
import { prisma } from '../lib/prisma.js';
import { randomUUID } from 'crypto';
import { requireAuth, withOrgScope, requireRole } from '../lib/rbac.js';
import { notifyHRSense } from '../lib/hrsense-notify.js';

const router = express.Router();

// Build the canonical leave payload HR-Sense expects. Centralised so each
// fire-and-forget notify call below can't drift.
function buildLeavePayload(row, extras = {}) {
  return {
    id: row.id,
    userId: row.userId,
    email: row.email || null,
    type: row.type,
    startDate: row.startDate,
    endDate: row.endDate,
    days: row.days,
    reason: row.reason || null,
    status: row.status,
    ...extras,
  };
}

export const LEAVE_ALLOWANCES = { annual: 10, sick: 5 };

// Ensure leaves table exists (same raw-SQL pattern as other modules)
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `leaves` (' +
      '  `id` VARCHAR(191) NOT NULL,' +
      '  `userId` VARCHAR(36) NOT NULL,' +
      '  `orgId` VARCHAR(191) NOT NULL,' +
      '  `type` VARCHAR(50) NOT NULL,' +
      '  `status` VARCHAR(20) NOT NULL DEFAULT \'APPROVED\',' +
      '  `startDate` DATETIME(3) NOT NULL,' +
      '  `endDate` DATETIME(3) NOT NULL,' +
      '  `days` INT NOT NULL,' +
      '  `reason` TEXT NULL,' +
      '  `approvedAt` DATETIME(3) NULL,' +
      '  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      '  PRIMARY KEY (`id`),' +
      '  KEY `leaves_userId_idx` (`userId`),' +
      '  KEY `leaves_orgId_idx` (`orgId`),' +
      '  KEY `leaves_userId_startDate_idx` (`userId`, `startDate`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    tableReady = true;
    console.log('  ✅ leaves table ready');
  } catch (e) {
    console.warn('  ⚠️  leaves table:', e.message);
  }
}

// Middleware — verify INTERNAL_API_SECRET so only HRSense can call this
function requireInternalSecret(req, res, next) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.warn('[Leaves] INTERNAL_API_SECRET not set — rejecting request');
    return res.status(503).json({ error: 'Internal API not configured' });
  }
  const provided = req.headers['x-internal-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/leaves?userId=xxx&orgId=xxx — query synced leaves (internal use)
router.get('/', requireInternalSecret, async (req, res) => {
  try {
    await ensureTable();
    const { userId, orgId } = req.query;
    if (!userId && !orgId) return res.status(400).json({ error: 'userId or orgId is required' });

    const where = [];
    const params = [];
    if (userId) { where.push('userId = ?'); params.push(userId); }
    if (orgId)  { where.push('orgId = ?');  params.push(orgId); }

    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM leaves WHERE ${where.join(' AND ')} ORDER BY startDate DESC LIMIT 100`,
      ...params
    );
    res.json({ leaves: rows });
  } catch (err) {
    console.error('[Leaves] GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leaves — receive approved leave from HRSense
router.post('/', requireInternalSecret, async (req, res) => {
  try {
    await ensureTable();

    const { userId, type, status = 'APPROVED', startDate, endDate, days, reason, approvedAt } = req.body;

    if (!userId || !type || !startDate || !endDate || !days) {
      return res.status(400).json({ error: 'userId, type, startDate, endDate and days are required' });
    }

    // Look up the user's orgId from their membership
    const membership = await prisma.membership.findFirst({
      where: { userId },
      select: { orgId: true },
    });

    if (!membership) {
      console.warn(`[Leaves] No membership found for userId=${userId} — leave not stored`);
      return res.status(404).json({ error: `No org membership found for user ${userId}` });
    }

    const orgId = membership.orgId;
    const id = randomUUID();

    await prisma.$executeRawUnsafe(
      'INSERT INTO leaves (id, userId, orgId, type, status, startDate, endDate, days, reason, approvedAt, createdAt) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      id,
      userId,
      orgId,
      type,
      status,
      new Date(startDate),
      new Date(endDate),
      Number(days),
      reason || null,
      approvedAt ? new Date(approvedAt) : new Date(),
    );

    console.log(`[Leaves] ✅ Synced leave: userId=${userId} orgId=${orgId} type=${type} days=${days} (${startDate} → ${endDate})`);
    res.status(201).json({ success: true, id, orgId });

  } catch (err) {
    console.error('[Leaves] POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USER-FACING ENDPOINTS (session-authenticated)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeType(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.startsWith('sick')) return 'sick';
  return 'annual';
}

function countDaysUsedThisYear(rows, type) {
  const year = new Date().getUTCFullYear();
  return rows
    .filter(r => r.status === 'APPROVED' && normalizeType(r.type) === type && new Date(r.startDate).getUTCFullYear() === year)
    .reduce((sum, r) => sum + Number(r.days || 0), 0);
}

// GET /api/leaves/my — user's own leaves + balance
router.get('/my', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTable();
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, type, status, startDate, endDate, days, reason, approvedAt, createdAt
         FROM leaves
        WHERE userId = ? AND orgId = ?
        ORDER BY startDate DESC LIMIT 200`,
      req.user.id, req.orgId
    );

    const annualUsed = countDaysUsedThisYear(rows, 'annual');
    const sickUsed   = countDaysUsedThisYear(rows, 'sick');

    res.json({
      leaves: rows,
      allowances: LEAVE_ALLOWANCES,
      used: { annual: annualUsed, sick: sickUsed },
      remaining: {
        annual: Math.max(0, LEAVE_ALLOWANCES.annual - annualUsed),
        sick: Math.max(0, LEAVE_ALLOWANCES.sick - sickUsed),
      },
    });
  } catch (err) {
    console.error('[Leaves] GET /my error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leaves/my — user submits a leave request (status=PENDING)
router.post('/my', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTable();
    const { type, startDate, endDate, reason } = req.body;
    if (!type || !startDate || !endDate) {
      return res.status(400).json({ error: 'type, startDate, endDate are required' });
    }
    const start = new Date(startDate);
    const end   = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ error: 'Invalid date range' });
    }
    // Inclusive day count
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const id = randomUUID();
    const normalizedType = normalizeType(type);
    await prisma.$executeRawUnsafe(
      'INSERT INTO leaves (id, userId, orgId, type, status, startDate, endDate, days, reason, createdAt) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      id, req.user.id, req.orgId, normalizedType, 'PENDING', start, end, days, reason || null
    );

    notifyHRSense('leave.requested', buildLeavePayload({
      id, userId: req.user.id, email: req.user.email,
      type: normalizedType, startDate: start, endDate: end, days,
      reason: reason || null, status: 'PENDING',
    }, { orgId: req.orgId }));

    res.status(201).json({ success: true, id, days, status: 'PENDING' });
  } catch (err) {
    console.error('[Leaves] POST /my error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leaves/pending — admin view of all pending requests
router.get('/pending', requireAuth, withOrgScope, requireRole('ADMIN'), async (req, res) => {
  try {
    await ensureTable();
    const rows = await prisma.$queryRawUnsafe(
      `SELECT l.id, l.userId, l.type, l.status, l.startDate, l.endDate, l.days, l.reason, l.createdAt,
              u.name AS userName, u.email AS userEmail
         FROM leaves l
         LEFT JOIN User u ON u.id = l.userId
        WHERE l.orgId = ? AND l.status = 'PENDING'
        ORDER BY l.createdAt DESC LIMIT 200`,
      req.orgId
    );
    res.json({ leaves: rows });
  } catch (err) {
    console.error('[Leaves] GET /pending error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/leaves/:id/status — admin approve or reject
router.patch('/:id/status', requireAuth, withOrgScope, requireRole('ADMIN'), async (req, res) => {
  try {
    await ensureTable();
    const { id } = req.params;
    const { status } = req.body; // APPROVED | REJECTED
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'status must be APPROVED or REJECTED' });
    }
    const approvedAt = status === 'APPROVED' ? new Date() : null;
    await prisma.$executeRawUnsafe(
      'UPDATE leaves SET status = ?, approvedAt = ? WHERE id = ? AND orgId = ?',
      status, approvedAt, id, req.orgId
    );

    // Fetch the updated row + user email so HR-Sense gets a complete payload.
    const rows = await prisma.$queryRawUnsafe(
      `SELECT l.id, l.userId, l.type, l.status, l.startDate, l.endDate, l.days, l.reason,
              l.approvedAt, u.email
         FROM leaves l LEFT JOIN User u ON u.id = l.userId
        WHERE l.id = ? AND l.orgId = ?`,
      id, req.orgId
    );
    if (rows[0]) {
      const eventName = status === 'APPROVED' ? 'leave.approved' : 'leave.rejected';
      notifyHRSense(eventName, buildLeavePayload(rows[0], {
        orgId: req.orgId,
        approvedBy: req.user.id,
        approvedAt: approvedAt?.toISOString() || null,
      }));
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Leaves] PATCH status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leaves/:id — user cancels their own PENDING leave request.
// Admin-approved leaves cannot be cancelled via this endpoint; ask an admin
// to reject, or call the HR-Sense cancel flow instead.
router.delete('/:id', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTable();
    const { id } = req.params;

    // Only allow if the row is the user's own AND still PENDING.
    const rows = await prisma.$queryRawUnsafe(
      `SELECT l.id, l.userId, l.type, l.status, l.startDate, l.endDate, l.days, l.reason,
              u.email
         FROM leaves l LEFT JOIN User u ON u.id = l.userId
        WHERE l.id = ? AND l.userId = ? AND l.orgId = ?`,
      id, req.user.id, req.orgId
    );
    if (!rows[0]) return res.status(404).json({ error: 'Leave not found' });
    if (rows[0].status !== 'PENDING') {
      return res.status(409).json({ error: 'Only PENDING leaves can be cancelled' });
    }

    await prisma.$executeRawUnsafe(
      'DELETE FROM leaves WHERE id = ? AND userId = ? AND orgId = ?',
      id, req.user.id, req.orgId
    );

    notifyHRSense('leave.cancelled', buildLeavePayload(rows[0], { orgId: req.orgId }));

    res.json({ success: true });
  } catch (err) {
    console.error('[Leaves] DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
