// KPI Intelligence Report API
// Add to: backend/api/kpi-report.js
// Register in server: app.use('/api/kpi-report', kpiReportRouter);

import express from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, withOrgScope } from '../lib/rbac.js';
import { checkDatabaseConnection, handleDatabaseError } from '../lib/api-error-handler.js';

const router = express.Router();

/**
 * GET /api/kpi-report
 * Returns comprehensive KPI intelligence data including performer classifications
 * Query params:
 *   - orgId: string (required)
 *   - period: 'daily' | 'weekly' | 'monthly' (default: 'weekly')
 *   - date: ISO date string (default: now)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { orgId, period = 'weekly', date, start: customStart, end: customEnd } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }

    if (!(await checkDatabaseConnection(res))) return;

    let start, end, previousStart, previousEnd, label, expectedHoursOverride;
    if (customStart && customEnd) {
      start = new Date(customStart); start.setHours(0, 0, 0, 0);
      end = new Date(customEnd); end.setHours(23, 59, 59, 999);
      const spanMs = end - start;
      previousEnd = new Date(start.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - spanMs);
      const days = Math.max(1, Math.ceil(spanMs / (1000 * 60 * 60 * 24)));
      expectedHoursOverride = days * 8;
      label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      const refDate = date ? new Date(date) : new Date();
      ({ start, end, previousStart, previousEnd, label } = getDateRange(period, refDate));
    }

    // ─── Fetch all members in org ───────────────────────────────────────────
    const memberships = await prisma.membership.findMany({
      where: { orgId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } }
      }
    });

    const memberIds = memberships.map(m => m.userId);

    // ─── Fetch time logs for current & previous period ────────────────────
    const [currentLogs, previousLogs] = await Promise.all([
      prisma.timeLog.findMany({
        where: { orgId, userId: { in: memberIds }, begin: { gte: start, lte: end }, end: { not: null } },
        include: { task: { select: { id: true, title: true, projectId: true, estimatedHours: true, status: true } } }
      }),
      prisma.timeLog.findMany({
        where: { orgId, userId: { in: memberIds }, begin: { gte: previousStart, lte: previousEnd }, end: { not: null } }
      })
    ]);

    // ─── Fetch tasks ──────────────────────────────────────────────────────
    const [currentTasks, overdueTasks] = await Promise.all([
      prisma.macroTask.findMany({
        where: {
          orgId,
          userId: { in: memberIds },
          updatedAt: { gte: start, lte: end }
        }
      }),
      prisma.macroTask.findMany({
        where: {
          orgId,
          userId: { in: memberIds },
          status: { notIn: ['completed', 'cancelled'] },
          dueDate: { lt: new Date() }
        }
      })
    ]);

    // ─── All-time per-user seconds on each task (for estimation accuracy) ─
    // Lets us compare each user's OWN time against a task's estimate, instead
    // of the team-cumulative actualHours. Keyed as `${userId}|${taskId}`.
    const userTaskSecsMap = new Map();
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT userId, taskId, SUM(duration) AS secs FROM time_logs
         WHERE orgId = ? AND userId IN (${memberIds.map(() => '?').join(',') || 'NULL'})
           AND duration > 0
         GROUP BY userId, taskId`,
        orgId, ...memberIds
      );
      for (const r of rows) {
        userTaskSecsMap.set(`${r.userId}|${r.taskId}`, Number(r.secs || 0));
      }
    } catch (e) {
      console.warn('[KPI] per-user task secs fetch failed:', e.message);
    }

    // ─── Fetch per-assignee statuses for multi-assignee tasks ─────────────
    // Maps userId → Set of taskIds they've personally completed
    const perAssigneeCompletedMap = {};
    try {
      const assigneeRows = await prisma.$queryRawUnsafe(
        `SELECT ta.userId, ta.taskId FROM task_assignees ta
         JOIN macro_tasks t ON t.id = ta.taskId
         WHERE ta.orgId = ? AND ta.userId IN (${memberIds.map(() => '?').join(',') || 'NULL'})
           AND ta.status = 'completed'
           AND t.updatedAt >= ? AND t.updatedAt <= ?`,
        orgId, ...memberIds, start, end
      );
      for (const r of assigneeRows) {
        if (!perAssigneeCompletedMap[r.userId]) perAssigneeCompletedMap[r.userId] = new Set();
        perAssigneeCompletedMap[r.userId].add(r.taskId);
      }
    } catch (e) {
      console.warn('[KPI] per-assignee fetch failed:', e.message);
    }

    // ─── Fetch projects ───────────────────────────────────────────────────
    const projects = await prisma.project.findMany({
      where: { orgId },
      include: {
        tasks: {
          where: { userId: { in: memberIds } },
          select: { userId: true, status: true, estimatedHours: true, actualHours: true }
        }
      }
    });

    // ─── Per-user aggregation ─────────────────────────────────────────────
    const userStats = memberships.map(({ user, role }) => {
      const userCurrentLogs = currentLogs.filter(l => l.userId === user.id);
      const userPreviousLogs = previousLogs.filter(l => l.userId === user.id);
      const userTasks = currentTasks.filter(t => t.userId === user.id);
      // Exclude tasks the user personally completed (team tasks) from overdue count
      const userPersonalCompleted = perAssigneeCompletedMap[user.id] || new Set();
      const userOverdue = overdueTasks.filter(t => t.userId === user.id && !userPersonalCompleted.has(t.id));

      const currentHours = userCurrentLogs.reduce((s, l) => s + (l.duration || 0), 0) / 3600;
      const previousHours = userPreviousLogs.reduce((s, l) => s + (l.duration || 0), 0) / 3600;

      // "Effective status" for this user: if they have a per-assignee completion,
      // treat the task as completed regardless of global status (team task flow)
      const isCompletedForUser = (t) => t.status === 'completed' || userPersonalCompleted.has(t.id);

      // Team tasks where user is NOT the primary (not in userTasks) but completed their part
      const teamOnlyCompletedIds = [...userPersonalCompleted].filter(taskId => !userTasks.find(t => t.id === taskId));

      const completedTasks = userTasks.filter(isCompletedForUser).length + teamOnlyCompletedIds.length;
      const totalTasks = userTasks.length + teamOnlyCompletedIds.length;
      const inProgressTasks = userTasks.filter(t => t.status === 'in_progress' && !userPersonalCompleted.has(t.id)).length;

      // Estimation accuracy: compare THIS user's actual (from time_logs) vs
      // the task's estimate on completed tasks where they logged time.
      // Skips tasks where the user logged nothing so solo-assignees on team
      // tasks don't drag the average down to 0.
      const completedWithEstimate = userTasks.filter(
        t => t.status === 'completed' && Number(t.estimatedHours) > 0
      );
      const myCompletedWithTime = completedWithEstimate.filter(
        t => (userTaskSecsMap.get(`${user.id}|${t.id}`) || 0) > 0
      );
      const estimationAccuracy = myCompletedWithTime.length > 0
        ? myCompletedWithTime.reduce((sum, t) => {
            const myHours = (userTaskSecsMap.get(`${user.id}|${t.id}`) || 0) / 3600;
            const est = Number(t.estimatedHours);
            const ratio = Math.min(est, myHours) / Math.max(est, myHours);
            return sum + ratio;
          }, 0) / myCompletedWithTime.length * 100
        : null;

      // Billable ratio
      const billableLogs = userCurrentLogs.filter(l => l.isBillable);
      const billableHours = billableLogs.reduce((s, l) => s + (l.duration || 0), 0) / 3600;
      const billableRatio = currentHours > 0 ? (billableHours / currentHours) * 100 : 0;

      // Hourly trend
      const hoursTrend = previousHours > 0
        ? ((currentHours - previousHours) / previousHours) * 100
        : null;

      // Expected hours per period
      const expectedHours = expectedHoursOverride ?? (period === 'daily' ? 8 : period === 'weekly' ? 40 : 160);
      const utilizationRate = (currentHours / expectedHours) * 100;

      // Task completion rate
      const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      return {
        user,
        role,
        currentHours: Math.round(currentHours * 10) / 10,
        previousHours: Math.round(previousHours * 10) / 10,
        hoursTrend: hoursTrend !== null ? Math.round(hoursTrend) : null,
        utilizationRate: Math.round(utilizationRate),
        completedTasks,
        inProgressTasks,
        totalTasks,
        overdueTaskCount: userOverdue.length,
        taskCompletionRate: Math.round(taskCompletionRate),
        billableHours: Math.round(billableHours * 10) / 10,
        billableRatio: Math.round(billableRatio),
        estimationAccuracy: estimationAccuracy !== null ? Math.round(estimationAccuracy) : null,
        sessionCount: userCurrentLogs.length,
        avgSessionLength: userCurrentLogs.length > 0
          ? Math.round((currentHours / userCurrentLogs.length) * 10) / 10
          : 0,
        activeDays: new Set(userCurrentLogs.map(l => new Date(l.begin).toDateString())).size,
      };
    });

    // ─── Performer Classification ─────────────────────────────────────────
    // Only classify STAFF/ADMIN (not CLIENT role)
    const classifiableUsers = userStats.filter(u => u.role !== 'CLIENT');
    const avgHours = classifiableUsers.length > 0
      ? classifiableUsers.reduce((s, u) => s + u.currentHours, 0) / classifiableUsers.length
      : 0;
    const avgCompletionRate = classifiableUsers.length > 0
      ? classifiableUsers.reduce((s, u) => s + u.taskCompletionRate, 0) / classifiableUsers.length
      : 0;

    const classifiedUsers = userStats.map(u => {
      let classification = null;
      let classificationReason = '';

      if (u.role === 'CLIENT') {
        return { ...u, classification: 'client', classificationReason: 'Client account', score: null };
      }

      // Scoring algorithm
      const hoursScore = Math.min(100, u.utilizationRate); // 0-100
      const completionScore = u.taskCompletionRate; // 0-100
      const overdueScore = Math.max(0, 100 - u.overdueTaskCount * 10); // penalty per overdue
      const estimationScore = u.estimationAccuracy ?? 70; // default mid if no data
      const trendScore = u.hoursTrend !== null ? Math.min(120, 60 + u.hoursTrend) : 60;

      const compositeScore = (
        hoursScore * 0.30 +
        completionScore * 0.30 +
        overdueScore * 0.15 +
        estimationScore * 0.15 +
        trendScore * 0.10
      );

      // Classification logic
      if (u.currentHours === 0 && u.completedTasks === 0) {
        classification = 'inactive';
        classificationReason = 'No activity logged this period';
      } else if (compositeScore >= 80 && u.utilizationRate >= 90 && u.taskCompletionRate >= 75) {
        classification = 'star';
        classificationReason = `Exceptional performance — ${u.utilizationRate}% utilization, ${u.taskCompletionRate}% task completion`;
      } else if (u.utilizationRate >= 130) {
        // Only the absolute 130%-of-expected-workday rule. The older relative
        // "avgHours * 1.5" rule was brittle — when some teammates logged 0h
        // the team average cratered and anyone doing a normal day was flagged.
        classification = 'overworked';
        classificationReason = `Logged ${u.currentHours}h (${u.utilizationRate}% of expected) — risk of burnout`;
      } else if (compositeScore < 40 || (u.utilizationRate < 50 && u.taskCompletionRate < 40)) {
        classification = 'underperformer';
        classificationReason = `Below average on hours (${u.utilizationRate}% util.) and task completion (${u.taskCompletionRate}%)`;
      } else if (
        u.currentHours >= avgHours * 0.8 &&
        u.taskCompletionRate < avgCompletionRate * 0.6 &&
        u.overdueTaskCount > 2
      ) {
        classification = 'coaster';
        classificationReason = `Hours look fine but low output — ${u.overdueTaskCount} overdue tasks, ${u.taskCompletionRate}% completion`;
      } else {
        classification = 'solid';
        classificationReason = 'Performing within expected range';
      }

      return {
        ...u,
        classification,
        classificationReason,
        score: Math.round(compositeScore)
      };
    });

    // ─── Org-level KPIs ────────────────────────────────────────────────────
    const totalHours = currentLogs.reduce((s, l) => s + (l.duration || 0), 0) / 3600;
    const totalPreviousHours = previousLogs.reduce((s, l) => s + (l.duration || 0), 0) / 3600;
    const totalCompleted = currentTasks.filter(t => t.status === 'completed').length;
    const totalTasks = currentTasks.length;
    const totalOverdue = overdueTasks.length;
    const billableHoursTotal = currentLogs.filter(l => l.isBillable).reduce((s, l) => s + (l.duration || 0), 0) / 3600;

    // Project health
    const projectHealth = projects.map(p => {
      const budget = Number(p.budget) || 0;
      const spent = Number(p.spent) || 0;
      const budgetUsed = budget > 0 ? (spent / budget) * 100 : null;
      const hoursLogged = p.hoursLogged || 0;
      const estimatedHours = p.estimatedHours || 0;
      const hoursUsed = estimatedHours > 0 ? (hoursLogged / estimatedHours) * 100 : null;
      const isOverBudget = budget > 0 && spent > budget;
      const isOverTime = estimatedHours > 0 && hoursLogged > estimatedHours;

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        color: p.color,
        budget,
        spent,
        budgetUsed: budgetUsed !== null ? Math.round(budgetUsed) : null,
        estimatedHours,
        hoursLogged,
        hoursUsed: hoursUsed !== null ? Math.round(hoursUsed) : null,
        progress: p.progress,
        isOverBudget,
        isOverTime,
        taskCount: p.tasks.length,
        completedTaskCount: p.tasks.filter(t => t.status === 'completed').length,
      };
    });

    // Classification breakdown counts
    const classificationCounts = {
      star: classifiedUsers.filter(u => u.classification === 'star').length,
      solid: classifiedUsers.filter(u => u.classification === 'solid').length,
      coaster: classifiedUsers.filter(u => u.classification === 'coaster').length,
      overworked: classifiedUsers.filter(u => u.classification === 'overworked').length,
      underperformer: classifiedUsers.filter(u => u.classification === 'underperformer').length,
      inactive: classifiedUsers.filter(u => u.classification === 'inactive').length,
    };

    res.json({
      success: true,
      period,
      label,
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      orgKPIs: {
        totalHours: Math.round(totalHours * 10) / 10,
        previousHours: Math.round(totalPreviousHours * 10) / 10,
        hoursTrend: totalPreviousHours > 0
          ? Math.round(((totalHours - totalPreviousHours) / totalPreviousHours) * 100)
          : null,
        totalCompleted,
        totalTasks,
        totalOverdue,
        taskCompletionRate: totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0,
        billableHours: Math.round(billableHoursTotal * 10) / 10,
        billableRatio: totalHours > 0 ? Math.round((billableHoursTotal / totalHours) * 100) : 0,
        activeMembers: classifiedUsers.filter(u => u.currentHours > 0).length,
        totalMembers: memberships.length,
        classificationCounts,
      },
      users: classifiedUsers,
      projectHealth,
    });
  } catch (error) {
    return handleDatabaseError(error, res, 'fetch KPI report');
  }
});

// ─── Helper: Date range calculator ─────────────────────────────────────────
function getDateRange(period, refDate) {
  const now = new Date(refDate);
  let start, end, previousStart, previousEnd, label;

  if (period === 'daily') {
    start = new Date(now); start.setHours(0, 0, 0, 0);
    end = new Date(now); end.setHours(23, 59, 59, 999);
    previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - 1);
    previousEnd = new Date(end); previousEnd.setDate(previousEnd.getDate() - 1);
    label = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  } else if (period === 'weekly') {
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start = new Date(now); start.setDate(now.getDate() + diffToMonday); start.setHours(0, 0, 0, 0);
    end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
    previousStart = new Date(start); previousStart.setDate(start.getDate() - 7);
    previousEnd = new Date(end); previousEnd.setDate(end.getDate() - 7);
    label = `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  } else {
    // monthly
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  return { start, end, previousStart, previousEnd, label };
}

export default router;
