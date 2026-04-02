/**
 * External REST API — /api/ext
 *
 * Authentication: Authorization: Bearer es_<your-api-key>
 * All actions are performed as the user who owns the API key.
 *
 * Endpoints:
 *   GET    /api/ext/me               — Who am I?
 *   GET    /api/ext/clock/status     — Current clock-in status
 *   POST   /api/ext/clock/in         — Clock in
 *   POST   /api/ext/clock/out        — Clock out
 *   GET    /api/ext/tasks            — List my tasks
 *   POST   /api/ext/tasks            — Create a task
 *   PATCH  /api/ext/tasks/:id        — Edit a task
 *   POST   /api/ext/tasks/:id/assign — Add / replace assignees
 */

import express from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { broadcast } from '../lib/sse.js';

const router = express.Router();

// All routes require API key
router.use(apiKeyAuth);

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

async function resolveOrgId(userId) {
  const row = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { orgId: true },
  });
  return row?.orgId || null;
}

// Reject users with no organisation
router.use(async (req, res, next) => {
  const orgId = req.orgId || await resolveOrgId(req.user.id);
  if (!orgId) {
    return res.status(403).json({
      error: 'No organisation found for this user',
      code: 'NO_ORG',
      message: 'This API key belongs to a user who is not a member of any organisation.',
    });
  }
  req.orgId = orgId;
  next();
});

