// Task management API endpoints
import express from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, withOrgScope, requireTaskOwnership } from '../lib/rbac.js';
import { requireAuthOrApiKey } from '../middleware/apiKeyAuth.js';
import { validateBody, validateQuery, commonSchemas, taskSchemas } from '../lib/validation.js';
import { createNotification } from './notifications.js';
import { broadcast } from '../lib/sse.js';
const router = express.Router();

// ── Lazy active_timers table init ─────────────────────────────────────────────
let activeTimersTableReady = false;
async function ensureActiveTimersTable() {
  if (activeTimersTableReady) return;
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `active_timers` (' +
      '  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(36) NOT NULL,' +
      '  `taskId` VARCHAR(50) NOT NULL, `orgId` VARCHAR(191) NOT NULL,' +
      '  `startedAt` DATETIME(3) NOT NULL,' +
      '  PRIMARY KEY (`id`),' +
      '  UNIQUE KEY `at_user_org_key` (`userId`,`orgId`),' +
      '  KEY `at_orgId_idx` (`orgId`), KEY `at_taskId_idx` (`taskId`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    activeTimersTableReady = true;
  } catch (_) { activeTimersTableReady = true; }
}

// ── Lazy task_assignees table init ────────────────────────────────────────────
let assigneesTableReady = false;
async function ensureAssigneesTable() {
  if (assigneesTableReady) return;
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `task_assignees` (' +
      '  `id` VARCHAR(191) NOT NULL, `taskId` VARCHAR(50) NOT NULL,' +
      '  `userId` VARCHAR(36) NOT NULL, `orgId` VARCHAR(191) NOT NULL,' +
      '  PRIMARY KEY (`id`),' +
      '  UNIQUE KEY `ta_task_user_key` (`taskId`,`userId`),' +
      '  KEY `ta_taskId_idx` (`taskId`), KEY `ta_userId_idx` (`userId`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
  } catch (_) {}
  // Add per-assignee status column
  try {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE task_assignees ADD COLUMN `status` VARCHAR(20) NULL"
    );
  } catch (_) {} // already exists
  assigneesTableReady = true;
}

// ── Lazy task_checklist_items table + team task columns ────────────────────────
let teamTaskSchemaReady = false;
async function ensureTeamTaskSchema() {
  if (teamTaskSchemaReady) return;
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `task_checklist_items` (' +
      '  `id` VARCHAR(191) NOT NULL, `taskId` VARCHAR(50) NOT NULL,' +
      '  `assigneeId` VARCHAR(36) NOT NULL, `orgId` VARCHAR(191) NOT NULL,' +
      '  `title` VARCHAR(500) NOT NULL DEFAULT \'My part\',' +
      '  `completed` TINYINT(1) NOT NULL DEFAULT 0,' +
      '  `completedAt` DATETIME(3) NULL, `completedBy` VARCHAR(36) NULL,' +
      '  `sortOrder` INT NOT NULL DEFAULT 0,' +
      '  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      '  PRIMARY KEY (`id`),' +
      '  KEY `tci_taskId_idx` (`taskId`),' +
      '  KEY `tci_assigneeId_idx` (`assigneeId`),' +
      '  KEY `tci_orgId_idx` (`orgId`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
  } catch (_) {}
  // Add isTeamTask column to macro_tasks if not exists
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE macro_tasks ADD COLUMN `isTeamTask` TINYINT(1) NOT NULL DEFAULT 0'
    );
  } catch (_) {}
  // Add mainAssigneeId column to macro_tasks if not exists
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE macro_tasks ADD COLUMN `mainAssigneeId` VARCHAR(36) NULL'
    );
  } catch (_) {}
  // Add parentTaskId column to macro_tasks if not exists
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE macro_tasks ADD COLUMN `parentTaskId` VARCHAR(50) NULL'
    );
  } catch (_) {}
  teamTaskSchemaReady = true;
}

// ── Lazy recurring task columns ──────────────────────────────────────────────
let recurringSchemaReady = false;
export async function ensureRecurringTaskSchema() {
  if (recurringSchemaReady) return;
  // recurringPattern: 'daily' | 'weekly' | 'biweekly' | 'monthly' | null
  try {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE macro_tasks ADD COLUMN `recurringPattern` VARCHAR(20) NULL"
    );
  } catch (_) {}
  // recurringConfig: JSON blob with dayOfWeek, dayOfMonth, endDate, etc.
  try {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE macro_tasks ADD COLUMN `recurringConfig` JSON NULL"
    );
  } catch (_) {}
  // nextRecurrenceDate: when the next copy should be created
  try {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE macro_tasks ADD COLUMN `nextRecurrenceDate` DATETIME(3) NULL"
    );
  } catch (_) {}
  // recurringParentId: points back to the original recurring template task
  try {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE macro_tasks ADD COLUMN `recurringParentId` VARCHAR(50) NULL"
    );
  } catch (_) {}
  // Index for the scheduler query
  try {
    await prisma.$executeRawUnsafe(
      "CREATE INDEX `mt_nextRecurrence_idx` ON macro_tasks (`nextRecurrenceDate`)"
    );
  } catch (_) {}
  recurringSchemaReady = true;
}

// ── Lazy task_status_reports table ────────────────────────────────────────────
let statusReportsTableReady = false;
async function ensureStatusReportsTable() {
  if (statusReportsTableReady) return;
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `task_status_reports` (' +
      '  `id` VARCHAR(191) NOT NULL,' +
      '  `taskId` VARCHAR(50) NOT NULL,' +
      '  `userId` VARCHAR(36) NOT NULL,' +
      '  `orgId` VARCHAR(191) NOT NULL,' +
      '  `fromStatus` VARCHAR(20) NOT NULL,' +
      '  `toStatus` VARCHAR(20) NOT NULL,' +
      '  `report` TEXT NOT NULL,' +
      '  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      '  PRIMARY KEY (`id`),' +
      '  KEY `tsr_taskId_idx` (`taskId`),' +
      '  KEY `tsr_userId_idx` (`userId`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    statusReportsTableReady = true;
  } catch (_) { statusReportsTableReady = true; }
}

// ── Replace all assignees for a task ─────────────────────────────────────────
async function setTaskAssignees(taskId, orgId, assigneeIds) {
  if (!Array.isArray(assigneeIds)) return;
  await ensureAssigneesTable();
  await prisma.$executeRawUnsafe('DELETE FROM task_assignees WHERE taskId = ?', taskId);
  for (const uid of assigneeIds) {
    try {
      await prisma.$executeRawUnsafe(
        'INSERT IGNORE INTO task_assignees (id, taskId, userId, orgId) VALUES (?, ?, ?, ?)',
        randomUUID(), taskId, uid, orgId
      );
    } catch (_) {}
  }
}

