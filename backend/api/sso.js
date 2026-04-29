// backend/api/sso.js — Outbound SSO redirects to sister services.
// Generates a short-lived HMAC-signed token containing the user's email so
// the destination service (HRSense) can verify the user without password
// exchange. Uses the same INTERNAL_API_SECRET as the webhook layer.

import express from 'express';
import crypto from 'crypto';
import { requireAuth, withOrgScope } from '../lib/rbac.js';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// Restrict who can SSO into HRSense. ACCOUNTANT-only per product call.
const SSO_ROLES = new Set(['ACCOUNTANT']);

// 5 min token lifetime — long enough for the browser hop, short enough that
// an intercepted token can't be replayed later.
const TOKEN_TTL_SECS = 5 * 60;

function sign(payloadB64) {
  const secret = process.env.INTERNAL_API_SECRET || '';
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
}

function makeToken(payload) {
  const json = JSON.stringify(payload);
  const payloadB64 = Buffer.from(json, 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

// Derive HRSense base URL — prefer explicit HRSENSE_URL, fall back to the
// origin of HRSENSE_WEBHOOK_URL so we don't need a second env var.
function getHRSenseBaseUrl() {
  if (process.env.HRSENSE_URL) return process.env.HRSENSE_URL.replace(/\/$/, '');
  const webhook = process.env.HRSENSE_WEBHOOK_URL;
  if (webhook) {
    try {
      const u = new URL(webhook);
      return `${u.protocol}//${u.host}`;
    } catch { return null; }
  }
  return null;
}

// ── GET /api/sso/hrsense — generate token + 302 to HRSense ───────────────────
// Browser-friendly redirect. Frontend just sets window.location to this URL
// and the user lands on HRSense logged in.
router.get('/hrsense', requireAuth, withOrgScope, async (req, res) => {
  try {
    if (!process.env.INTERNAL_API_SECRET) {
      return res.status(503).send('SSO not configured (INTERNAL_API_SECRET missing)');
    }
    const hrsenseBase = getHRSenseBaseUrl();
    if (!hrsenseBase) {
      return res.status(503).send('SSO not configured (set HRSENSE_URL or HRSENSE_WEBHOOK_URL)');
    }
    // Look up the user's role on the current org. withOrgScope set req.orgId
    // but not the role — fetch from memberships.
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, orgId: req.orgId },
      select: { role: true },
    });
    const role = membership?.role || null;
    if (!role || !SSO_ROLES.has(role)) {
      return res.status(403).send('SSO to HRSense not allowed for this role');
    }
    const token = makeToken({
      email: req.user.email,
      userId: req.user.id,
      orgId: req.orgId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECS,
    });
    // HR-Sense mounts the SSO receiver at /api/auth/sso (not /sso, which is
    // the SPA which 404s for unmatched routes and sends the user to login).
    const target = `${hrsenseBase}/api/auth/sso?token=${encodeURIComponent(token)}`;
    return res.redirect(302, target);
  } catch (e) {
    console.error('[SSO] hrsense error:', e);
    return res.status(500).send('SSO error');
  }
});

export default router;