// ─── GET /api/ext/me ──────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const orgId = req.orgId || await resolveOrgId(req.user.id);
    const membership = orgId
      ? await prisma.membership.findUnique({
          where: { userId_orgId: { userId: req.user.id, orgId } },
          select: { role: true },
        })
      : null;

    res.json({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      orgId,
      role: membership?.role || null,
      apiKeyName: req.apiKeyName,
    });
  } catch (err) {
    console.error('[ext] /me error:', err);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// ─── GET /api/ext/users — search org members by email or name ─────────────────
// Query: ?email=x or ?name=x or ?q=x (searches both)
router.get('/users', async (req, res) => {
  try {
    const { email, name, q } = req.query;
    const orgId = req.orgId;

    let where = 'WHERE m.orgId = ?';
    const params = [orgId];

    if (email) {
      where += ' AND u.email LIKE ?';
      params.push(`%${email}%`);
    } else if (name) {
      where += ' AND u.name LIKE ?';
      params.push(`%${name}%`);
    } else if (q) {
      where += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }

    const users = await prisma.$queryRawUnsafe(
      `SELECT u.id, u.name, u.email, m.role
       FROM User u
       JOIN memberships m ON m.userId = u.id
       ${where}
       ORDER BY u.name ASC
       LIMIT 50`,
      ...params
    );

    res.json({ users, total: users.length });
  } catch (err) {
    console.error('[ext] /users error:', err);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// ─── POST /api/ext/users/:userId/set-role — change a user's role ─────────────
// Body: { "role": "STAFF" | "ADMIN" | "OWNER" | "CLIENT" | "HALL_OF_JUSTICE" }
// Requires caller to be ADMIN or higher
router.post('/users/:userId/set-role', async (req, res) => {
  try {
    const orgId = req.orgId;
    const { userId } = req.params;
    const { role } = req.body;

    const validRoles = ['OWNER', 'ADMIN', 'STAFF', 'CLIENT', 'HALL_OF_JUSTICE'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    }

    // Check caller is ADMIN or higher
    const callerMembership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: req.user.id, orgId } },
      select: { role: true },
    });
    if (!['OWNER', 'ADMIN', 'HALL_OF_JUSTICE'].includes(callerMembership?.role)) {
      return res.status(403).json({ error: 'Only admins and owners can change roles' });
    }

    // Check target user exists in org
    const targetMembership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!targetMembership) {
      return res.status(404).json({ error: 'User not found in this organisation' });
    }

    // Prevent changing OWNER/HALL_OF_JUSTICE roles
    if (['OWNER', 'HALL_OF_JUSTICE'].includes(targetMembership.role)) {
      return res.status(403).json({ error: 'Cannot change owner role' });
    }

    await prisma.membership.update({
      where: { userId_orgId: { userId, orgId } },
      data: { role },
    });

    console.log(`[ext] ✅ Role changed: ${targetMembership.user?.email} → ${role} by ${req.user.email}`);
    res.json({
      message: 'Role updated',
      userId,
      email: targetMembership.user?.email,
      previousRole: targetMembership.role,
      newRole: role,
    });
  } catch (err) {
    console.error('[ext] set-role error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ─── GET /api/ext/clock/status ────────────────────────────────────────────────
router.get('/clock/status', async (req, res) => {
  try {
    const orgId = req.orgId || await resolveOrgId(req.user.id);
    if (!orgId) return res.status(400).json({ error: 'No organisation found for this user' });

    const active = await prisma.attendanceLog.findFirst({
      where: { userId: req.user.id, orgId, timeOut: null },
      orderBy: { timeIn: 'desc' },
    });

    res.json({
      clockedIn: !!active,
      timeIn: active?.timeIn || null,
      logId: active?.id || null,
      elapsedSeconds: active
        ? Math.floor((Date.now() - new Date(active.timeIn).getTime()) / 1000)
        : 0,
    });
  } catch (err) {
    console.error('[ext] clock/status error:', err);
    res.status(500).json({ error: 'Failed to get clock status' });
  }
});

// ─── POST /api/ext/clock/in ───────────────────────────────────────────────────
router.post('/clock/in', async (req, res) => {
  try {
    const orgId = req.orgId || await resolveOrgId(req.user.id);
    if (!orgId) return res.status(400).json({ error: 'No organisation found for this user' });

    const existing = await prisma.attendanceLog.findFirst({
      where: { userId: req.user.id, orgId, timeOut: null },
    });
    if (existing) {
      return res.status(400).json({
        error: 'Already clocked in',
        timeIn: existing.timeIn,
        logId: existing.id,
      });
    }

    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `INSERT INTO attendance_logs (id, userId, orgId, timeIn, duration, breakDuration, notes, date, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, NOW(3), NOW(3))`,
      id, req.user.id, orgId, now, req.body.notes || null, todayStr()
    );

    console.log(`[ext] ✅ Clock in: ${req.user.email} via API key "${req.apiKeyName}"`);
    broadcast(orgId, 'attendance', { action: 'clock-in', userId: req.user.id });

    res.status(201).json({ message: 'Clocked in successfully', logId: id, timeIn: now });
  } catch (err) {
    console.error('[ext] clock/in error:', err);
    res.status(500).json({ error: 'Failed to clock in' });
  }
});

// ─── POST /api/ext/clock/out ──────────────────────────────────────────────────
router.post('/clock/out', async (req, res) => {
  try {
    const orgId = req.orgId || await resolveOrgId(req.user.id);
    if (!orgId) return res.status(400).json({ error: 'No organisation found for this user' });

    const active = await prisma.attendanceLog.findFirst({
      where: { userId: req.user.id, orgId, timeOut: null },
      orderBy: { timeIn: 'desc' },
    });

    if (!active) {
      return res.status(400).json({ error: 'Not currently clocked in' });
    }

    const now = new Date();
    const grossDuration = Math.floor((now.getTime() - new Date(active.timeIn).getTime()) / 1000);
    const breakDuration = Math.max(0, parseInt(req.body.breakDuration) || 0);
    const duration = Math.max(0, grossDuration - breakDuration);

    await prisma.$executeRawUnsafe(
      `UPDATE attendance_logs SET timeOut=?, duration=?, breakDuration=?, notes=?, updatedAt=NOW(3) WHERE id=?`,
      now, duration, breakDuration, req.body.notes || active.notes, active.id
    );

    console.log(`[ext] ✅ Clock out: ${req.user.email} via API key "${req.apiKeyName}", net ${Math.round(duration / 60)}min`);
    broadcast(orgId, 'attendance', { action: 'clock-out', userId: req.user.id });

    res.json({
      message: 'Clocked out successfully',
      logId: active.id,
      timeIn: active.timeIn,
      timeOut: now,
      durationSeconds: duration,
      durationHours: Math.round((duration / 3600) * 100) / 100,
    });
  } catch (err) {
    console.error('[ext] clock/out error:', err);
    res.status(500).json({ error: 'Failed to clock out' });
  }
});

// ─── GET /api/ext/tasks ───────────────────────────────────────────────────────
// Returns tasks where the API key owner is the assignee or creator.
router.get('/tasks', async (req, res) => {
  try {
    const orgId = req.orgId || await resolveOrgId(req.user.id);
    if (!orgId) return res.status(400).json({ error: 'No organisation found for this user' });

    const { status, limit = 50, offset = 0 } = req.query;

    // Find tasks assigned to this user
    const assigneeRows = await prisma.$queryRawUnsafe(
      `SELECT taskId FROM task_assignees WHERE userId = ?`,
      req.user.id
    ).catch(() => []);
    const assignedIds = assigneeRows.map(r => r.taskId);

    const where = {
      orgId,
      OR: [
        { userId: req.user.id },
        { createdBy: req.user.id },
        ...(assignedIds.length ? [{ id: { in: assignedIds } }] : []),
      ],
    };
    if (status) where.status = status;

    const [tasks, total] = await Promise.all([
      prisma.macroTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit), 100),
        skip: parseInt(offset),
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          dueDate: true,
          estimatedHours: true,
          actualHours: true,
          category: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
          createdBy: true,
          project: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.macroTask.count({ where }),
    ]);

    res.json({ total, limit: parseInt(limit), offset: parseInt(offset), tasks });
  } catch (err) {
    console.error('[ext] GET /tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ─── POST /api/ext/tasks ──────────────────────────────────────────────────────
router.post('/tasks', async (req, res) => {
  try {
    const orgId = req.orgId || await resolveOrgId(req.user.id);
    if (!orgId) return res.status(400).json({ error: 'No organisation found for this user' });

    const {
      title,
      description,
      priority = 'Medium',
      status = 'not_started',
      estimatedHours = 0,
      dueDate,
      projectId,
      tags,
      assigneeIds,  // optional: array of user IDs to assign
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    let category = 'General';
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      }).catch(() => null);
      if (project) category = `Project: ${project.name}`;
    }

    const task = await prisma.macroTask.create({
      data: {
        title: title.trim(),
        description: description || null,
        userId: req.user.id,
        orgId,
        createdBy: req.user.id,
        priority,
        status,
        estimatedHours: parseFloat(estimatedHours) || 0,
        category,
        projectId: projectId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: tags || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    // Store assignees (default to creator if none provided)
    const ids = Array.isArray(assigneeIds) && assigneeIds.length > 0
      ? assigneeIds
      : [req.user.id];

    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM task_assignees WHERE taskId = ?`,
        task.id
      );
      for (const uid of ids) {
        await prisma.$executeRawUnsafe(
          `INSERT IGNORE INTO task_assignees (taskId, userId, orgId) VALUES (?, ?, ?)`,
          task.id, uid, orgId
        );
      }
    } catch (_) {}

    console.log(`[ext] ✅ Task created: "${task.title}" by ${req.user.email} via API key "${req.apiKeyName}"`);
    res.status(201).json({ message: 'Task created', task });
  } catch (err) {
    console.error('[ext] POST /tasks error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// ─── PATCH /api/ext/tasks/:id ─────────────────────────────────────────────────
router.patch('/tasks/:id', async (req, res) => {
  try {
    const orgId = req.orgId || await resolveOrgId(req.user.id);
    if (!orgId) return res.status(400).json({ error: 'No organisation found for this user' });

    const task = await prisma.macroTask.findUnique({
      where: { id: req.params.id },
      select: { id: true, orgId: true, userId: true, createdBy: true },
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.orgId !== orgId) return res.status(403).json({ error: 'Task belongs to a different organisation' });

    // Only the assignee, creator, or an admin can edit
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: req.user.id, orgId } },
      select: { role: true },
    });
    const isPrivileged = ['OWNER', 'ADMIN', 'HALL_OF_JUSTICE'].includes(membership?.role);
    const isInvolved = task.userId === req.user.id || task.createdBy === req.user.id;

    if (!isPrivileged && !isInvolved) {
      // Also check task_assignees
      const assigned = await prisma.$queryRawUnsafe(
        `SELECT 1 FROM task_assignees WHERE taskId = ? AND userId = ? LIMIT 1`,
        task.id, req.user.id
      ).catch(() => []);
      if (!assigned.length) {
        return res.status(403).json({ error: 'You are not assigned to this task' });
      }
    }

    const allowed = ['title', 'description', 'status', 'priority', 'estimatedHours', 'dueDate', 'tags', 'projectId', 'category'];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'dueDate') {
          data[key] = req.body[key] ? new Date(req.body[key]) : null;
        } else if (key === 'estimatedHours') {
          data[key] = parseFloat(req.body[key]) || 0;
        } else {
          data[key] = req.body[key];
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const updated = await prisma.macroTask.update({
      where: { id: task.id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    console.log(`[ext] ✅ Task updated: "${updated.title}" by ${req.user.email} via API key "${req.apiKeyName}"`);
    res.json({ message: 'Task updated', task: updated });
  } catch (err) {
    console.error('[ext] PATCH /tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ─── POST /api/ext/tasks/:id/assign ──────────────────────────────────────────
// Body: { assigneeIds: ["userId1", "userId2"] }
// Use replace: true to overwrite existing assignees (default: add/merge)
router.post('/tasks/:id/assign', async (req, res) => {
  try {
    const orgId = req.orgId || await resolveOrgId(req.user.id);
    if (!orgId) return res.status(400).json({ error: 'No organisation found for this user' });

    const { assigneeIds, replace = false } = req.body;
    if (!Array.isArray(assigneeIds) || assigneeIds.length === 0) {
      return res.status(400).json({ error: 'assigneeIds (array) is required' });
    }

    const task = await prisma.macroTask.findUnique({
      where: { id: req.params.id },
      select: { id: true, orgId: true, title: true },
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.orgId !== orgId) return res.status(403).json({ error: 'Task belongs to a different organisation' });

    // Verify all assigneeIds are org members
    const members = await prisma.membership.findMany({
      where: { orgId, userId: { in: assigneeIds } },
      select: { userId: true },
    });
    const validIds = new Set(members.map(m => m.userId));
    const invalid = assigneeIds.filter(id => !validIds.has(id));
    if (invalid.length) {
      return res.status(400).json({ error: `These users are not org members: ${invalid.join(', ')}` });
    }

    if (replace) {
      await prisma.$executeRawUnsafe(`DELETE FROM task_assignees WHERE taskId = ?`, task.id).catch(() => {});
    }

    for (const uid of assigneeIds) {
      await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO task_assignees (taskId, userId, orgId) VALUES (?, ?, ?)`,
        task.id, uid, orgId
      ).catch(() => {});
    }

    // Update primary userId if replacing
    if (replace && assigneeIds.length > 0) {
      await prisma.macroTask.update({
        where: { id: task.id },
        data: { userId: assigneeIds[0] },
      }).catch(() => {});
    }

    console.log(`[ext] ✅ Assignees updated for "${task.title}" by ${req.user.email} via API key "${req.apiKeyName}"`);
    res.json({ message: 'Assignees updated', taskId: task.id, assigneeIds });
  } catch (err) {
    console.error('[ext] POST /tasks/:id/assign error:', err);
    res.status(500).json({ error: 'Failed to update assignees' });
  }
});

export default router;