// ── GET /api/tasks/members — org members for assignee picker ─────────────────
router.get('/members', requireAuth, withOrgScope, async (req, res) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { orgId: req.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    res.json({
      members: memberships.map(m => ({
        id:    m.user.id,
        name:  m.user.name,
        email: m.user.email,
        role:  m.role,
      })),
    });
  } catch (err) {
    console.error('[Tasks] members error:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// ── GET /api/tasks/active-timers — org-wide active timers for admin ──────────
router.get('/active-timers', requireAuth, withOrgScope, async (req, res) => {
  await ensureActiveTimersTable();
  try {
    const timers = await prisma.$queryRawUnsafe(
      'SELECT at.userId, at.taskId, UNIX_TIMESTAMP(at.startedAt)*1000 AS startedAt, u.name ' +
      'FROM active_timers at JOIN `User` u ON u.id = at.userId WHERE at.orgId = ?',
      req.orgId
    );
    res.json({ timers: timers.map(t => ({ ...t, startedAt: Number(t.startedAt) })) });
  } catch (e) {
    console.error('[Tasks] active-timers error:', e);
    res.status(500).json({ error: 'Failed to fetch active timers' });
  }
});

// ── POST /api/tasks/timer/start — record that current user started a timer ───
router.post('/timer/start', requireAuth, withOrgScope, async (req, res) => {
  const { taskId, startedAt } = req.body;
  if (!taskId) return res.status(400).json({ error: 'taskId required' });
  await ensureActiveTimersTable();
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO active_timers (id, userId, taskId, orgId, startedAt) VALUES (?, ?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE taskId = VALUES(taskId), startedAt = VALUES(startedAt)',
      randomUUID(), req.user.id, taskId, req.orgId, new Date(startedAt || Date.now())
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[Tasks] timer/start error:', e);
    res.status(500).json({ error: 'Failed to save timer' });
  }
});

// ── POST /api/tasks/timer/stop — clear current user's active timer ────────────
// Optional body { taskId, beganAt, endedAt, duration } — when present, also
// insert a per-user time_logs row so we can build contribution breakdowns.
// All fields are optional so existing clients that just POST `{}` keep working.
router.post('/timer/stop', requireAuth, withOrgScope, async (req, res) => {
  await ensureActiveTimersTable();
  try {
    await prisma.$executeRawUnsafe(
      'DELETE FROM active_timers WHERE userId = ? AND orgId = ?',
      req.user.id, req.orgId
    );

    const { taskId, beganAt, endedAt, duration } = req.body || {};
    if (taskId && beganAt && duration != null && Number(duration) > 0) {
      try {
        await prisma.$executeRawUnsafe(
          'INSERT INTO time_logs (id, taskId, userId, orgId, `begin`, `end`, duration, category, createdAt, updatedAt) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))',
          randomUUID(), taskId, req.user.id, req.orgId,
          new Date(beganAt), new Date(endedAt || Date.now()),
          Math.floor(Number(duration)), 'work'
        );
      } catch (e) { console.warn('[Tasks] timer/stop time_log insert failed:', e.message); }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[Tasks] timer/stop error:', e);
    res.status(500).json({ error: 'Failed to clear timer' });
  }
});

// ── GET /api/tasks/:taskId/contributions — per-user time spent on a task ────
// Lists every assignee (primary + co-assignees) with their time_logs total.
// Assignees who haven't stopped a timer yet or never timed appear with
// seconds = 0. Stopped sessions stay in time_logs forever so totals persist.
router.get('/:taskId/contributions', requireAuth, withOrgScope, async (req, res) => {
  try {
    const { taskId } = req.params;
    await ensureAssigneesTable();

    // 1) All assignees: primary userId + co-assignees from task_assignees.
    const taskRow = await prisma.macroTask.findUnique({
      where: { id: taskId },
      select: { userId: true, orgId: true },
    });
    if (!taskRow || taskRow.orgId !== req.orgId) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const coRows = await prisma.$queryRawUnsafe(
      'SELECT userId FROM task_assignees WHERE taskId = ? AND orgId = ?',
      taskId, req.orgId
    ).catch(() => []);
    const assigneeIds = [...new Set([taskRow.userId, ...coRows.map(r => r.userId)].filter(Boolean))];
    if (assigneeIds.length === 0) {
      return res.json({ contributions: [] });
    }

    // 2) Total seconds per user from time_logs.
    const logRows = await prisma.$queryRawUnsafe(
      'SELECT userId, SUM(duration) AS secs FROM time_logs ' +
      'WHERE taskId = ? AND orgId = ? AND duration > 0 GROUP BY userId',
      taskId, req.orgId
    ).catch(() => []);
    const secondsByUser = new Map(logRows.map(r => [r.userId, Number(r.secs || 0)]));

    // 3) User details for each assignee.
    const users = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // 4) Compose + sort by seconds desc (zero-time assignees last).
    const contributions = assigneeIds
      .map(uid => {
        const u = userMap.get(uid);
        return {
          userId: uid,
          name:   u?.name || u?.email || 'Unknown',
          email:  u?.email || '',
          seconds: secondsByUser.get(uid) || 0,
        };
      })
      .sort((a, b) => b.seconds - a.seconds);

    res.json({ contributions });
  } catch (e) {
    console.error('[Tasks] contributions error:', e);
    res.status(500).json({ error: 'Failed to load contributions' });
  }
});

// Get tasks (main endpoint)
router.get('/', requireAuth, withOrgScope, validateQuery(commonSchemas.pagination), async (req, res) => {
  try {
    const { orgId, userId, status, priority, projectId, limit = 200, offset: offsetParam, skip: skipParam } = req.query;
    const offset = parseInt(skipParam) || parseInt(offsetParam) || 0;

    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }

    console.log('📋 Fetching tasks:', { orgId, userId, status, priority, projectId, limit, offset });

    const where = { orgId };

    // Apply filters — normalize "open" to all non-completed/cancelled statuses
    if (status) {
      if (status === 'open') {
        where.status = { notIn: ['completed', 'cancelled'] };
      } else {
        where.status = status;
      }
    }
    if (priority) where.priority = priority;
    if (userId) where.userId = userId;
    if (projectId) where.projectId = projectId;

    // Role-based task visibility
    const callerMembership = await prisma.membership.findFirst({
      where: { userId: req.user.id, orgId }
    });
    const callerRole = callerMembership?.role;

    if (callerRole === 'CLIENT') {
      // CLIENT: restrict to tasks from their assigned projects only
      let clientRows = [];
      try {
        clientRows = await prisma.$queryRawUnsafe(
          `SELECT id FROM clients WHERE user_id = ? AND orgId = ? LIMIT 1`,
          req.user.id, orgId
        );
      } catch (e) {
        // user_id column may not exist yet, fall back to email lookup
        const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } });
        if (userRecord?.email) {
          clientRows = await prisma.$queryRawUnsafe(
            `SELECT id FROM clients WHERE email = ? AND orgId = ? LIMIT 1`,
            userRecord.email, orgId
          );
        }
      }
      let clientProjectIds = [];
      if (clientRows.length > 0) {
        const projects = await prisma.project.findMany({
          where: { clientId: clientRows[0].id, orgId },
          select: { id: true }
        });
        clientProjectIds = projects.map(p => p.id);
      }
      where.projectId = { in: clientProjectIds.length > 0 ? clientProjectIds : ['__none__'] };
    } else if (userId && callerRole !== 'CLIENT') {
      // ADMIN/OWNER with userId filter — also include tasks where they're a multi-assignee
      let assigneeTaskIds = [];
      try {
        await ensureAssigneesTable();
        const rows = await prisma.$queryRawUnsafe(
          `SELECT taskId FROM task_assignees WHERE userId = ? AND orgId = ?`,
          userId, orgId
        );
        assigneeTaskIds = rows.map(r => r.taskId);
      } catch (_) {}
      if (assigneeTaskIds.length > 0) {
        delete where.userId;
        where.OR = [{ userId }, { id: { in: assigneeTaskIds } }];
      }
    }

    // Exclude completed tasks older than 7 days (expired)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    where.NOT = {
      AND: [
        { status: 'completed' },
        {
          OR: [
            { completedAt: { lt: sevenDaysAgo } },
            // tasks with no completedAt (completed before column existed) — fall back to updatedAt
            { AND: [{ completedAt: null }, { updatedAt: { lt: sevenDaysAgo } }] }
          ]
        }
      ]
    };

    const tasks = await prisma.macroTask.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' }
      ],
      take: parseInt(limit),
      skip: offset,
    });

    const total = await prisma.macroTask.count({ where });

    console.log(`✅ Found ${tasks.length} tasks for orgId: ${orgId}`);

    // Format tasks (no include: — enrich user/project separately to avoid collation issues)
    const formattedTasks = tasks.map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours || 0,
      dueDate: task.dueDate,
      assignee: null,
      project: null,
      projectId: task.projectId,
      projectColor: null,
      projectStatus: null,
      isBillable: false,
      hourlyRate: 0,
      tags: task.tags ? (Array.isArray(task.tags) ? task.tags : []) : [],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      userId: task.userId,
      createdBy: task.createdBy || null,
      createdByName: null,
      assignees: [],
      isTeamTask: !!(task.isTeamTask),
      mainAssigneeId: task.mainAssigneeId || null,
      parentTaskId: task.parentTaskId || null,
      milestoneId: null,
      milestoneName: null,
      milestoneStatus: null,
      checklistTotal: 0,
      checklistDone: 0,
    }));

    if (formattedTasks.length > 0) {
      const taskIds = formattedTasks.map(t => t.id);
      const ph = taskIds.map(() => '?').join(',');

      // Fetch extra columns added via raw ALTER TABLE (not in Prisma schema)
      try {
        await ensureTeamTaskSchema();
        const extraRows = await prisma.$queryRawUnsafe(
          `SELECT id, isTeamTask, mainAssigneeId, parentTaskId, milestoneId FROM macro_tasks WHERE id IN (${ph})`,
          ...taskIds
        );
        const extraMap = {};
        for (const r of extraRows) extraMap[r.id] = r;
        for (const t of formattedTasks) {
          const ex = extraMap[t.id];
          if (ex) {
            t.isTeamTask = !!(ex.isTeamTask);
            t.mainAssigneeId = ex.mainAssigneeId || null;
            t.parentTaskId = ex.parentTaskId || null;
            t.milestoneId = ex.milestoneId || null;
          }
        }
      } catch (_) {}

      // Enrich primary assignee names via raw SQL (avoids collation JOIN issues)
      try {
        const userIds = [...new Set(formattedTasks.map(t => t.userId).filter(Boolean))];
        if (userIds.length) {
          const uph = userIds.map(() => '?').join(',');
          const users = await prisma.$queryRawUnsafe(
            `SELECT id, name, email FROM User WHERE id IN (${uph})`, ...userIds
          );
          const uMap = {};
          for (const u of users) uMap[u.id] = u;
          for (const t of formattedTasks) {
            const u = uMap[t.userId];
            if (u) t.assignee = u.name;
          }
        }
      } catch (_) {}

      // Enrich project names via raw SQL
      try {
        const projectIds = [...new Set(formattedTasks.map(t => t.projectId).filter(Boolean))];
        if (projectIds.length) {
          const pph = projectIds.map(() => '?').join(',');
          const projects = await prisma.$queryRawUnsafe(
            `SELECT id, name, color, status FROM projects WHERE id IN (${pph})`, ...projectIds
          );
          const pMap = {};
          for (const p of projects) pMap[p.id] = p;
          for (const t of formattedTasks) {
            const p = pMap[t.projectId];
            if (p) { t.project = p.name; t.projectColor = p.color; t.projectStatus = p.status; }
          }
        }
      } catch (_) {}

      // Enrich creator names
      try {
        const creatorIds = [...new Set(formattedTasks.map(t => t.createdBy).filter(Boolean))];
        if (creatorIds.length) {
          const cph = creatorIds.map(() => '?').join(',');
          const creators = await prisma.$queryRawUnsafe(
            `SELECT id, name FROM User WHERE id IN (${cph})`, ...creatorIds
          );
          const cMap = {};
          for (const c of creators) cMap[c.id] = c;
          for (const t of formattedTasks) {
            const c = cMap[t.createdBy];
            if (c) t.createdByName = c.name;
          }
        }
      } catch (_) {}

      // Batch-fetch multi-assignees (with per-assignee status)
      // Split into two queries to avoid JOIN collation issues between task_assignees and User
      try {
        await ensureAssigneesTable();
        const assigneeRows = await prisma.$queryRawUnsafe(
          `SELECT taskId, userId, status as assigneeStatus FROM task_assignees WHERE taskId IN (${ph})`,
          ...taskIds
        );

        // Fetch user info separately
        const userIds = [...new Set(assigneeRows.map(r => r.userId))];
        const userMap = {};
        if (userIds.length > 0) {
          try {
            const users = await prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, name: true, email: true, image: true },
            });
            for (const u of users) userMap[u.id] = u;
          } catch (e) {
            console.error('[tasks] user fetch for assignees failed:', e.message);
          }
        }

        const aMap = {};
        const assigneeStatusMap = {}; // taskId -> { userId -> status }
        for (const r of assigneeRows) {
          const u = userMap[r.userId] || { id: r.userId, name: null, email: null, image: null };
          if (!aMap[r.taskId]) aMap[r.taskId] = [];
          aMap[r.taskId].push({ id: r.userId, name: u.name, email: u.email, image: u.image || null });
          if (!assigneeStatusMap[r.taskId]) assigneeStatusMap[r.taskId] = {};
          if (r.assigneeStatus) assigneeStatusMap[r.taskId][r.userId] = r.assigneeStatus;
        }
        for (const t of formattedTasks) t.assignees = aMap[t.id] || [];

        // Override task status with per-assignee status for the current user
        // (only for multi-assignee tasks where this user has a personal status set)
        for (const t of formattedTasks) {
          const taskAssignees = aMap[t.id] || [];
          if (taskAssignees.length > 1) {
            const myStatus = assigneeStatusMap[t.id]?.[req.user.id];
            if (myStatus) t.status = myStatus;
          }
        }
      } catch (e) {
        console.error('[tasks] multi-assignee fetch error:', e.message);
      }

      // Batch-fetch sub-task progress + assignees for team tasks
      try {
        await ensureTeamTaskSchema();
        const teamTaskIds = formattedTasks.filter(t => t.isTeamTask).map(t => t.id);
        if (teamTaskIds.length > 0) {
          const tph = teamTaskIds.map(() => '?').join(',');
          // Progress counts
          const subTaskRows = await prisma.$queryRawUnsafe(
            `SELECT parentTaskId, COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done FROM macro_tasks WHERE parentTaskId IN (${tph}) GROUP BY parentTaskId`,
            ...teamTaskIds
          );
          for (const r of subTaskRows) {
            const t = formattedTasks.find(x => x.id === r.parentTaskId);
            if (t) { t.checklistTotal = Number(r.total); t.checklistDone = Number(r.done); }
          }
          // Sub-task assignees — replace the parent's assignees list with team members
          const subAssigneeRows = await prisma.$queryRawUnsafe(
            `SELECT mt.parentTaskId, mt.userId, u.name, u.email, u.image FROM macro_tasks mt JOIN \`User\` u ON u.id = mt.userId WHERE mt.parentTaskId IN (${tph})`,
            ...teamTaskIds
          );
          const subAMap = {};
          for (const r of subAssigneeRows) {
            if (!subAMap[r.parentTaskId]) subAMap[r.parentTaskId] = [];
            if (!subAMap[r.parentTaskId].some(x => x.id === r.userId)) {
              subAMap[r.parentTaskId].push({ id: r.userId, name: r.name, email: r.email, image: r.image || null });
            }
          }
          for (const t of formattedTasks) {
            if (t.isTeamTask && subAMap[t.id]) t.assignees = subAMap[t.id];
          }
        }
      } catch (_) {}

      // Enrich milestone names + status
      try {
        const msIds = [...new Set(formattedTasks.map(t => t.milestoneId).filter(Boolean))];
        if (msIds.length) {
          const msph = msIds.map(() => '?').join(',');
          const milestones = await prisma.$queryRawUnsafe(
            `SELECT id, name, status FROM project_milestones WHERE id IN (${msph})`,
            ...msIds
          );
          const msMap = {};
          for (const m of milestones) msMap[m.id] = m;
          for (const t of formattedTasks) {
            const ms = msMap[t.milestoneId];
            if (ms) {
              t.milestoneName = ms.name;
              t.milestoneStatus = ms.status;
            }
          }
        }
      } catch (_) {}
    }

    res.json({
      success: true,
      tasks: formattedTasks,
      total
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

// Get recent tasks
router.get('/recent', requireAuth, withOrgScope, validateQuery(commonSchemas.pagination), async (req, res) => {
  try {
    const { orgId, userId, limit = 10 } = req.query;
    
    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }
    
    // Role-based task visibility for recent tasks
    let recentWhere = { orgId, ...(userId ? { userId } : {}) };
    const recentMembership = await prisma.membership.findFirst({
      where: { userId: req.user.id, orgId }
    });
    const recentRole = recentMembership?.role;

    if (recentRole === 'CLIENT') {
      let clientRows = [];
      try {
        clientRows = await prisma.$queryRawUnsafe(
          `SELECT id FROM clients WHERE user_id = ? AND orgId = ? LIMIT 1`,
          req.user.id, orgId
        );
      } catch (e) {
        const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } });
        if (userRecord?.email) {
          clientRows = await prisma.$queryRawUnsafe(
            `SELECT id FROM clients WHERE email = ? AND orgId = ? LIMIT 1`,
            userRecord.email, orgId
          );
        }
      }
      let clientProjectIds = [];
      if (clientRows.length > 0) {
        const projects = await prisma.project.findMany({
          where: { clientId: clientRows[0].id, orgId },
          select: { id: true }
        });
        clientProjectIds = projects.map(p => p.id);
      }
      recentWhere.projectId = { in: clientProjectIds.length > 0 ? clientProjectIds : ['__none__'] };
    } else if (recentRole === 'STAFF') {
      // STAFF: only see tasks assigned to them
      delete recentWhere.userId;
      let staffAssigneeTaskIds = [];
      try {
        await ensureAssigneesTable();
        const rows = await prisma.$queryRawUnsafe(
          `SELECT taskId FROM task_assignees WHERE userId = ? AND orgId = ?`,
          req.user.id, orgId
        );
        staffAssigneeTaskIds = rows.map(r => r.taskId);
      } catch (_) {}
      recentWhere.OR = [
        { userId: req.user.id },
        ...(staffAssigneeTaskIds.length > 0 ? [{ id: { in: staffAssigneeTaskIds } }] : [])
      ];
    }

    // EMERGENCY FIX: Remove relations causing collation mismatch
    const tasks = await prisma.macroTask.findMany({
      where: recentWhere,
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' }
      ],
      take: parseInt(limit)
    });
    
    // EMERGENCY FIX: Simplify to avoid collation issues
    const tasksWithStats = tasks.map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      category: task.category,
      dueDate: task.dueDate,
      lastWorked: null, // Will fix later after database collation issue is resolved
      totalTime: 0, // Will fix later after database collation issue is resolved
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      completedAt: task.completedAt
    }));
    
    res.json({
      success: true,
      tasks: tasksWithStats,
      total: tasksWithStats.length
    });
  } catch (error) {
    console.error('Error fetching recent tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recent tasks' });
  }
});

