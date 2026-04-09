// backend/api/owner-admin.js
// Org-scoped admin panel for org owners (e.g. admin@veblengroup.com.au)
// Separate from the global super-admin (admin@eversense.ai)

import express from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/rbac.js';
import { sendInviteEmail, sendWelcomeEmail, formatDuration } from '../lib/mailer.js';

const router = express.Router();

// Middleware: require OWNER role in at least one org
async function requireOwner(req, res, next) {
  if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
  const ownership = await prisma.membership.findFirst({
    where: { userId: req.user.id, role: 'OWNER' },
    select: { orgId: true },
  });
  if (!ownership) return res.status(403).json({ error: 'Owner access required' });
  // Attach all org IDs: orgs where user is OWNER/ADMIN + orgs they created (lead accounts)
  const allOwned = await prisma.membership.findMany({
    where: { userId: req.user.id, role: { in: ['OWNER', 'ADMIN'] } },
    select: { orgId: true },
  });
  const createdOrgs = await prisma.organization.findMany({
    where: { createdById: req.user.id },
    select: { id: true },
  });
  const orgIdSet = new Set([...allOwned.map(m => m.orgId), ...createdOrgs.map(o => o.id)]);
  req.ownedOrgIds = [...orgIdSet];
  next();
}

// ── GET /api/owner-admin/check ──────────────────────────────────────────────
router.get('/check', requireAuth, async (req, res) => {
  const ownership = await prisma.membership.findFirst({
    where: { userId: req.user.id, role: 'OWNER' },
  });
  res.json({ isOwnerAdmin: !!ownership });
});

// ── GET /api/owner-admin/orgs — returns ALL organizations ───────────────────
router.get('/orgs', requireAuth, requireOwner, async (req, res) => {
  try {
    const orgs = await prisma.$queryRawUnsafe(
      `SELECT o.id, o.name, o.slug, o.createdAt, COUNT(m.id) AS memberCount
       FROM organizations o
       LEFT JOIN memberships m ON m.orgId = o.id
       GROUP BY o.id, o.name, o.slug, o.createdAt
       ORDER BY o.createdAt DESC`
    );
    res.json({ success: true, orgs: orgs.map(o => ({ ...o, memberCount: Number(o.memberCount) })) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// ── GET /api/owner-admin/users — returns ALL users across all orgs ──────────
router.get('/users', requireAuth, requireOwner, async (req, res) => {
  try {
    const members = await prisma.$queryRawUnsafe(
      `SELECT u.id, u.email, u.name, u.createdAt, m.role, o.id AS orgId, o.name AS orgName
       FROM memberships m
       JOIN User u ON u.id = m.userId
       JOIN organizations o ON o.id = m.orgId
       ORDER BY u.createdAt DESC`
    );
    res.json({ success: true, users: members });
  } catch (e) {
    console.error('[OwnerAdmin] users error:', e.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ── POST /api/owner-admin/invite ────────────────────────────────────────────
router.post('/invite', requireAuth, requireOwner, async (req, res) => {
  try {
    const { email, role = 'STAFF', orgId } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!orgId) return res.status(400).json({ error: 'Organization required' });
    if (!req.ownedOrgIds.includes(orgId)) return res.status(403).json({ error: 'You can only invite to your own organizations' });

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Check if already a member
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMembership = await prisma.membership.findUnique({
        where: { userId_orgId: { userId: existingUser.id, orgId } },
      });
      if (existingMembership) return res.status(400).json({ error: `Already a member of ${org.name}` });
      await prisma.membership.create({ data: { userId: existingUser.id, orgId, role } });
      try {
        await sendWelcomeEmail(email, { name: existingUser.name || email, orgName: org.name, role, dashboardUrl: `${process.env.APP_URL || 'https://eversense-ai.up.railway.app'}/dashboard` });
      } catch (_) {}
      return res.json({ success: true, message: `${email} added to ${org.name}` });
    }

    // New user — create invite
    const token = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await prisma.invite.create({
      data: { email, orgId, invitedById: req.user.id, role, token, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    try {
      const baseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || 'https://eversense-ai.up.railway.app';
      await sendInviteEmail(email, { orgName: org.name, role, invitedBy: req.user.name || req.user.email, acceptUrl: `${baseUrl}/invite?token=${token}`, expiresIn: formatDuration(7 * 24 * 60) });
    } catch (e) { console.warn('[OwnerAdmin] invite email failed:', e.message); }

    res.json({ success: true, message: `Invitation sent to ${email} for ${org.name}`, token });
  } catch (e) {
    console.error('[OwnerAdmin] invite error:', e.message);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// ── POST /api/owner-admin/create-lead ───────────────────────────────────────
router.post('/create-lead', requireAuth, requireOwner, async (req, res) => {
  try {
    const { email, name, companyName } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!companyName) return res.status(400).json({ error: 'Company name required' });

    let baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!baseSlug) baseSlug = 'org';
    let slug = baseSlug;
    let attempt = 1;
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++attempt}`;
    }

    const org = await prisma.organization.create({
      data: { name: companyName, slug, createdById: req.user.id, createdAt: new Date(), updatedAt: new Date() },
    });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      await prisma.membership.create({ data: { userId: existingUser.id, orgId: org.id, role: 'OWNER' } });
      try {
        await sendWelcomeEmail(email, { name: existingUser.name || email, orgName: companyName, role: 'Owner', dashboardUrl: `${process.env.APP_URL || 'https://eversense-ai.up.railway.app'}/dashboard` });
      } catch (_) {}
      return res.json({ success: true, message: `${email} added as owner of ${companyName}`, orgId: org.id });
    }

    const token = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await prisma.invite.create({
      data: { email, orgId: org.id, invitedById: req.user.id, role: 'OWNER', token, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    try {
      const baseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || 'https://eversense-ai.up.railway.app';
      await sendInviteEmail(email, { orgName: companyName, role: 'Owner', invitedBy: req.user.name || 'Admin', acceptUrl: `${baseUrl}/invite?token=${token}`, expiresIn: formatDuration(7 * 24 * 60) });
    } catch (e) { console.warn('[OwnerAdmin] lead invite email failed:', e.message); }

    console.log(`[OwnerAdmin] Lead created: ${companyName} for ${email} by ${req.user.email}`);
    res.json({ success: true, message: `Lead account created for ${companyName}`, orgId: org.id, token });
  } catch (e) {
    console.error('[OwnerAdmin] create-lead error:', e.message);
    res.status(500).json({ error: 'Failed to create lead account' });
  }
});

export default router;
