// backend/api/super-admin.js
// Completely DB-free super admin — credentials live in env vars only.
// Uses an HMAC-signed cookie (sa_token) for session. No user record in the DB.
import express from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/rbac.js';
import { sendInviteEmail, formatDuration } from '../lib/mailer.js';
import { runDailyPersonReportNow } from '../services/dailyPersonReportScheduler.js';

const router = express.Router();

// ── Token helpers ─────────────────────────────────────────────────────────────
export function generateSaToken(secret) {
  const ts = Date.now().toString();
  const sig = createHmac('sha256', secret).update(ts).digest('hex');
  return `${ts}.${sig}`;
}

export function verifySaToken(token, secret) {
  if (!token || !secret) return false;
  try {
    const dot = token.indexOf('.');
    if (dot === -1) return false;
    const ts  = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac('sha256', secret).update(ts).digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

function getSaSecret() { return process.env.MAINTENANCE_TOKEN || ''; }

const COOKIE_NAME = 'sa_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
  path:     '/',
};

const SUPER_ADMIN_EMAIL = 'admin@eversense.ai';

// ── In-memory error log (last 200 entries) ────────────────────────────────────
const ERROR_LOG = [];
const MAX_ERRORS = 200;

export function logError(level, source, message, detail = null) {
  ERROR_LOG.unshift({ level, source, message, detail: detail ? String(detail).slice(0, 500) : null, ts: new Date().toISOString() });
  if (ERROR_LOG.length > MAX_ERRORS) ERROR_LOG.length = MAX_ERRORS;
}

// Middleware: require the global super admin email
function requireSuperAdminUser(req, res, next) {
  if (!req.user || req.user.email !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// ── GET /api/super-admin/check ────────────────────────────────────────────────
// Used by OrganizationContext — works via cookie, no auth middleware needed.
router.get('/check', (req, res) => {
  const token  = parseSaCookie(req);
  const secret = getSaSecret();
  res.json({ isSuperAdmin: !!(token && verifySaToken(token, secret)) });
});

// ── GET /api/super-admin/me ───────────────────────────────────────────────────
// Returns a virtual user object when the sa_token cookie is valid.
router.get('/me', (req, res) => {
  const token  = parseSaCookie(req);
  const secret = getSaSecret();
  if (!token || !verifySaToken(token, secret)) {
    return res.status(401).json({ isSuperAdmin: false });
  }
  res.json({
    isSuperAdmin: true,
    user: { id: '__superadmin__', email: 'system@internal', name: 'Super Admin' },
  });
});

// ── POST /api/super-admin/login ───────────────────────────────────────────────
// No user record created. Validates password against MAINTENANCE_TOKEN env var.
router.post('/login', (req, res) => {
  const { password } = req.body;
  const secret = getSaSecret();

  if (!secret) {
    return res.status(503).json({ error: 'Super admin not configured' });
  }
  if (!password || password !== secret) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateSaToken(secret);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
  res.json({ success: true });
});

// ── POST /api/super-admin/logout ──────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

// ── GET /api/super-admin/orgs ─────────────────────────────────────────────────
// Lists ALL orgs for the super admin org-switcher. Cookie-authenticated.
router.get('/orgs', (req, res, next) => {
  const token  = parseSaCookie(req);
  const secret = getSaSecret();
  if (!token || !verifySaToken(token, secret)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}, async (req, res) => {
  try {
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
    res.json({ organizations: orgs.map(o => ({ ...o, role: 'OWNER' })) });
  } catch (err) {
    console.error('[SuperAdmin] orgs error:', err);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// ── GET /api/super-admin/stats ────────────────────────────────────────────────
router.get('/stats', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const [
      totalUsers,
      totalOrgs,
      totalTasks,
      totalProjects,
      totalClients,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.macroTask.count(),
      prisma.project.count(),
      prisma.client.count(),
      prisma.user.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
      }),
    ]);

    res.json({ totalUsers, totalOrgs, totalTasks, totalProjects, totalClients, recentUsers });
  } catch (err) {
    console.error('[SuperAdmin] stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── GET /api/super-admin/users ────────────────────────────────────────────────
router.get('/users', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    // Use raw SQL to avoid Prisma crashing on orphaned memberships (org deleted but membership remains)
    const users = await prisma.$queryRawUnsafe(`
      SELECT u.id, u.email, u.name, u.emailVerified, u.createdAt
      FROM User u
      ORDER BY u.createdAt DESC
    `);

    // Fetch memberships with org info separately (LEFT JOIN so orphans don't crash)
    const memberships = await prisma.$queryRawUnsafe(`
      SELECT m.userId, m.role, o.id AS orgId, o.name AS orgName, o.slug AS orgSlug
      FROM memberships m
      LEFT JOIN organizations o ON o.id = m.orgId
    `);

    // Fetch task counts
    const taskCounts = await prisma.$queryRawUnsafe(`
      SELECT userId, COUNT(*) AS count FROM macro_tasks GROUP BY userId
    `);
    const taskMap = {};
    taskCounts.forEach(t => { taskMap[t.userId] = Number(t.count); });

    // Group memberships by userId
    const memberMap = {};
    memberships.forEach(m => {
      if (!memberMap[m.userId]) memberMap[m.userId] = [];
      if (m.orgId) { // skip orphaned memberships where org was deleted
        memberMap[m.userId].push({ role: m.role, org: { id: m.orgId, name: m.orgName, slug: m.orgSlug } });
      }
    });

    const enriched = users.map(u => ({
      ...u,
      memberships: memberMap[u.id] || [],
      _count: { macroTasks: taskMap[u.id] || 0 },
    }));

    res.json({ users: enriched });
  } catch (err) {
    console.error('[SuperAdmin] users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ── GET /api/super-admin/orgs-detailed ───────────────────────────────────────
router.get('/orgs-detailed', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: {
          select: {
            memberships: true,
            macroTasks: true,
          },
        },
        memberships: {
          where: { role: 'OWNER' },
          select: {
            user: { select: { id: true, email: true, name: true } },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = orgs.map(o => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt,
      memberCount: o._count.memberships,
      taskCount: o._count.macroTasks,
      owner: o.memberships[0]?.user ?? null,
    }));

    res.json({ orgs: result });
  } catch (err) {
    console.error('[SuperAdmin] orgs-detailed error:', err);
    res.status(500).json({ error: 'Failed to fetch orgs' });
  }
});

// ── GET /api/super-admin/pending-owner-invites ───────────────────────────────
router.get('/pending-owner-invites', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const invites = await prisma.invite.findMany({
      where: { role: 'OWNER', status: 'PENDING' },
      include: { org: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ invites: invites.map(i => ({
      id: i.id,
      email: i.email,
      orgId: i.orgId,
      orgName: i.org?.name ?? '—',
      orgSlug: i.org?.slug ?? '—',
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      token: i.token,
    })) });
  } catch (err) {
    console.error('[SuperAdmin] pending-owner-invites error:', err);
    res.status(500).json({ error: 'Failed to fetch pending invites' });
  }
});

// ── POST /api/super-admin/invite ──────────────────────────────────────────────
// Body: { email, role?, orgId? } — orgId selects target org, defaults to Veblen
router.post('/invite', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { email, role = 'STAFF', name, orgId: targetOrgId } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!targetOrgId) return res.status(400).json({ error: 'Organization is required — select which org to invite to' });

    const org = await prisma.organization.findUnique({ where: { id: targetOrgId } });
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMembership = await prisma.membership.findUnique({
        where: { userId_orgId: { userId: existingUser.id, orgId: org.id } },
      });
      if (existingMembership) {
        return res.status(400).json({ error: `User is already a member of ${org.name}` });
      }
      await prisma.membership.create({
        data: { userId: existingUser.id, orgId: org.id, role },
      });
      return res.json({ success: true, message: `Existing user added to ${org.name}` });
    }

    // Create invitation record
    const invitation = await prisma.invite.create({
      data: {
        email,
        orgId: org.id,
        invitedById: req.user.id,
        role,
        token: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Send invite email
    try {
      const baseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || process.env.VITE_APP_URL || 'http://localhost:5173';
      const acceptUrl = `${baseUrl}/invite?token=${invitation.token}`;
      await sendInviteEmail(email, {
        orgName: org.name,
        role,
        invitedBy: 'EverSense Admin',
        acceptUrl,
        expiresIn: formatDuration(7 * 24 * 60),
      });
    } catch (emailErr) {
      console.warn('[SuperAdmin] invite email failed:', emailErr.message);
    }

    console.log(`[SuperAdmin] Invitation created for ${email} → ${org.name} as ${role} token=${invitation.token}`);
    res.json({ success: true, message: `Invitation sent to join ${org.name}`, invitationId: invitation.id, token: invitation.token });
  } catch (err) {
    console.error('[SuperAdmin] invite error:', err);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

// ── POST /api/super-admin/create-lead-account ────────────────────────────────
// Creates a new org + owner invitation (or membership if user already exists)
router.post('/create-lead-account', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { email, name, companyName } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!companyName) return res.status(400).json({ error: 'Company name required' });

    // Generate unique slug from company name
    let baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!baseSlug) baseSlug = 'org';
    let slug = baseSlug;
    let attempt = 1;
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++attempt}`;
    }

    // Create the organization
    const org = await prisma.organization.create({
      data: {
        name: companyName,
        slug,
        createdById: req.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // If user already exists, add OWNER membership; otherwise create invitation
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      await prisma.membership.create({
        data: { userId: existingUser.id, orgId: org.id, role: 'OWNER' },
      });
      // Send welcome email to existing user
      try {
        const { sendWelcomeEmail } = await import('../lib/mailer.js');
        const baseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:5173';
        await sendWelcomeEmail(email, {
          name: existingUser.name || email,
          orgName: companyName,
          role: 'Owner',
          dashboardUrl: `${baseUrl}/dashboard`,
        });
        console.log(`[SuperAdmin] Welcome email sent to existing user ${email}`);
      } catch (emailErr) {
        console.error('[SuperAdmin] Failed to send welcome email:', emailErr.message);
      }
      return res.json({ success: true, message: 'Existing user added as owner of new organization', orgId: org.id, slug });
    }

    const invitation = await prisma.invite.create({
      data: {
        email,
        orgId: org.id,
        invitedById: req.user.id,
        role: 'OWNER',
        token: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Send invite email
    try {
      const baseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || process.env.VITE_APP_URL || 'http://localhost:5173';
      console.log('[SuperAdmin] invite baseUrl:', baseUrl, '| APP_URL:', process.env.APP_URL);
      const acceptUrl = `${baseUrl}/invite?token=${invitation.token}`;
      await sendInviteEmail(email, {
        orgName: companyName,
        role: 'Owner',
        invitedBy: 'EverSense Admin',
        acceptUrl,
        expiresIn: formatDuration(7 * 24 * 60),
      });
      console.log(`[SuperAdmin] Lead invite email sent to ${email}`);
    } catch (emailErr) {
      console.error('[SuperAdmin] Failed to send lead invite email:', emailErr.message);
    }

    console.log(`[SuperAdmin] Lead account created: org=${slug} email=${email} token=${invitation.token}`);
    res.json({ success: true, message: 'Organization created and invitation sent', orgId: org.id, slug, token: invitation.token });
  } catch (err) {
    console.error('[SuperAdmin] create-lead-account error:', err);
    res.status(500).json({ error: 'Failed to create lead account' });
  }
});

// ── DELETE /api/super-admin/invites/:inviteId ─────────────────────────────────
router.delete('/invites/:inviteId', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { inviteId } = req.params;
    await prisma.invite.delete({ where: { id: inviteId } });
    res.json({ success: true });
  } catch (err) {
    console.error('[SuperAdmin] delete-invite error:', err);
    res.status(500).json({ error: 'Failed to delete invitation' });
  }
});

// ── DELETE /api/super-admin/users/:userId ─────────────────────────────────────
router.delete('/users/:userId', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete in dependency order
    await prisma.membership.deleteMany({ where: { userId } });
    await prisma.invite.deleteMany({ where: { invitedById: userId } });
    await prisma.user.delete({ where: { id: userId } });

    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error('[SuperAdmin] delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ── POST /api/super-admin/users/:userId/change-password ──────────────────────
router.post('/users/:userId/change-password', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { hashPassword } = await import('better-auth/crypto');
    const hashed = await hashPassword(password);

    // Update all credential-type accounts for this user
    const updated = await prisma.account.updateMany({
      where: { userId, providerId: { in: ['credential', 'email-password', 'email'] } },
      data: { password: hashed },
    });

    if (updated.count === 0) {
      return res.status(400).json({ error: 'No credential account found for this user — they may use Google sign-in only' });
    }

    console.log(`[SuperAdmin] Password changed for ${user.email} by ${req.user.email} (${updated.count} account(s) updated)`);
    res.json({ success: true, message: `Password updated for ${user.email}` });
  } catch (err) {
    console.error('[SuperAdmin] change-password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ── GET /api/super-admin/errors ───────────────────────────────────────────────
router.get('/errors', requireAuth, requireSuperAdminUser, (req, res) => {
  const { level, limit = 100 } = req.query;
  let logs = ERROR_LOG;
  if (level) logs = logs.filter(e => e.level === level);
  res.json({ errors: logs.slice(0, Number(limit)) });
});

// ── POST /api/super-admin/errors/clear ────────────────────────────────────────
router.post('/errors/clear', requireAuth, requireSuperAdminUser, (req, res) => {
  ERROR_LOG.length = 0;
  res.json({ success: true });
});

// ── POST /api/super-admin/run-daily-report ────────────────────────────────────
// Manually fire the 5pm per-person completion digest for today.
router.post('/run-daily-report', requireAuth, requireSuperAdminUser, async (_req, res) => {
  try {
    await runDailyPersonReportNow();
    res.json({ success: true, message: 'Daily report triggered. Check logs + inbox.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/super-admin/attendance-logs ──────────────────────────────────────
// List recent attendance logs across all orgs. Supports optional filters:
//   ?userId, ?orgId, ?email, ?limit (default 100, max 500)
router.get('/attendance-logs', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { userId, orgId, email } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit || '100'), 1), 500);

    const conds = [];
    const params = [];
    if (userId) { conds.push('al.userId = ?'); params.push(userId); }
    if (orgId)  { conds.push('al.orgId = ?');  params.push(orgId); }
    if (email)  { conds.push('LOWER(u.email) LIKE ?'); params.push(`%${String(email).toLowerCase()}%`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await prisma.$queryRawUnsafe(
      `SELECT al.id, al.userId, al.orgId, al.timeIn, al.timeOut, al.duration,
              al.breakDuration, al.notes, al.date, al.createdAt, al.updatedAt,
              u.name AS userName, u.email AS userEmail,
              o.name AS orgName
         FROM attendance_logs al
         LEFT JOIN \`User\` u ON u.id = al.userId
         LEFT JOIN organizations o ON o.id = al.orgId
         ${where}
         ORDER BY al.timeIn DESC
         LIMIT ${limit}`,
      ...params
    );
    res.json({ logs: rows });
  } catch (err) {
    console.error('[SuperAdmin] attendance-logs list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/super-admin/attendance-logs/:id ────────────────────────────────
// Edit timeIn / timeOut / breakDuration / notes. Recomputes duration from
// (timeOut - timeIn - breakDuration). breakDuration takes seconds, or the
// body may pass breakMinutes as a convenience.
router.patch('/attendance-logs/:id', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { timeIn, timeOut, breakDuration, breakMinutes, notes } = req.body || {};

    const rows = await prisma.$queryRawUnsafe(
      'SELECT id, timeIn, timeOut, breakDuration FROM attendance_logs WHERE id = ? LIMIT 1',
      id
    );
    if (!rows.length) return res.status(404).json({ error: 'Log not found' });
    const log = rows[0];

    const newTimeIn  = timeIn  !== undefined ? (timeIn  ? new Date(timeIn)  : null) : new Date(log.timeIn);
    const newTimeOut = timeOut !== undefined ? (timeOut ? new Date(timeOut) : null) : (log.timeOut ? new Date(log.timeOut) : null);

    if (!newTimeIn || isNaN(newTimeIn.getTime())) {
      return res.status(400).json({ error: 'Invalid timeIn' });
    }
    if (newTimeOut && (isNaN(newTimeOut.getTime()) || newTimeOut < newTimeIn)) {
      return res.status(400).json({ error: 'timeOut must be after timeIn' });
    }

    let newBreak;
    if (breakDuration !== undefined) {
      newBreak = Math.max(0, parseInt(breakDuration) || 0);
    } else if (breakMinutes !== undefined) {
      newBreak = Math.max(0, Math.floor(Number(breakMinutes) * 60));
    } else {
      newBreak = log.breakDuration || 0;
    }

    let duration = 0;
    if (newTimeOut) {
      const gross = Math.floor((newTimeOut.getTime() - newTimeIn.getTime()) / 1000);
      duration = Math.max(0, gross - newBreak);
    }

    if (notes !== undefined) {
      await prisma.$executeRawUnsafe(
        'UPDATE attendance_logs SET timeIn = ?, timeOut = ?, duration = ?, breakDuration = ?, notes = ?, updatedAt = NOW(3) WHERE id = ?',
        newTimeIn, newTimeOut, duration, newBreak, notes || null, id
      );
    } else {
      await prisma.$executeRawUnsafe(
        'UPDATE attendance_logs SET timeIn = ?, timeOut = ?, duration = ?, breakDuration = ?, updatedAt = NOW(3) WHERE id = ?',
        newTimeIn, newTimeOut, duration, newBreak, id
      );
    }

    console.log(`[SuperAdmin] ✏️ attendance log ${id} updated`);
    res.json({ success: true, duration, breakDuration: newBreak });
  } catch (err) {
    console.error('[SuperAdmin] attendance-logs patch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/super-admin/attendance-logs/:id ───────────────────────────────
router.delete('/attendance-logs/:id', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await prisma.$executeRawUnsafe(
      'DELETE FROM attendance_logs WHERE id = ?', id
    );
    if (Number(result) === 0) return res.status(404).json({ error: 'Log not found' });
    console.log(`[SuperAdmin] 🗑 deleted attendance log ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[SuperAdmin] attendance-logs DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/super-admin/tasks ────────────────────────────────────────────────
// List tasks across all orgs with primary user + org info. Supports filters:
//   ?email=substring  ?orgId=...  ?status=in_progress  ?title=substring
router.get('/tasks', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { email, orgId, status, title } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit || '200'), 1), 500);

    const conds = [];
    const params = [];
    if (orgId)  { conds.push('t.orgId = ?');                    params.push(orgId); }
    if (status) { conds.push('t.status = ?');                   params.push(status); }
    if (email)  { conds.push('LOWER(u.email) LIKE ?');          params.push(`%${String(email).toLowerCase()}%`); }
    if (title)  { conds.push('LOWER(t.title) LIKE ?');          params.push(`%${String(title).toLowerCase()}%`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const rows = await prisma.$queryRawUnsafe(
      `SELECT t.id, t.title, t.status, t.priority, t.actualHours, t.estimatedHours,
              t.userId, t.orgId, t.createdAt, t.updatedAt, t.dueDate, t.completedAt,
              u.name AS userName, u.email AS userEmail,
              o.name AS orgName,
              COALESCE((SELECT SUM(duration) FROM time_logs
                          WHERE taskId = t.id AND userId = t.userId AND duration > 0), 0) AS primaryUserSecs
         FROM macro_tasks t
         LEFT JOIN \`User\` u ON u.id = t.userId
         LEFT JOIN organizations o ON o.id = t.orgId
         ${where}
         ORDER BY t.updatedAt DESC
         LIMIT ${limit}`,
      ...params
    );
    res.json({ tasks: rows });
  } catch (err) {
    console.error('[SuperAdmin] tasks list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/super-admin/tasks/:id ──────────────────────────────────────────
// Edit task title, actualHours, and/or per-user hours (rewrites time_logs for
// a specified user on this task). All fields optional.
//   { title?, actualHours?, userHours?: { userId, hours } }
// userHours wipes the named user's existing time_logs rows for this task and
// inserts one row with duration = hours*3600. Loses session history but
// guarantees the user's per-user "My Hours" total matches the new value.
router.patch('/tasks/:id', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, actualHours, userHours } = req.body || {};

    const rows = await prisma.$queryRawUnsafe(
      'SELECT id, orgId FROM macro_tasks WHERE id = ? LIMIT 1',
      id
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    const task = rows[0];

    const sets = [];
    const params = [];
    if (title !== undefined) {
      const trimmed = String(title).trim();
      if (!trimmed) return res.status(400).json({ error: 'Title cannot be empty' });
      if (trimmed.length > 500) return res.status(400).json({ error: 'Title too long (max 500)' });
      sets.push('title = ?');
      params.push(trimmed);
    }
    if (actualHours !== undefined) {
      const n = Number(actualHours);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'actualHours must be a non-negative number' });
      sets.push('actualHours = ?');
      params.push(parseFloat(n.toFixed(2)));
    }

    if (sets.length > 0) {
      sets.push('updatedAt = NOW(3)');
      params.push(id);
      await prisma.$executeRawUnsafe(
        `UPDATE macro_tasks SET ${sets.join(', ')} WHERE id = ?`,
        ...params
      );
    }

    // Per-user time_logs rewrite (independent of the title/actualHours edits).
    if (userHours && typeof userHours === 'object') {
      const targetUserId = String(userHours.userId || '').trim();
      const hours = Number(userHours.hours);
      if (!targetUserId) return res.status(400).json({ error: 'userHours.userId required' });
      if (!Number.isFinite(hours) || hours < 0) return res.status(400).json({ error: 'userHours.hours must be a non-negative number' });

      // Confirm user exists
      const userRows = await prisma.$queryRawUnsafe(
        'SELECT id FROM `User` WHERE id = ? LIMIT 1', targetUserId
      );
      if (!userRows.length) return res.status(404).json({ error: 'User not found' });

      // Wipe + insert single row of the new duration
      await prisma.$executeRawUnsafe(
        'DELETE FROM time_logs WHERE taskId = ? AND userId = ?',
        id, targetUserId
      );
      if (hours > 0) {
        await prisma.$executeRawUnsafe(
          'INSERT INTO time_logs (id, taskId, userId, orgId, `begin`, `end`, duration, timezone, category, isBillable, createdAt, updatedAt) ' +
          'VALUES (UUID(), ?, ?, ?, NOW(3), NOW(3), ?, \'UTC\', \'manual-edit\', 0, NOW(3), NOW(3))',
          id, targetUserId, task.orgId, Math.round(hours * 3600)
        );
      }
      console.log(`[SuperAdmin] ✏️ task ${id} time_logs rewrite for user ${targetUserId} → ${hours}h`);
    }

    if (sets.length === 0 && !userHours) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[SuperAdmin] tasks patch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/super-admin/invoices/reset ──────────────────────────────────────
// Wipe invoice records. Scopes:
//   body: { orgId?, userId?, year?, month? }
//   - year+month → delete only invoices whose periodStart falls in that month
//   - year only  → delete only invoices in that calendar year
//   - no filter  → wipe ALL invoices across all orgs
router.post('/invoices/reset', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { orgId, userId, year, month } = req.body || {};
    const conds = [];
    const params = [];

    if (orgId)  { conds.push('orgId = ?');  params.push(orgId); }
    if (userId) { conds.push('userId = ?'); params.push(userId); }
    if (year) {
      const y = parseInt(year);
      if (!isNaN(y)) {
        const m = month != null ? parseInt(month) : null;
        if (m != null && !isNaN(m) && m >= 1 && m <= 12) {
          const start = new Date(Date.UTC(y, m - 1, 1));
          const end   = new Date(Date.UTC(y, m, 1));
          conds.push('periodStart >= ? AND periodStart < ?');
          params.push(start, end);
        } else {
          const start = new Date(Date.UTC(y, 0, 1));
          const end   = new Date(Date.UTC(y + 1, 0, 1));
          conds.push('periodStart >= ? AND periodStart < ?');
          params.push(start, end);
        }
      }
    }

    const countSql = `SELECT COUNT(*) AS c FROM invoices${conds.length ? ' WHERE ' + conds.join(' AND ') : ''}`;
    const countRows = await prisma.$queryRawUnsafe(countSql, ...params);
    const count = Number(countRows[0]?.c || 0);

    const delSql = `DELETE FROM invoices${conds.length ? ' WHERE ' + conds.join(' AND ') : ''}`;
    await prisma.$executeRawUnsafe(delSql, ...params);

    console.log(`[SuperAdmin] 🗑 Reset invoices: ${count} record(s) deleted. filters=${JSON.stringify({ orgId, userId, year, month })}`);
    res.json({ success: true, deleted: count });
  } catch (err) {
    console.error('[SuperAdmin] reset invoices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/super-admin/leaves/reset ────────────────────────────────────────
// Wipe leave records so balances reset. Scopes:
//   body: { orgId?, userId?, year?, keepPending? }
//   - orgId only → reset everyone in that org
//   - userId only → reset just that user (across all orgs)
//   - year (YYYY) → only delete leaves whose startDate falls in that calendar year
//   - keepPending=true → only wipe APPROVED/REJECTED, leave PENDING alone
// With no filter, deletes ALL leaves across all orgs (global reset).
router.post('/leaves/reset', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { orgId, userId, year, keepPending } = req.body || {};
    const conds = [];
    const params = [];

    if (orgId)  { conds.push('orgId = ?');  params.push(orgId); }
    if (userId) { conds.push('userId = ?'); params.push(userId); }
    if (year) {
      const y = parseInt(year);
      if (!isNaN(y)) {
        const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
        const end   = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0));
        conds.push('startDate >= ? AND startDate < ?');
        params.push(start, end);
      }
    }
    if (keepPending) {
      conds.push("status <> 'PENDING'");
    }

    // Count first so we can report what was deleted
    const countSql = `SELECT COUNT(*) AS c FROM leaves${conds.length ? ' WHERE ' + conds.join(' AND ') : ''}`;
    const countRows = await prisma.$queryRawUnsafe(countSql, ...params);
    const count = Number(countRows[0]?.c || 0);

    const delSql = `DELETE FROM leaves${conds.length ? ' WHERE ' + conds.join(' AND ') : ''}`;
    await prisma.$executeRawUnsafe(delSql, ...params);

    console.log(`[SuperAdmin] 🗑 Reset leaves: ${count} record(s) deleted. filters=${JSON.stringify({ orgId, userId, year, keepPending })}`);
    res.json({ success: true, deleted: count });
  } catch (err) {
    console.error('[SuperAdmin] reset leaves error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/super-admin/break-policies ───────────────────────────────────────
// Read-only — current break policy for every org (1800=30min, 3600=60min, null=default 30min).
router.get('/break-policies', requireAuth, requireSuperAdminUser, async (_req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT o.id, o.name, oi.value AS breakLimitSecs " +
      "FROM organizations o " +
      "LEFT JOIN org_integrations oi ON oi.orgId = o.id AND oi.`key` = 'break_limit_secs' " +
      "ORDER BY o.name"
    );
    res.json({
      orgs: rows.map(r => {
        const secs = r.breakLimitSecs == null ? 1800 : parseInt(r.breakLimitSecs);
        return { id: r.id, name: r.name, breakLimitSecs: secs, breakMinutes: Math.round(secs / 60) };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/super-admin/orgs/:orgId ──────────────────────────────────────
router.delete('/orgs/:orgId', requireAuth, requireSuperAdminUser, async (req, res) => {
  try {
    const { orgId } = req.params;

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.slug === 'veblen') {
      return res.status(400).json({ error: 'Cannot delete the primary Veblen organization' });
    }

    await prisma.membership.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });

    res.json({ success: true, message: 'Organization deleted' });
  } catch (err) {
    console.error('[SuperAdmin] delete org error:', err);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// ── Helper: parse sa_token from Cookie header ─────────────────────────────────
export function parseSaCookie(req) {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : null;
}

export default router;