// Get comment + attachment counts for all tasks in an org (batch)
router.get('/counts', requireAuth, withOrgScope, async (req, res) => {
  try {
    const { orgId } = req.query;
    if (!orgId) return res.status(400).json({ error: 'orgId is required' });

    const [commentRows, attachmentRows] = await Promise.all([
      prisma.$queryRawUnsafe(
        'SELECT taskId, COUNT(*) as count FROM task_comments WHERE orgId = ? GROUP BY taskId',
        orgId
      ),
      prisma.$queryRawUnsafe(
        'SELECT taskId, COUNT(*) as count FROM task_attachments WHERE orgId = ? GROUP BY taskId',
        orgId
      ),
    ]);

    const counts = {};
    for (const row of commentRows) {
      if (!counts[row.taskId]) counts[row.taskId] = { comments: 0, attachments: 0 };
      counts[row.taskId].comments = Number(row.count);
    }
    for (const row of attachmentRows) {
      if (!counts[row.taskId]) counts[row.taskId] = { comments: 0, attachments: 0 };
      counts[row.taskId].attachments = Number(row.count);
    }

    res.json({ success: true, counts });
  } catch (error) {
    console.error('Error fetching task counts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch counts' });
  }
});

// Get task details
router.get('/:taskId', requireAuth, withOrgScope, requireTaskOwnership, async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const task = await prisma.macroTask.findUnique({
      where: { id: taskId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        org: {
          select: {
            id: true,
            name: true
          }
        },
        timeLogs: {
          select: {
            id: true,
            begin: true,
            end: true,
            duration: true,
            description: true,
            category: true
          },
          orderBy: {
            begin: 'desc'
          }
        }
      }
    });
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Calculate total time worked
    const totalTime = task.timeLogs
      .filter(log => log.end !== null)
      .reduce((sum, log) => sum + log.duration, 0);
    
    // Get last worked time
    const lastWorked = task.timeLogs.length > 0 ? task.timeLogs[0].begin : null;
    
    const taskDetails = {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      category: task.category,
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      lastWorked: lastWorked,
      totalTime: totalTime,
      assignedTo: task.user,
      organization: task.org,
      tags: task.tags,
      timeLogs: task.timeLogs,
      parentTaskId: null,
      subtasks: [],
    };

    // Fetch parentTaskId and subtasks via raw SQL (column not in Prisma schema)
    try {
      await ensureTeamTaskSchema();
      const [parentRow] = await prisma.$queryRawUnsafe(
        'SELECT parentTaskId FROM macro_tasks WHERE id = ?', taskId
      );
      taskDetails.parentTaskId = parentRow?.parentTaskId || null;

      const subtaskRows = await prisma.$queryRawUnsafe(
        `SELECT id, title, status, priority, userId, createdAt
         FROM macro_tasks WHERE parentTaskId = ? ORDER BY createdAt ASC`,
        taskId
      );
      taskDetails.subtasks = subtaskRows;
    } catch (_) {}

    res.json(taskDetails);
  } catch (error) {
    console.error('Error fetching task details:', error);
    res.status(500).json({ error: 'Failed to fetch task details' });
  }
});

