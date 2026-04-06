// backend/services/recurringTaskScheduler.js
// Scheduler that auto-creates tasks from recurring templates.
// Runs every 15 minutes, finds tasks where nextRecurrenceDate <= NOW(),
// creates a fresh copy, and advances the next recurrence date.

import { prisma } from '../lib/prisma.js';
import { ensureRecurringTaskSchema } from '../api/tasks.js';
import { createNotification } from '../api/notifications.js';

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Advance a date to the next occurrence based on pattern + config. Returns null if series ended. */
function computeNextDate(pattern, config, fromDate) {
  const d = new Date(fromDate);
  const endDate = config?.endDate ? new Date(config.endDate) : null;

  switch (pattern) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1);
      break;

    case 'weekly': {
      // config.dayOfWeek: 0-6 (Sun-Sat), defaults to same weekday
      const targetDay = config?.dayOfWeek ?? d.getUTCDay();
      d.setUTCDate(d.getUTCDate() + 7);
      // Adjust to target day within that week
      const diff = targetDay - d.getUTCDay();
      if (diff !== 0) d.setUTCDate(d.getUTCDate() + diff);
      break;
    }

    case 'biweekly': {
      const targetDay2 = config?.dayOfWeek ?? d.getUTCDay();
      d.setUTCDate(d.getUTCDate() + 14);
      const diff2 = targetDay2 - d.getUTCDay();
      if (diff2 !== 0) d.setUTCDate(d.getUTCDate() + diff2);
      break;
    }

    case 'monthly': {
      // config.dayOfMonth: 1-28 (safe range)
      const targetDom = config?.dayOfMonth ?? d.getUTCDate();
      d.setUTCMonth(d.getUTCMonth() + 1);
      d.setUTCDate(Math.min(targetDom, daysInMonth(d.getUTCFullYear(), d.getUTCMonth())));
      break;
    }

    default:
      return null; // unknown pattern
  }

  if (endDate && d > endDate) return null; // series ended
  return d;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// ── Core job ─────────────────────────────────────────────────────────────────

async function processRecurringTasks() {
  await ensureRecurringTaskSchema();

  const now = new Date();

  // Find all recurring templates whose next recurrence is due
  const dueTasks = await prisma.$queryRawUnsafe(
    `SELECT id, title, description, userId, orgId, priority, estimatedHours,
            category, projectId, dueDate, tags, recurringPattern, recurringConfig,
            nextRecurrenceDate, createdBy
     FROM macro_tasks
     WHERE recurringPattern IS NOT NULL
       AND nextRecurrenceDate IS NOT NULL
       AND nextRecurrenceDate <= ?
       AND status NOT IN ('cancelled')
     LIMIT 100`,
    now
  );

  if (!dueTasks.length) return;

  let created = 0;
  for (const tmpl of dueTasks) {
    try {
      const config = typeof tmpl.recurringConfig === 'string'
        ? JSON.parse(tmpl.recurringConfig)
        : tmpl.recurringConfig || {};

      // Compute due date for the new task: same offset from recurrence date as original
      let newDueDate = null;
      if (tmpl.dueDate && tmpl.nextRecurrenceDate) {
        // The new task's due date = nextRecurrenceDate (the day it was scheduled)
        newDueDate = new Date(tmpl.nextRecurrenceDate);
      }

      // Create the new task as a copy
      const newTask = await prisma.macroTask.create({
        data: {
          title: tmpl.title,
          description: tmpl.description || null,
          userId: tmpl.userId,
          orgId: tmpl.orgId,
          createdBy: tmpl.createdBy || tmpl.userId,
          priority: tmpl.priority || 'Medium',
          status: 'not_started',
          estimatedHours: tmpl.estimatedHours ? parseFloat(tmpl.estimatedHours) : 0,
          category: tmpl.category || 'General',
          projectId: tmpl.projectId || null,
          dueDate: newDueDate,
          tags: tmpl.tags || null,
        },
      });

      // Link back to recurring parent
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET recurringParentId = ? WHERE id = ?',
        tmpl.id, newTask.id
      ).catch(() => {});

      // Copy assignees from template
      try {
        const assignees = await prisma.$queryRawUnsafe(
          'SELECT userId, orgId FROM task_assignees WHERE taskId = ?',
          tmpl.id
        );
        for (const a of assignees) {
          const id = `ta_${newTask.id}_${a.userId}`.slice(0, 191);
          await prisma.$executeRawUnsafe(
            'INSERT IGNORE INTO task_assignees (id, taskId, userId, orgId) VALUES (?, ?, ?, ?)',
            id, newTask.id, a.userId, a.orgId
          ).catch(() => {});
        }
      } catch (_) {}

      // Notify assignee
      createNotification({
        userId: tmpl.userId,
        orgId: tmpl.orgId,
        title: `Recurring Task: ${tmpl.title}`,
        body: `A new instance of your recurring task has been created.`,
        link: '/tasks',
        type: 'task',
      });

      // Advance nextRecurrenceDate on the template
      const nextDate = computeNextDate(tmpl.recurringPattern, config, tmpl.nextRecurrenceDate);
      if (nextDate) {
        await prisma.$executeRawUnsafe(
          'UPDATE macro_tasks SET nextRecurrenceDate = ? WHERE id = ?',
          nextDate, tmpl.id
        );
      } else {
        // Series ended — clear the next date
        await prisma.$executeRawUnsafe(
          'UPDATE macro_tasks SET nextRecurrenceDate = NULL WHERE id = ?',
          tmpl.id
        );
      }

      created++;
    } catch (err) {
      console.error(`[RecurringTasks] Error creating recurrence for task ${tmpl.id}:`, err.message);
    }
  }

  if (created) console.log(`[RecurringTasks] Created ${created} recurring task(s)`);
}

// ── Start ────────────────────────────────────────────────────────────────────

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function startRecurringTaskScheduler() {
  console.log('[RecurringTasks] Scheduler started — checking every 15 min');
  // Run immediately on startup
  processRecurringTasks().catch(e => console.error('[RecurringTasks] Init error:', e.message));
  // Then every 15 minutes
  setInterval(() => processRecurringTasks().catch(e => console.error('[RecurringTasks] Tick error:', e.message)), INTERVAL_MS);
}
