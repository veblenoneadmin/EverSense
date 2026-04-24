import express from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, withOrgScope } from '../lib/rbac.js';
import { broadcast } from '../lib/sse.js';

const router = express.Router();

// Gate cross-service endpoints with the shared HR-Sense secret.
function requireInternalSecret(req, res, next) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return res.status(503).json({ error: 'Internal API not configured' });
  const provided = req.headers['x-internal-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Only OWNER, ADMIN, HALL_OF_JUSTICE, ACCOUNTANT can manage contracts
async function requireContractAccess(req, res, next) {
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: req.user.id, orgId: req.orgId } },
    select: { role: true },
  });
  if (!['OWNER', 'ADMIN', 'HALL_OF_JUSTICE', 'ACCOUNTANT'].includes(membership?.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  req.userRole = membership.role;
  next();
}

// ── GET /api/contracts — list all contracts for the org ──────────────────────
router.get('/', requireAuth, withOrgScope, requireContractAccess, async (req, res) => {
  try {
    const contracts = await prisma.$queryRawUnsafe(`
      SELECT ct.id, ct.title, ct.status, ct.salary, ct.employeeEmail,
             ct.createdAt, ct.updatedAt,
             u1.name AS createdByName, u2.name AS updatedByName
      FROM contract_templates ct
      LEFT JOIN User u1 ON u1.id = ct.createdBy
      LEFT JOIN User u2 ON u2.id = ct.updatedBy
      WHERE ct.orgId = ?
      ORDER BY ct.updatedAt DESC
    `, req.orgId);
    res.json({ contracts });
  } catch (err) {
    console.error('[Contracts] list error:', err);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

// ── POST /api/contracts/sync — HR-Sense pushes a new/updated contract here ───
// Cross-service write path: HR-Sense owns the contract but EverSense mirrors
// it so the clock-in modal flow (GET /my) keeps working. Also broadcasts an
// SSE event so the matched user's frontend can pop the modal immediately
// without waiting for their next /my poll.
router.post('/sync', requireInternalSecret, async (req, res) => {
  try {
    const {
      id,
      orgId,
      title,
      content = '',
      status = 'draft',
      employeeEmail = null,
      salary = null,
      signedContent = null,
      signedAt = null,
      createdBy = null,
      updatedBy = null,
      createdAt = null,
      updatedAt = null,
    } = req.body || {};

    if (!id || !orgId || !title) {
      return res.status(400).json({ error: 'id, orgId, title are required' });
    }

    const salaryNum = salary != null && salary !== '' && !isNaN(Number(salary)) ? Number(salary) : null;

    // Upsert — insert if new, overwrite if the same id comes back on update.
    await prisma.$executeRawUnsafe(
      `INSERT INTO contract_templates
         (id, orgId, title, content, status, employeeEmail, salary,
          signedContent, signedAt, createdBy, updatedBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW(3)), COALESCE(?, NOW(3)))
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         content = VALUES(content),
         status = VALUES(status),
         employeeEmail = VALUES(employeeEmail),
         salary = VALUES(salary),
         signedContent = VALUES(signedContent),
         signedAt = VALUES(signedAt),
         updatedBy = VALUES(updatedBy),
         updatedAt = VALUES(updatedAt)`,
      id, orgId, title, content, status, employeeEmail, salaryNum,
      signedContent, signedAt ? new Date(signedAt) : null,
      createdBy, updatedBy,
      createdAt ? new Date(createdAt) : null,
      updatedAt ? new Date(updatedAt) : null
    );

    // Tell the user's frontend to refresh — modal will pop up on next /my check.
    broadcast(orgId, 'contract', { action: 'created', id, employeeEmail, status });

    res.json({ ok: true, id });
  } catch (err) {
    console.error('[Contracts] sync error:', err);
    res.status(500).json({ error: 'Failed to sync contract' });
  }
});

// ── GET /api/contracts/my — get the contract assigned to current user's email ─
// MUST be before /:id so Express doesn't treat "my" as an id
router.get('/my', requireAuth, withOrgScope, async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT id, title, content, status, createdAt, signedAt FROM contract_templates WHERE employeeEmail = ? AND orgId = ? ORDER BY createdAt DESC LIMIT 1',
      req.user.email, req.orgId
    );
    res.json({ contract: rows[0] || null });
  } catch (err) {
    console.error('[Contracts] my error:', err);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

// ── GET /api/contracts/:id — get single contract with content ────────────────
router.get('/:id', requireAuth, withOrgScope, requireContractAccess, async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT * FROM contract_templates WHERE id = ? AND orgId = ? LIMIT 1',
      req.params.id, req.orgId
    );
    if (!rows.length) return res.status(404).json({ error: 'Contract not found' });
    res.json({ contract: rows[0] });
  } catch (err) {
    console.error('[Contracts] get error:', err);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

// ── POST /api/contracts — create new contract ────────────────────────────────
router.post('/', requireAuth, withOrgScope, requireContractAccess, async (req, res) => {
  try {
    const { title, content = '', status = 'draft', employeeEmail = null, salary = null } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const id = randomUUID();
    const salaryNum = salary != null && salary !== '' ? Number(salary) : null;
    await prisma.$executeRawUnsafe(
      'INSERT INTO contract_templates (id, orgId, title, content, status, employeeEmail, salary, createdBy, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, req.orgId, title.trim(), content, status, employeeEmail || null,
      isNaN(salaryNum) ? null : salaryNum, req.user.id, req.user.id
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('[Contracts] create error:', err);
    res.status(500).json({ error: 'Failed to create contract' });
  }
});

// ── PUT /api/contracts/:id — update contract ─────────────────────────────────
router.put('/:id', requireAuth, withOrgScope, requireContractAccess, async (req, res) => {
  try {
    const { title, content, status, salary } = req.body;
    const sets = [];
    const vals = [];
    if (title !== undefined) { sets.push('title = ?'); vals.push(title.trim()); }
    if (content !== undefined) { sets.push('content = ?'); vals.push(content); }
    if (status !== undefined) { sets.push('status = ?'); vals.push(status); }
    if (salary !== undefined) {
      const n = salary == null || salary === '' ? null : Number(salary);
      sets.push('salary = ?'); vals.push(n != null && !isNaN(n) ? n : null);
    }
    sets.push('updatedBy = ?'); vals.push(req.user.id);

    await prisma.$executeRawUnsafe(
      `UPDATE contract_templates SET ${sets.join(', ')}, updatedAt = NOW(3) WHERE id = ? AND orgId = ?`,
      ...vals, req.params.id, req.orgId
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Contracts] update error:', err);
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

// ── DELETE /api/contracts/:id — delete contract ──────────────────────────────
router.delete('/:id', requireAuth, withOrgScope, requireContractAccess, async (req, res) => {
  try {
    // OWNER, ADMIN, HALL_OF_JUSTICE, ACCOUNTANT can delete
    if (!['OWNER', 'ADMIN', 'HALL_OF_JUSTICE', 'ACCOUNTANT'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await prisma.$executeRawUnsafe(
      'DELETE FROM contract_templates WHERE id = ? AND orgId = ?',
      req.params.id, req.orgId
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Contracts] delete error:', err);
    res.status(500).json({ error: 'Failed to delete contract' });
  }
});

export default router;