// ── GET /api/tasks/:taskId/subtasks ───────────────────────────────────────────
router.get('/:taskId/subtasks', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTeamTaskSchema();
    const subtasks = await prisma.$queryRawUnsafe(
      `SELECT mt.id, mt.title, mt.status, mt.priority, mt.dueDate,
              mt.estimatedHours, mt.actualHours, mt.userId, mt.createdAt,
              u.name as assigneeName
       FROM macro_tasks mt
       LEFT JOIN User u ON u.id = mt.userId
       WHERE mt.parentTaskId = ? AND mt.orgId = ?
       ORDER BY mt.createdAt ASC`,
      req.params.taskId, req.orgId
    );
    res.json({ subtasks, total: subtasks.length });
  } catch (err) {
    console.error('[tasks] subtasks error:', err);
    res.status(500).json({ error: 'Failed to fetch subtasks' });
  }
});

// Create new task
router.post('/', requireAuthOrApiKey, withOrgScope, validateBody(taskSchemas.create), async (req, res) => {
  try {
    const {
      title,
      description,
      userId,
      orgId,
      priority = 'Medium',
      status = 'not_started',
      estimatedHours = 0,
      category = 'General',
      projectId,
      dueDate,
      tags
    } = req.body;

    if (!title || !userId || !orgId) {
      return res.status(400).json({ error: 'title, userId, and orgId are required' });
    }
    
    // If projectId is provided, fetch project name for category
    let taskCategory = category;
    if (projectId) {
      try {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true }
        });
        if (project) {
          taskCategory = `Project: ${project.name}`;
        }
      } catch (error) {
        console.error('Error fetching project for task creation:', error);
      }
    }

    const task = await prisma.macroTask.create({
      data: {
        title,
        description,
        userId,
        orgId,
        createdBy: userId,
        priority,
        status,
        estimatedHours: parseFloat(estimatedHours),
        category: taskCategory,
        projectId: projectId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: tags || null
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true,
            status: true
          }
        }
      }
    });
    
    console.log(`✅ Created new task: ${title}`);

    // Store parentTaskId if provided (field not in Prisma schema — use raw SQL)
    const { parentTaskId } = req.body;
    if (parentTaskId) {
      await ensureTeamTaskSchema();
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET parentTaskId = ? WHERE id = ?',
        parentTaskId, task.id
      ).catch(() => {});
    }

    // Store recurring task fields if provided
    const { recurringPattern, recurringConfig } = req.body;
    if (recurringPattern) {
      await ensureRecurringTaskSchema();
      // Compute first nextRecurrenceDate from now (or dueDate if set)
      const startFrom = dueDate ? new Date(dueDate) : new Date();
      const configObj = recurringConfig || {};
      // Set dayOfWeek/dayOfMonth defaults from the start date
      if (recurringPattern === 'weekly' || recurringPattern === 'biweekly') {
        if (configObj.dayOfWeek == null) configObj.dayOfWeek = startFrom.getUTCDay();
      }
      if (recurringPattern === 'monthly') {
        if (configObj.dayOfMonth == null) configObj.dayOfMonth = Math.min(startFrom.getUTCDate(), 28);
      }
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET recurringPattern = ?, recurringConfig = ?, nextRecurrenceDate = ? WHERE id = ?',
        recurringPattern,
        JSON.stringify(configObj),
        startFrom,
        task.id
      ).catch(e => console.error('[Tasks] recurring fields error:', e.message));
    }

    // Store multi-assignees
    const assigneeIds = Array.isArray(req.body.assigneeIds) && req.body.assigneeIds.length > 0
      ? req.body.assigneeIds
      : (userId ? [userId] : []);
    await setTaskAssignees(task.id, orgId, assigneeIds);

    // Save checklist items (for non-team tasks) — simple checkable list
    const { checklistItems: createChecklistItems } = req.body;
    if (Array.isArray(createChecklistItems) && createChecklistItems.length > 0) {
      try {
        await ensureTeamTaskSchema(); // creates task_checklist_items table if missing
        for (let i = 0; i < createChecklistItems.length; i++) {
          const it = createChecklistItems[i];
          if (!it?.title) continue;
          await prisma.$executeRawUnsafe(
            'INSERT INTO task_checklist_items (id, taskId, assigneeId, orgId, title, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
            randomUUID(), task.id, req.user.id, orgId, it.title, it.sortOrder ?? i
          );
        }
        console.log(`📝 Created ${createChecklistItems.length} checklist item(s) for task ${task.id}`);
      } catch (e) { console.error('❌ [Tasks] checklist create error:', e.message); }
    }

    // Create sub-tasks as real MacroTask records (appear on each member's board)
    const { isTeamTask, mainAssigneeId, subTasks } = req.body;
    if (isTeamTask && Array.isArray(subTasks) && subTasks.length > 0) {
      await ensureTeamTaskSchema();
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET isTeamTask = 1, mainAssigneeId = ? WHERE id = ?',
        mainAssigneeId || null, task.id
      );
      const creator = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } }).catch(() => null);
      for (const sub of subTasks) {
        if (!sub.title || !sub.assigneeId) continue;
        // Create real sub-task
        const subTask = await prisma.macroTask.create({
          data: {
            title: sub.title,
            description: sub.description || null,
            userId: sub.assigneeId,
            orgId,
            createdBy: req.user.id,
            priority,
            status: 'not_started',
            estimatedHours: 0,
            category: taskCategory,
            projectId: projectId || null,
            dueDate: dueDate ? new Date(dueDate) : null,
            tags: null,
          },
        });
        // Set parentTaskId via raw SQL
        await prisma.$executeRawUnsafe(
          'UPDATE macro_tasks SET parentTaskId = ? WHERE id = ?',
          task.id, subTask.id
        );
        // Add assignee record
        await setTaskAssignees(subTask.id, orgId, [sub.assigneeId]);
        // Notify assignee
        if (sub.assigneeId !== req.user.id) {
          createNotification({
            userId: sub.assigneeId,
            orgId,
            title: `New Sub-task: ${sub.title}`,
            body: `Assigned to you by ${creator?.name || 'a team member'} as part of "${title}".`,
            type: 'task',
            link: '/tasks',
          });
        }
      }
    } else if (isTeamTask) {
      await ensureTeamTaskSchema();
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET isTeamTask = 1, mainAssigneeId = ? WHERE id = ?',
        mainAssigneeId || null, task.id
      );
    }

    // Notify all assignees (excluding the creator)
    if (assigneeIds.length > 0) {
      const creator = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
      for (const assigneeId of assigneeIds) {
        if (assigneeId !== req.user.id) {
          createNotification({
            userId: assigneeId,
            orgId,
            title: `New Task Assigned: ${title}`,
            body: `Assigned to you by ${creator?.name || 'a team member'}${task.project ? ` in "${task.project.name}"` : ''}.`,
            type: 'task',
            link: '/tasks',
          });
        }
      }
    }

    broadcast(req.orgId, 'task', { action: 'create', taskId: task.id, userId: req.user.id });

    res.status(201).json({
      task: task,
      message: 'Task created successfully'
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task (PUT)
router.put('/:taskId', requireAuth, withOrgScope, requireTaskOwnership, async (req, res) => {
  try {
    const { taskId } = req.params;
    // Capture team-task fields BEFORE mutating req.body via `updates` alias.
    const putIsTeamTask = req.body.isTeamTask;
    const putMainAssigneeId = req.body.mainAssigneeId;
    const putChecklistItems = req.body.checklistItems;
    const updates = req.body;

    console.log('🔄 Task update request:', {
      taskId,
      updates: JSON.stringify(updates, null, 2),
      userId: req.user?.id,
      orgId: req.orgId
    });
    
    // Remove fields that shouldn't be updated directly
    const newAssigneeIds = updates.assigneeIds;
    const putParentTaskId = updates.parentTaskId;
    delete updates.id;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.createdBy;
    delete updates.assigneeIds;
    delete updates.isTeamTask;
    delete updates.mainAssigneeId;
    delete updates.checklistItems;
    delete updates.parentTaskId; // not in Prisma schema — handle via raw SQL below

    // Handle date fields
    if (updates.dueDate !== undefined) {
      updates.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    }
    if (updates.completedAt) {
      updates.completedAt = new Date(updates.completedAt);
    }

    // Handle numeric fields
    if (updates.estimatedHours !== undefined) {
      updates.estimatedHours = typeof updates.estimatedHours === 'number' ? updates.estimatedHours : parseFloat(updates.estimatedHours) || 0;
    }
    if (updates.actualHours !== undefined) {
      updates.actualHours = typeof updates.actualHours === 'number' ? updates.actualHours : parseFloat(updates.actualHours) || 0;
    }

    // Handle projectId - store it in database and also update category for compatibility
    if (updates.projectId !== undefined) {
      if (updates.projectId) {
        try {
          const project = await prisma.project.findUnique({
            where: { id: updates.projectId },
            select: { name: true }
          });
          if (project) {
            updates.category = `Project: ${project.name}`;
            // Keep projectId - it IS a valid database field
          }
        } catch (error) {
          console.error('Error fetching project for task update:', error);
        }
      } else {
        updates.category = 'General';
        updates.projectId = null; // Set to null for no project
      }
    }

    const task = await prisma.macroTask.update({
      where: { id: taskId },
      data: updates,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true,
            status: true
          }
        }
      }
    });

    // Replace assignees if provided (empty array clears all)
    if (Array.isArray(newAssigneeIds)) {
      await setTaskAssignees(taskId, req.orgId, newAssigneeIds);
    }

    // Handle parentTaskId (not in Prisma schema — raw SQL)
    if (putParentTaskId !== undefined) {
      await ensureTeamTaskSchema();
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET parentTaskId = ? WHERE id = ?',
        putParentTaskId || null, taskId
      ).catch(() => {});
    }

    // Handle team task fields (captured before delete mutated req.body)
    if (putIsTeamTask !== undefined) {
      await ensureTeamTaskSchema();
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET isTeamTask = ?, mainAssigneeId = ? WHERE id = ?',
        putIsTeamTask ? 1 : 0, putMainAssigneeId || null, taskId
      );
    }
    // Checklist items: save whenever the array is provided (regardless of team task)
    if (Array.isArray(putChecklistItems)) {
      await ensureTeamTaskSchema();
      await prisma.$executeRawUnsafe('DELETE FROM task_checklist_items WHERE taskId = ?', taskId);
      for (let i = 0; i < putChecklistItems.length; i++) {
        const item = putChecklistItems[i];
        if (!item?.title) continue;
        await prisma.$executeRawUnsafe(
          'INSERT INTO task_checklist_items (id, taskId, assigneeId, orgId, title, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
          randomUUID(), taskId, item.assigneeId || req.user.id, req.orgId, item.title, i
        );
      }
    }

    console.log(`📝 Updated task ${taskId}`);

    // Notify new assignees if task was reassigned
    const notifyIds = Array.isArray(newAssigneeIds) ? newAssigneeIds : (updates.userId ? [updates.userId] : []);
    if (notifyIds.length > 0) {
      const updater = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
      for (const uid of notifyIds) {
        if (uid !== req.user.id) {
          createNotification({
            userId: uid,
            orgId: req.orgId,
            title: `Task Assigned to You: ${task.title}`,
            body: `Assigned by ${updater?.name || 'a team member'}${task.project ? ` (${task.project.name})` : ''}.`,
            type: 'task',
            link: '/tasks',
          });
        }
      }
    }

    broadcast(req.orgId, 'task', { action: 'update', taskId: task.id, userId: req.user.id });

    res.json({
      task: task,
      message: 'Task updated successfully'
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Update task (PATCH - same as PUT for compatibility)
router.patch('/:taskId', requireAuth, withOrgScope, requireTaskOwnership, async (req, res) => {
  try {
    const { taskId } = req.params;
    // Capture team-task fields BEFORE mutating req.body via `updates` alias.
    const patchIsTeamTask = req.body.isTeamTask;
    const patchMainAssigneeId = req.body.mainAssigneeId;
    const patchChecklistItems = req.body.checklistItems;
    const updates = req.body;

    console.log('🔄 Task PATCH request:', {
      taskId,
      updates: JSON.stringify(updates, null, 2),
      userId: req.user?.id,
      orgId: req.orgId
    });

    // Remove fields that shouldn't be updated directly
    const newAssigneeIdsPatch = updates.assigneeIds;
    const newParentTaskId = updates.parentTaskId; // handle via raw SQL below
    delete updates.id;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.createdBy;
    delete updates.assigneeIds;
    delete updates.isTeamTask;
    delete updates.mainAssigneeId;
    delete updates.checklistItems;
    delete updates.parentTaskId; // not in Prisma schema — must not be passed to update()

    // Handle date fields
    if (updates.dueDate !== undefined) {
      updates.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    }
    if (updates.completedAt) {
      updates.completedAt = new Date(updates.completedAt);
    }

    // Handle numeric fields
    if (updates.estimatedHours !== undefined) {
      updates.estimatedHours = typeof updates.estimatedHours === 'number' ? updates.estimatedHours : parseFloat(updates.estimatedHours) || 0;
    }
    if (updates.actualHours !== undefined) {
      updates.actualHours = typeof updates.actualHours === 'number' ? updates.actualHours : parseFloat(updates.actualHours) || 0;
    }

    // Handle projectId - store it in database and also update category for compatibility
    if (updates.projectId !== undefined) {
      if (updates.projectId) {
        try {
          const project = await prisma.project.findUnique({
            where: { id: updates.projectId },
            select: { name: true }
          });
          if (project) {
            updates.category = `Project: ${project.name}`;
            // Keep projectId - it IS a valid database field
          }
        } catch (error) {
          console.error('Error fetching project for task update:', error);
        }
      } else {
        updates.category = 'General';
        updates.projectId = null; // Set to null for no project
      }
    }

    const task = await prisma.macroTask.update({
      where: { id: taskId },
      data: updates,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true,
            status: true
          }
        }
      }
    });

    // Replace assignees if provided (empty array clears all)
    if (Array.isArray(newAssigneeIdsPatch)) {
      await setTaskAssignees(taskId, req.orgId, newAssigneeIdsPatch);
    }

    // Handle parentTaskId (not in Prisma schema — raw SQL)
    if (newParentTaskId !== undefined) {
      await ensureTeamTaskSchema();
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET parentTaskId = ? WHERE id = ?',
        newParentTaskId || null, taskId
      ).catch(() => {});
    }

    // Handle team task fields (captured before delete mutated req.body)
    if (patchIsTeamTask !== undefined) {
      await ensureTeamTaskSchema();
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET isTeamTask = ?, mainAssigneeId = ? WHERE id = ?',
        patchIsTeamTask ? 1 : 0, patchMainAssigneeId || null, taskId
      );
    }

    // Save checklist items whenever the array is provided (separate from isTeamTask check).
    // Simple checklists don't have assigneeId; they use the current user as a placeholder.
    if (Array.isArray(patchChecklistItems)) {
      try {
        await ensureTeamTaskSchema();
        await prisma.$executeRawUnsafe('DELETE FROM task_checklist_items WHERE taskId = ?', taskId);
        for (let i = 0; i < patchChecklistItems.length; i++) {
          const item = patchChecklistItems[i];
          if (!item?.title) continue;
          await prisma.$executeRawUnsafe(
            'INSERT INTO task_checklist_items (id, taskId, assigneeId, orgId, title, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
            randomUUID(), taskId, item.assigneeId || req.user.id, req.orgId, item.title, i
          );
        }
        console.log(`📝 PATCH saved ${patchChecklistItems.length} checklist item(s) for task ${taskId}`);
      } catch (e) {
        console.error('❌ [PATCH checklist] SAVE FAILED:', e.message);
      }
    }

    console.log(`📝 PATCH Updated task ${taskId}`);

    // Notify new assignees if reassigned
    const notifyIdsPatch = Array.isArray(newAssigneeIdsPatch) ? newAssigneeIdsPatch : (updates.userId ? [updates.userId] : []);
    if (notifyIdsPatch.length > 0) {
      const updater = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
      for (const uid of notifyIdsPatch) {
        if (uid !== req.user.id) {
          createNotification({
            userId: uid,
            orgId: req.orgId,
            title: `Task Assigned to You: ${task.title}`,
            body: `Assigned by ${updater?.name || 'a team member'}${task.project ? ` (${task.project.name})` : ''}.`,
            type: 'task',
            link: '/tasks',
          });
        }
      }
    }

    broadcast(req.orgId, 'task', { action: 'update', taskId: task.id, userId: req.user.id });

    res.json({
      task: task,
      message: 'Task updated successfully'
    });
  } catch (error) {
    console.error('Error updating task (PATCH):', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ── Bulk update tasks (status, priority, assignee) ──────────────────────────
router.patch('/bulk', requireAuth, withOrgScope, async (req, res) => {
  try {
    const { taskIds, updates } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ error: 'taskIds array is required' });
    }
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates object is required' });
    }
    if (taskIds.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 tasks per bulk operation' });
    }

    const { status, priority, assigneeId } = updates;
    const { report } = req.body;
    let updated = 0;

    // Bulk status update
    if (status) {
      const ph = taskIds.map(() => '?').join(',');
      await prisma.$executeRawUnsafe(
        `UPDATE macro_tasks SET status = ?, updatedAt = NOW(3) ${status === 'completed' ? ', completedAt = NOW(3)' : ''} WHERE id IN (${ph}) AND orgId = ?`,
        status, ...taskIds, req.orgId
      );
      updated = taskIds.length;
      console.log(`📝 Bulk status update → ${status} for ${taskIds.length} tasks`);

      // Save report for each completed task
      if (status === 'completed' && report?.trim()) {
        await ensureStatusReportsTable();
        const userName = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, email: true } }).catch(() => null);
        const displayName = userName?.name || userName?.email || 'Unknown';

        for (const tid of taskIds) {
          const taskInfo = await prisma.macroTask.findUnique({ where: { id: tid }, select: { title: true, projectId: true } }).catch(() => null);
          // Save to task_status_reports
          await prisma.$executeRawUnsafe(
            'INSERT INTO task_status_reports (id, taskId, userId, orgId, fromStatus, toStatus, report, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))',
            randomUUID(), tid, req.user.id, req.orgId, 'unknown', 'completed', report.trim()
          ).catch(() => {});
          // Save to main reports table
          await prisma.$executeRawUnsafe(
            `INSERT INTO reports (id, title, description, userName, image, projectId, userId, orgId, createdAt, updatedAt) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NOW(), NOW())`,
            randomUUID(),
            `Task Completed: ${taskInfo?.title || 'Untitled'}`,
            report.trim(),
            displayName,
            taskInfo?.projectId || null,
            req.user.id,
            req.orgId
          ).catch(() => {});
        }
        console.log(`📝 Bulk completion report saved for ${taskIds.length} tasks`);
      }
    }

    // Bulk priority update
    if (priority) {
      const ph = taskIds.map(() => '?').join(',');
      await prisma.$executeRawUnsafe(
        `UPDATE macro_tasks SET priority = ?, updatedAt = NOW(3) WHERE id IN (${ph}) AND orgId = ?`,
        priority, ...taskIds, req.orgId
      );
      updated = taskIds.length;
      console.log(`📝 Bulk priority update → ${priority} for ${taskIds.length} tasks`);
    }

    // Bulk reassign (set primary userId)
    if (assigneeId) {
      const ph = taskIds.map(() => '?').join(',');
      await prisma.$executeRawUnsafe(
        `UPDATE macro_tasks SET userId = ?, updatedAt = NOW(3) WHERE id IN (${ph}) AND orgId = ?`,
        assigneeId, ...taskIds, req.orgId
      );
      // Also update task_assignees
      await ensureAssigneesTable();
      for (const tid of taskIds) {
        await setTaskAssignees(tid, req.orgId, [assigneeId]).catch(() => {});
      }
      updated = taskIds.length;
      console.log(`📝 Bulk reassign → ${assigneeId} for ${taskIds.length} tasks`);
    }

    broadcast(req.orgId, 'task', { action: 'bulk-update', taskIds, userId: req.user.id });
    res.json({ success: true, updated, message: `${updated} task(s) updated` });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ error: 'Failed to bulk update tasks' });
  }
});

