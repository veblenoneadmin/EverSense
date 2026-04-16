import express from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, withOrgScope } from '../lib/rbac.js';

const router = express.Router();

// Fields that can be saved
const FIELDS = [
  // Employee Information
  'legalName', 'streetAddress', 'city', 'state', 'postcode', 'country',
  'homePhone', 'cellPhone', 'emailAddress', 'sssId', 'dateOfBirth',
  'maritalStatus', 'spouseName', 'spouseEmployer', 'spouseWorkPhone',
  // Job Information
  'jobTitle', 'supervisor', 'client', 'workEmail', 'workCellPhone',
  'startDate', 'salary', 'employmentType',
  // Emergency Contact
  'emergencyContactName', 'emergencyContactAddress',
  'emergencyContactPhone', 'emergencyContactCell', 'emergencyContactRelation',
  // Bank Details
  'bankName', 'accountNumber', 'wiseUsername',
  // References
  'ref1Name', 'ref1Phone', 'ref1Relationship',
  'ref2Name', 'ref2Phone', 'ref2Relationship',
  'ref3Name', 'ref3Phone', 'ref3Relationship',
  // Valid ID
  'validIdUrl', 'validIdFilename',
];

function pick(body) {
  const data = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  return data;
}

// ── GET /api/employee-profiles/me — current user's own profile ───────────────
router.get('/me', requireAuth, withOrgScope, async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT * FROM employee_profiles WHERE userId = ? AND orgId = ? LIMIT 1',
      req.user.id, req.orgId
    );
    res.json({ profile: rows[0] || null });
  } catch (err) {
    console.error('[EmployeeProfiles] GET /me error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ── PUT /api/employee-profiles/me — update own profile ───────────────────────
router.put('/me', requireAuth, withOrgScope, async (req, res) => {
  try {
    const data = pick(req.body);
    const existing = await prisma.$queryRawUnsafe(
      'SELECT id FROM employee_profiles WHERE userId = ? AND orgId = ? LIMIT 1',
      req.user.id, req.orgId
    );

    if (existing.length > 0) {
      const sets = Object.keys(data).map(k => `\`${k}\` = ?`).join(', ');
      const vals = Object.values(data);
      await prisma.$executeRawUnsafe(
        `UPDATE employee_profiles SET ${sets}, updatedAt = NOW(3) WHERE id = ?`,
        ...vals, existing[0].id
      );
    } else {
      const id = randomUUID();
      const cols = ['id', 'userId', 'orgId', ...Object.keys(data)];
      const placeholders = cols.map(() => '?').join(', ');
      await prisma.$executeRawUnsafe(
        `INSERT INTO employee_profiles (${cols.map(c => '`' + c + '`').join(', ')}) VALUES (${placeholders})`,
        id, req.user.id, req.orgId, ...Object.values(data)
      );
    }

    // Return updated profile
    const rows = await prisma.$queryRawUnsafe(
      'SELECT * FROM employee_profiles WHERE userId = ? AND orgId = ? LIMIT 1',
      req.user.id, req.orgId
    );
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error('[EmployeeProfiles] PUT /me error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── GET /api/employee-profiles/all — admin/accountant view of all profiles ───
router.get('/all', requireAuth, withOrgScope, async (req, res) => {
  try {
    // Check role — only OWNER, ADMIN, HALL_OF_JUSTICE, ACCOUNTANT can view all
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: req.user.id, orgId: req.orgId } },
      select: { role: true },
    });
    const role = membership?.role || 'STAFF';
    if (!['OWNER', 'ADMIN', 'HALL_OF_JUSTICE', 'ACCOUNTANT'].includes(role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const profiles = await prisma.$queryRawUnsafe(`
      SELECT ep.*, u.name AS userName, u.email AS userEmail, m.role AS userRole
      FROM employee_profiles ep
      JOIN User u ON u.id = ep.userId
      JOIN memberships m ON m.userId = ep.userId AND m.orgId = ep.orgId
      WHERE ep.orgId = ?
      ORDER BY u.name ASC
    `, req.orgId);

    res.json({ profiles });
  } catch (err) {
    console.error('[EmployeeProfiles] GET /all error:', err);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

export default router;