// Update task status
router.patch('/:taskId/status', requireAuth, withOrgScope, requireTaskOwnership, validateBody(taskSchemas.statusUpdate), async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, report } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    // Require a report when moving to on_hold, cancelled, or completed
    if ((status === 'on_hold' || status === 'cancelled' || status === 'completed') && (!report || !report.trim())) {
      return res.status(400).json({ error: 'A report is required when completing, holding, or cancelling a task' });
    }

    await ensureAssigneesTable();

    // Store the status report if provided
    if (report && report.trim()) {
      await ensureStatusReportsTable();
      const currentTask = await prisma.macroTask.findUnique({
        where: { id: taskId },
        select: { status: true, title: true, projectId: true },
      });
      await prisma.$executeRawUnsafe(
        'INSERT INTO task_status_reports (id, taskId, userId, orgId, fromStatus, toStatus, report, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))',
        randomUUID(), taskId, req.user.id, req.orgId, currentTask?.status || 'unknown', status, report.trim()
      ).catch(err => console.error('[tasks] report save error:', err));

      // Also insert into the main reports table so it appears on the Reports page
      if (status === 'completed') {
        try {
          const userName = (await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, email: true } }));
          // Fetch task attachments to include as report images
          let imageJson = null;
          try {
            const attachments = await prisma.taskAttachment.findMany({
              where: { taskId, orgId: req.orgId },
              select: { name: true, mimeType: true, data: true },
              orderBy: { createdAt: 'desc' },
              take: 10,
            });
            if (attachments.length > 0) {
              imageJson = JSON.stringify(attachments.map(a => ({
                name: a.name,
                type: a.mimeType,
                dataUrl: `data:${a.mimeType};base64,${a.data}`,
              })));
            }
          } catch (_) {}
          await prisma.$executeRawUnsafe(
            `INSERT INTO reports (id, title, description, userName, image, projectId, userId, orgId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            randomUUID(),
            `Task Completed: ${currentTask?.title || 'Untitled'}`,
            report.trim(),
            userName?.name || userName?.email || 'Unknown',
            imageJson,
            currentTask?.projectId || null,
            req.user.id,
            req.orgId
          );
          console.log(`📝 Accomplishment report saved to reports table for task ${taskId}${imageJson ? ' (with attachments)' : ''}`);
        } catch (err) {
          console.error('[tasks] reports table insert error:', err.message);
        }
      }
    }

    // Check if multi-assignee task (more than 1 assignee)
    const assignees = await prisma.$queryRawUnsafe(
      'SELECT userId, status FROM task_assignees WHERE taskId = ?', taskId
    ).catch(() => []);

    const isMultiAssignee = assignees.length > 1;
    const callerAssignee = assignees.find(a => a.userId === req.user.id);

    if (isMultiAssignee && callerAssignee) {
      // ── Per-assignee status: only update THIS user's status ──
      await prisma.$executeRawUnsafe(
        'UPDATE task_assignees SET status = ? WHERE taskId = ? AND userId = ?',
        status, taskId, req.user.id
      );
      console.log(`📝 Updated assignee status for ${req.user.id} on task ${taskId} to: ${status}`);

      // Check if ALL assignees are now completed → update global task status
      const refreshed = await prisma.$queryRawUnsafe(
        'SELECT userId, status FROM task_assignees WHERE taskId = ?', taskId
      );
      const allCompleted = refreshed.length > 0 && refreshed.every(a => a.status === 'completed');

      if (allCompleted) {
        await prisma.macroTask.update({
          where: { id: taskId },
          data: { status: 'completed', completedAt: new Date() },
        });
        console.log(`📝 All assignees completed → task ${taskId} marked completed globally`);
      } else if (status !== 'completed') {
        // If someone un-completes, ensure global status isn't 'completed'
        const task = await prisma.macroTask.findUnique({ where: { id: taskId }, select: { status: true } });
        if (task?.status === 'completed') {
          await prisma.macroTask.update({
            where: { id: taskId },
            data: { status: 'in_progress', completedAt: null },
          });
        }
      }
    } else {
      // ── Single assignee or caller is the primary: update global status ──
      const updateData = { status };
      if (status === 'completed') {
        updateData.completedAt = new Date();
      } else {
        updateData.completedAt = null;
      }
      await prisma.macroTask.update({
        where: { id: taskId },
        data: updateData,
      });
      // Also update task_assignees row if exists
      if (callerAssignee) {
        await prisma.$executeRawUnsafe(
          'UPDATE task_assignees SET status = ? WHERE taskId = ? AND userId = ?',
          status, taskId, req.user.id
        ).catch(() => {});
      }
      console.log(`📝 Updated task ${taskId} status to: ${status}`);
    }

    // ── Stop this user's timer for this task when marking as completed ──
    if (status === 'completed') {
      const now = new Date();
      // Stop active_timers
      await prisma.$executeRawUnsafe(
        'DELETE FROM active_timers WHERE userId = ? AND taskId = ?',
        req.user.id, taskId
      ).catch(() => {});
      // Close open time_logs
      await prisma.$executeRawUnsafe(
        'UPDATE time_logs SET `end` = ?, duration = TIMESTAMPDIFF(SECOND, `begin`, ?) WHERE userId = ? AND taskId = ? AND `end` IS NULL',
        now, now, req.user.id, taskId
      ).catch(() => {});
      console.log(`⏹ Stopped timers for user ${req.user.id} on task ${taskId}`);
    }

    const task = await prisma.macroTask.findUnique({ where: { id: taskId }, select: { title: true, userId: true, completedAt: true } });

    // Notify the task assignee about the status change (if someone else changed it)
    if (task?.userId && task.userId !== req.user.id) {
      const updater = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
      createNotification({
        userId: task.userId,
        orgId: req.orgId,
        title: `Task Status Updated: ${task.title}`,
        body: `Status changed to "${status}" by ${updater?.name || 'a team member'}.`,
        type: 'task',
        link: '/tasks',
      });
    }
    // If completed, also notify all org admins/owners
    if (status === 'completed') {
      prisma.membership.findMany({
        where: { orgId: req.orgId, role: { in: ['OWNER', 'ADMIN', 'HALL_OF_JUSTICE'] } },
        select: { userId: true },
      }).then(admins => {
        for (const { userId: adminId } of admins) {
          if (adminId !== req.user.id && adminId !== task?.userId) {
            createNotification({
              userId: adminId,
              orgId: req.orgId,
              title: `Task Completed: ${task?.title}`,
              body: `"${task?.title}" has been marked as completed.`,
              type: 'task',
              link: '/tasks',
            });
          }
        }
      }).catch(() => {});
    }

    // ── Auto-promote milestone: if all tasks in the active milestone are completed ──
    if (status === 'completed') {
      try {
        // Get this task's milestoneId
        const taskRow = await prisma.$queryRawUnsafe(
          'SELECT milestoneId FROM macro_tasks WHERE id = ?', taskId
        ).catch(() => []);
        const milestoneId = taskRow[0]?.milestoneId;

        if (milestoneId) {
          // Check if ALL tasks in this milestone are completed
          const incomplete = await prisma.$queryRawUnsafe(
            `SELECT COUNT(*) as cnt FROM macro_tasks WHERE milestoneId = ? AND status NOT IN ('completed', 'cancelled')`,
            milestoneId
          );
          const remaining = Number(incomplete[0]?.cnt || 0);

          if (remaining === 0) {
            // Mark this milestone as completed
            await prisma.$executeRawUnsafe(
              `UPDATE project_milestones SET status = 'completed', updatedAt = NOW(3) WHERE id = ?`,
              milestoneId
            );
            console.log(`🏁 Milestone ${milestoneId} completed — all tasks done`);

            // Auto-promote the next milestone (by sortOrder) to 'active'
            const currentMs = await prisma.$queryRawUnsafe(
              'SELECT projectId, orgId, sortOrder FROM project_milestones WHERE id = ?', milestoneId
            );
            if (currentMs[0]) {
              const { projectId: msProjectId, orgId: msOrgId, sortOrder } = currentMs[0];
              const nextMs = await prisma.$queryRawUnsafe(
                `SELECT id, name FROM project_milestones WHERE projectId = ? AND orgId = ? AND sortOrder > ? AND status = 'pending' ORDER BY sortOrder ASC LIMIT 1`,
                msProjectId, msOrgId, sortOrder
              );
              if (nextMs[0]) {
                await prisma.$executeRawUnsafe(
                  `UPDATE project_milestones SET status = 'active', updatedAt = NOW(3) WHERE id = ?`,
                  nextMs[0].id
                );
                console.log(`🔓 Milestone "${nextMs[0].name}" auto-promoted to active`);

                // Notify org admins about milestone promotion
                broadcast(req.orgId, 'milestone', { action: 'promoted', milestoneId: nextMs[0].id, name: nextMs[0].name });
              }
            }
          }
        }
      } catch (msErr) {
        console.error('[tasks] milestone auto-promote error:', msErr.message);
      }
    }

    broadcast(req.orgId, 'task', { action: 'status', taskId, status, userId: req.user.id });

    res.json({
      message: 'Task status updated successfully',
      taskId,
      status,
      completedAt: task?.completedAt,
    });
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

// Delete task
router.delete('/:taskId', requireAuth, withOrgScope, requireTaskOwnership, async (req, res) => {
  try {
    const { taskId } = req.params;

    // Clean up child rows that aren't cascaded by Prisma (raw SQL tables)
    await prisma.$executeRawUnsafe('DELETE FROM task_checklist_items WHERE taskId = ?', taskId).catch(() => {});
    await prisma.$executeRawUnsafe('DELETE FROM task_assignees WHERE taskId = ?', taskId).catch(() => {});
    await prisma.$executeRawUnsafe('DELETE FROM task_status_reports WHERE taskId = ?', taskId).catch(() => {});
    await prisma.$executeRawUnsafe('DELETE FROM active_timers WHERE taskId = ?', taskId).catch(() => {});

    await prisma.macroTask.delete({ where: { id: taskId } });

    console.log(`🗑️ Deleted task ${taskId}`);
    broadcast(req.orgId, 'task', { action: 'delete', taskId, userId: req.user.id });

    res.json({
      message: 'Task deleted successfully',
      taskId: taskId
    });
  } catch (error) {
    console.error('❌ Error deleting task:', error?.message, error?.code, error?.meta);
    res.status(500).json({ error: 'Failed to delete task', detail: error?.message });
  }
});

// Get tasks by organization
router.get('/org/:orgId', requireAuth, withOrgScope, validateQuery(commonSchemas.pagination), async (req, res) => {
  try {
    const { orgId } = req.params;
    const { status, priority, userId, limit = 50, offset = 0 } = req.query;
    
    const where = { orgId };
    
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (userId) where.userId = userId;
    
    const tasks = await prisma.macroTask.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            timeLogs: true
          }
        }
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' }
      ],
      take: parseInt(limit),
      skip: parseInt(offset)
    });
    
    const total = await prisma.macroTask.count({ where });
    
    res.json({
      tasks,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching organization tasks:', error);
    res.status(500).json({ error: 'Failed to fetch organization tasks' });
  }
});

// Get tasks for the entire team/organization (admin view)
router.get('/team', requireAuth, withOrgScope, validateQuery(commonSchemas.pagination), async (req, res) => {
  try {
    const { orgId, status, priority, limit = 50, assignedTo } = req.query;
    
    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }
    
    const where = { orgId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedTo) where.userId = assignedTo;
    
    const tasks = await prisma.macroTask.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        timeLogs: {
          select: {
            begin: true,
            end: true,
            duration: true,
            userId: true,
            user: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            begin: 'desc'
          },
          take: 1
        },
        _count: {
          select: {
            timeLogs: true
          }
        }
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { updatedAt: 'desc' }
      ],
      take: parseInt(limit)
    });
    
    // Calculate total time and last worked for each task
    const tasksWithStats = await Promise.all(tasks.map(async (task) => {
      // Get total time worked on this task by all users
      const timeStats = await prisma.timeLog.aggregate({
        where: {
          taskId: task.id,
          end: { not: null } // Only completed time entries
        },
        _sum: {
          duration: true
        }
      });
      
      const totalTime = timeStats._sum.duration || 0;
      const lastWorked = task.timeLogs.length > 0 ? task.timeLogs[0].begin : null;
      const lastWorkedBy = task.timeLogs.length > 0 ? task.timeLogs[0].user?.name : null;
      
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        category: task.category,
        dueDate: task.dueDate,
        assignedTo: task.user,
        lastWorked: lastWorked,
        lastWorkedBy: lastWorkedBy,
        totalTime: totalTime,
        estimatedHours: task.estimatedHours,
        actualHours: task.actualHours,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      };
    }));
    
    res.json({
      success: true,
      tasks: tasksWithStats,
      total: tasksWithStats.length
    });
  } catch (error) {
    console.error('Error fetching team tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch team tasks' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/tasks/:taskId/comments */
router.get('/:taskId/comments', requireAuth, withOrgScope, async (req, res) => {
  try {
    const comments = await prisma.taskComment.findMany({
      where: { taskId: req.params.taskId, orgId: req.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, comments });
  } catch (e) { console.error('Failed to fetch comments:', e); res.status(500).json({ error: 'Failed to fetch comments' }); }
});

/** POST /api/tasks/:taskId/comments */
router.post('/:taskId/comments', requireAuth, withOrgScope, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
    const comment = await prisma.taskComment.create({
      data: { taskId: req.params.taskId, orgId: req.orgId, userId: req.user.id, content: content.trim() },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // Notify task assignee, creator, AND @mentioned users
    try {
      const taskInfo = await prisma.macroTask.findUnique({
        where: { id: req.params.taskId },
        select: { userId: true, title: true, createdBy: true },
      });
      if (taskInfo) {
        const commenterName = comment.user?.name || 'Someone';
        const preview = content.trim().length > 100 ? content.trim().slice(0, 97) + '...' : content.trim();

        // Parse @mentions from content — match @Name or @FirstName LastName
        const mentionNames = [...content.matchAll(/@([\w][\w\s]*?[\w])(?=\s|$)|@(\w+)/g)]
          .map(m => (m[1] || m[2]).toLowerCase());
        let mentionedUserIds = [];
        if (mentionNames.length > 0) {
          try {
            // Find users in this org whose name matches any mention
            const members = await prisma.membership.findMany({
              where: { orgId: req.orgId },
              include: { user: { select: { id: true, name: true, email: true } } },
            });
            mentionedUserIds = members
              .filter(m => m.user && mentionNames.some(mn =>
                (m.user.name || '').toLowerCase() === mn ||
                (m.user.email || '').split('@')[0].toLowerCase() === mn
              ))
              .map(m => m.userId);
          } catch (_) {}
        }

        // Combine: task owner + creator + mentioned users, exclude commenter
        const notifyIds = new Set([
          taskInfo.userId,
          taskInfo.createdBy,
          ...mentionedUserIds,
        ].filter(id => id && id !== req.user.id));

        for (const uid of notifyIds) {
          const isMentioned = mentionedUserIds.includes(uid);
          createNotification({
            userId: uid,
            orgId: req.orgId,
            title: isMentioned
              ? `${commenterName} mentioned you on: ${taskInfo.title}`
              : `New Comment on: ${taskInfo.title}`,
            body: `${commenterName}: "${preview}"`,
            type: 'comment',
            link: '/tasks',
          });
        }
      }
    } catch (_) {}

    res.status(201).json({ success: true, comment });
  } catch (e) { console.error('Failed to post comment:', e); res.status(500).json({ error: 'Failed to post comment' }); }
});

/** DELETE /api/tasks/:taskId/comments/:commentId */
router.delete('/:taskId/comments/:commentId', requireAuth, withOrgScope, async (req, res) => {
  try {
    const comment = await prisma.taskComment.findFirst({
      where: { id: req.params.commentId, taskId: req.params.taskId, orgId: req.orgId },
    });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.userId !== req.user.id) return res.status(403).json({ error: 'Not your comment' });
    await prisma.taskComment.delete({ where: { id: req.params.commentId } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete comment' }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTACHMENTS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/tasks/:taskId/attachments */
router.get('/:taskId/attachments', requireAuth, withOrgScope, async (req, res) => {
  try {
    const attachments = await prisma.taskAttachment.findMany({
      where: { taskId: req.params.taskId, orgId: req.orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, mimeType: true, size: true, category: true, createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    res.json({ success: true, attachments });
  } catch (e) { console.error('Failed to fetch attachments:', e); res.status(500).json({ error: 'Failed to fetch attachments' }); }
});

/** GET /api/tasks/:taskId/attachments/:attachId/download */
router.get('/:taskId/attachments/:attachId/download', requireAuth, withOrgScope, async (req, res) => {
  try {
    const att = await prisma.taskAttachment.findFirst({
      where: { id: req.params.attachId, taskId: req.params.taskId, orgId: req.orgId },
    });
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    res.json({ success: true, attachment: att });
  } catch (e) { res.status(500).json({ error: 'Failed to download attachment' }); }
});

/** POST /api/tasks/:taskId/attachments  body: { name, mimeType, size, data (base64), category? } */
router.post('/:taskId/attachments', requireAuth, withOrgScope, async (req, res) => {
  try {
    const { name, mimeType, size, data, category = 'attachment' } = req.body;
    if (!name || !data) return res.status(400).json({ error: 'name and data required' });
    const att = await prisma.taskAttachment.create({
      data: { taskId: req.params.taskId, orgId: req.orgId, userId: req.user.id,
        name, mimeType: mimeType || 'application/octet-stream', size: size || 0, data, category },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const { data: _d, ...rest } = att;
    res.status(201).json({ success: true, attachment: rest });
  } catch (e) { console.error('Failed to upload attachment:', e); res.status(500).json({ error: 'Failed to upload attachment' }); }
});

/** DELETE /api/tasks/:taskId/attachments/:attachId */
router.delete('/:taskId/attachments/:attachId', requireAuth, withOrgScope, async (req, res) => {
  try {
    const att = await prisma.taskAttachment.findFirst({
      where: { id: req.params.attachId, taskId: req.params.taskId, orgId: req.orgId },
    });
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    if (att.userId !== req.user.id) return res.status(403).json({ error: 'Not your attachment' });
    await prisma.taskAttachment.delete({ where: { id: req.params.attachId } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete attachment' }); }
});

// ── GET /api/tasks/:taskId/reports — fetch status change reports ──────────────
router.get('/:taskId/reports', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureStatusReportsTable();
    const reports = await prisma.$queryRawUnsafe(
      `SELECT r.id, r.fromStatus, r.toStatus, r.report, r.createdAt, u.name as userName, u.email as userEmail
       FROM task_status_reports r
       JOIN User u ON u.id = r.userId
       WHERE r.taskId = ?
       ORDER BY r.createdAt DESC`,
      req.params.taskId
    );
    res.json({ reports });
  } catch (err) {
    console.error('[tasks] reports fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ── GET /api/tasks/:taskId/checklist — fetch sub-tasks + plain checklist items
router.get('/:taskId/checklist', requireAuth, withOrgScope, async (req, res) => {
  const { taskId } = req.params;
  await ensureTeamTaskSchema();
  try {
    // Team task sub-tasks (real MacroTask children)
    const subTasks = await prisma.$queryRawUnsafe(
      'SELECT mt.id, mt.title, mt.status, mt.userId as assigneeId, mt.updatedAt, ' +
      'u.name as assigneeName, u.email as assigneeEmail ' +
      'FROM macro_tasks mt LEFT JOIN `User` u ON u.id = mt.userId ' +
      'WHERE mt.parentTaskId = ? AND mt.orgId = ? ORDER BY mt.createdAt ASC',
      taskId, req.orgId
    );

    // Plain checklist items from task_checklist_items
    const items = await prisma.$queryRawUnsafe(
      'SELECT id, title, completed, sortOrder FROM task_checklist_items ' +
      'WHERE taskId = ? AND orgId = ? ORDER BY sortOrder ASC, createdAt ASC',
      taskId, req.orgId
    ).catch(() => []);

    const combined = [
      ...subTasks.map(s => ({
        id: s.id,
        title: s.title,
        status: s.status,
        completed: s.status === 'completed',
        assigneeId: s.assigneeId,
        assigneeName: s.assigneeName,
        assigneeEmail: s.assigneeEmail,
        kind: 'subtask',
      })),
      ...items.map(i => ({
        id: i.id,
        title: i.title,
        status: i.completed ? 'completed' : 'not_started',
        completed: !!i.completed,
        kind: 'item',
      })),
    ];

    res.json({ items: combined });
  } catch (e) {
    console.error('[Checklist] fetch error:', e.message);
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
});

// ── PATCH /api/tasks/:taskId/checklist/:itemId — toggle sub-task or item done ─
router.patch('/:taskId/checklist/:itemId', requireAuth, withOrgScope, async (req, res) => {
  const { itemId } = req.params;
  const { completed } = req.body;
  try {
    // First try the checklist_items table (simple items)
    const updateRes = await prisma.$executeRawUnsafe(
      'UPDATE task_checklist_items SET completed = ?, completedAt = ?, completedBy = ? WHERE id = ?',
      completed ? 1 : 0, completed ? new Date() : null, req.user.id, itemId
    ).catch(() => 0);

    if (Number(updateRes) > 0) {
      return res.json({ ok: true, kind: 'item' });
    }

    // Fallback: MacroTask sub-task
    await prisma.macroTask.update({
      where: { id: itemId },
      data: {
        status: completed ? 'completed' : 'not_started',
        completedAt: completed ? new Date() : null,
      },
    });
    res.json({ ok: true, kind: 'subtask' });
  } catch (e) {
    console.error('[Checklist] toggle error:', e.message);
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

let templateSchemaReady = false;
export async function ensureTaskTemplatesSchema() {
  if (templateSchemaReady) return;
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `task_templates` (' +
      '  `id` VARCHAR(191) NOT NULL,' +
      '  `orgId` VARCHAR(191) NOT NULL,' +
      '  `createdBy` VARCHAR(36) NOT NULL,' +
      '  `name` VARCHAR(200) NOT NULL,' +
      '  `title` VARCHAR(200) NOT NULL DEFAULT \'\',' +
      '  `description` TEXT NULL,' +
      '  `priority` VARCHAR(20) NOT NULL DEFAULT \'Medium\',' +
      '  `estimatedHours` DECIMAL(5,2) NOT NULL DEFAULT 0,' +
      '  `tags` JSON NULL,' +
      '  `projectId` VARCHAR(50) NULL,' +
      '  `isTeamTask` TINYINT(1) NOT NULL DEFAULT 0,' +
      '  `subTasks` JSON NULL,' +
      '  `recurringPattern` VARCHAR(20) NULL,' +
      '  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      '  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),' +
      '  PRIMARY KEY (`id`),' +
      '  KEY `tt_orgId_idx` (`orgId`),' +
      '  KEY `tt_createdBy_idx` (`createdBy`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
  } catch (_) {}
  templateSchemaReady = true;
}

/** GET /api/tasks/templates — list templates for current org */
router.get('/templates', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTaskTemplatesSchema();
    const templates = await prisma.$queryRawUnsafe(
      'SELECT * FROM task_templates WHERE orgId = ? ORDER BY name ASC',
      req.orgId
    );
    // Parse JSON fields
    const parsed = templates.map(t => ({
      ...t,
      tags: typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags,
      subTasks: typeof t.subTasks === 'string' ? JSON.parse(t.subTasks) : t.subTasks,
      isTeamTask: !!t.isTeamTask,
      estimatedHours: parseFloat(t.estimatedHours) || 0,
    }));
    res.json({ success: true, templates: parsed });
  } catch (e) {
    console.error('[Templates] GET error:', e.message);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/** POST /api/tasks/templates — save a new template */
router.post('/templates', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTaskTemplatesSchema();
    const { name, title, description, priority, estimatedHours, tags, projectId, isTeamTask, subTasks, recurringPattern } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Template name is required' });

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO task_templates (id, orgId, createdBy, name, title, description, priority, estimatedHours, tags, projectId, isTeamTask, subTasks, recurringPattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, req.orgId, req.user.id,
      name.trim(),
      (title || '').trim(),
      description || null,
      priority || 'Medium',
      parseFloat(estimatedHours) || 0,
      tags ? JSON.stringify(tags) : null,
      projectId || null,
      isTeamTask ? 1 : 0,
      subTasks ? JSON.stringify(subTasks) : null,
      recurringPattern || null
    );

    console.log(`📋 Template created: "${name.trim()}" by ${req.user.email}`);
    res.status(201).json({ success: true, template: { id, name: name.trim() } });
  } catch (e) {
    console.error('[Templates] POST error:', e.message);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/** DELETE /api/tasks/templates/:id — delete a template */
router.delete('/templates/:id', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTaskTemplatesSchema();
    await prisma.$executeRawUnsafe(
      'DELETE FROM task_templates WHERE id = ? AND orgId = ?',
      req.params.id, req.orgId
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[Templates] DELETE error:', e.message);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;