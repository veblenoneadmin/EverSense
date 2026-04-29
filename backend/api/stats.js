// Widget statistics API endpoints
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/rbac.js';
import { checkDatabaseConnection, handleDatabaseError } from '../lib/api-error-handler.js';
const router = express.Router();

// "Today" boundary helper — returns startOfDay / endOfDay as UTC Dates that
// correspond to midnight-to-midnight in Brisbane (AEST, UTC+10, no DST).
// Server runs in UTC; if we used local Date math, "today" would shift at
// UTC midnight (= 10am Brisbane / 8am PH), which doesn't match the workday.
const BUSINESS_TZ = 'Australia/Brisbane';
function getBusinessDayBoundaries(reference = new Date()) {
  // Brisbane is UTC+10 year-round (no DST). Compute the Brisbane wall-clock
  // date for the reference instant.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(reference);
  const y = Number(parts.find(p => p.type === 'year').value);
  const m = Number(parts.find(p => p.type === 'month').value);
  const d = Number(parts.find(p => p.type === 'day').value);
  // Brisbane midnight in UTC = 14:00 UTC of the previous calendar day. Easier
  // to express: y-m-d 00:00 Brisbane = y-m-d 00:00 - 10h offset in UTC.
  // Use Date.UTC to construct, then subtract 10h.
  const startUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 10 * 3600 * 1000);
  const endUTC   = new Date(startUTC.getTime() + 24 * 3600 * 1000);
  return { startOfDay: startUTC, endOfDay: endUTC };
}

// Tasks completed today endpoint
// Optional ?userId= filters to that user's tasks only (where they're the
// primary assignee). Without it, returns org-wide count.
router.get('/tasks-completed-today', requireAuth, async (req, res) => {
  try {
    const { orgId, userId } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }

    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }

    const { startOfDay, endOfDay } = getBusinessDayBoundaries();
    const userFilter = userId ? { userId } : {};

    const todayCount = await prisma.macroTask.count({
      where: {
        orgId,
        ...userFilter,
        status: 'completed',
        completedAt: {
          gte: startOfDay,
          lt: endOfDay
        }
      }
    });

    // Get yesterday's count for trend calculation
    const yesterday = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayEnd = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000);

    const yesterdayCount = await prisma.macroTask.count({
      where: {
        orgId,
        ...userFilter,
        status: 'completed',
        completedAt: {
          gte: yesterday,
          lt: yesterdayEnd
        }
      }
    });
    
    const trendPercentage = yesterdayCount > 0 
      ? ((todayCount - yesterdayCount) / yesterdayCount * 100).toFixed(1)
      : 0;
    
    const trendDirection = trendPercentage > 0 ? 'up' : trendPercentage < 0 ? 'down' : 'neutral';
    
    res.json({
      count: todayCount,
      trend: {
        percentage: Math.abs(trendPercentage),
        direction: trendDirection
      }
    });
  } catch (error) {
    return handleDatabaseError(error, res, 'fetch task statistics');
  }
});

// Time tracked today endpoint
router.get('/time-today', requireAuth, async (req, res) => {
  try {
    const { orgId, userId } = req.query;
    
    if (!orgId || !userId) {
      return res.status(400).json({ error: 'orgId and userId are required' });
    }
    
    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }
    
    const { startOfDay, endOfDay } = getBusinessDayBoundaries();

    const result = await prisma.timeLog.aggregate({
      where: {
        userId,
        orgId,
        begin: {
          gte: startOfDay,
          lt: endOfDay
        },
        end: { not: null } // Only completed entries
      },
      _sum: {
        duration: true
      }
    });
    
    const todaySeconds = result._sum.duration || 0;
    
    // Get yesterday's time for trend
    const yesterday = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayEnd = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000);
    
    const yesterdayResult = await prisma.timeLog.aggregate({
      where: {
        userId,
        orgId,
        begin: {
          gte: yesterday,
          lt: yesterdayEnd
        },
        end: { not: null }
      },
      _sum: {
        duration: true
      }
    });
    
    const yesterdaySeconds = yesterdayResult._sum.duration || 0;
    
    const trendPercentage = yesterdaySeconds > 0 
      ? ((todaySeconds - yesterdaySeconds) / yesterdaySeconds * 100).toFixed(1)
      : 0;
    
    const trendDirection = trendPercentage > 0 ? 'up' : trendPercentage < 0 ? 'down' : 'neutral';
    
    res.json({
      seconds: todaySeconds,
      trend: {
        percentage: Math.abs(trendPercentage),
        direction: trendDirection
      }
    });
  } catch (error) {
    return handleDatabaseError(error, res, 'fetch time statistics');
  }
});

// Active projects count endpoint
// Optional ?userId= scopes to projects where the user has at least one task
// assigned (primary assignee). Without it, returns org-wide count.
router.get('/active-projects', requireAuth, async (req, res) => {
  try {
    const { orgId, userId } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }

    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }

    // If userId given, scope to projects where this user has tasks
    let projectIdFilter = {};
    if (userId) {
      const userTasks = await prisma.macroTask.findMany({
        where: { orgId, userId, projectId: { not: null } },
        select: { projectId: true },
      });
      const userProjectIds = [...new Set(userTasks.map(t => t.projectId).filter(Boolean))];
      if (userProjectIds.length === 0) {
        return res.json({ count: 0, dueSoon: 0, label: '0 due this week' });
      }
      projectIdFilter = { id: { in: userProjectIds } };
    }

    // Count active projects (excluding completed and cancelled)
    const activeCount = await prisma.project.count({
      where: {
        orgId,
        ...projectIdFilter,
        status: {
          in: ['active', 'planning', 'on_hold']
        }
      }
    });

    // Count projects with deadlines this week
    const today = new Date();
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const dueSoon = await prisma.project.count({
      where: {
        orgId,
        ...projectIdFilter,
        status: {
          in: ['active', 'planning', 'on_hold']
        },
        endDate: {
          gte: today,
          lte: weekFromNow
        }
      }
    });
    
    res.json({
      count: activeCount,
      dueSoon: dueSoon,
      label: `${dueSoon} due this week`
    });
  } catch (error) {
    return handleDatabaseError(error, res, 'fetch project statistics');
  }
});

// Team members count endpoint
router.get('/team-members', requireAuth, async (req, res) => {
  try {
    const { orgId } = req.query;
    
    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }
    
    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }
    
    const memberCount = await prisma.membership.count({
      where: {
        orgId
      }
    });
    
    // Count members who have been active today (created time logs) —
    // "today" is Brisbane business day (UTC+10).
    const { startOfDay, endOfDay } = getBusinessDayBoundaries();

    const activeToday = await prisma.timeLog.findMany({
      where: {
        orgId,
        begin: {
          gte: startOfDay,
          lt: endOfDay
        }
      },
      select: {
        userId: true
      },
      distinct: ['userId']
    });
    
    res.json({
      count: memberCount,
      activeToday: activeToday.length,
      label: `${activeToday.length} active today`
    });
  } catch (error) {
    return handleDatabaseError(error, res, 'fetch member statistics');
  }
});


// Productivity score endpoint
router.get('/productivity', requireAuth, async (req, res) => {
  try {
    const { orgId, userId } = req.query;
    
    if (!orgId || !userId) {
      return res.status(400).json({ error: 'orgId and userId are required' });
    }
    
    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }
    
    // Get current week boundaries
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Get tasks completed this week
    const completedTasks = await prisma.macroTask.count({
      where: {
        userId,
        orgId,
        status: 'completed',
        completedAt: {
          gte: startOfWeek
        }
      }
    });
    
    // Get total tasks assigned this week (or updated)
    const totalTasks = await prisma.macroTask.count({
      where: {
        userId,
        orgId,
        updatedAt: {
          gte: startOfWeek
        }
      }
    });
    
    // Calculate simple productivity score
    const score = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    // Get last week's score for trend
    const lastWeekStart = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekEnd = new Date(startOfWeek.getTime());
    
    const lastWeekCompleted = await prisma.macroTask.count({
      where: {
        userId,
        orgId,
        status: 'completed',
        completedAt: {
          gte: lastWeekStart,
          lt: lastWeekEnd
        }
      }
    });
    
    const lastWeekTotal = await prisma.macroTask.count({
      where: {
        userId,
        orgId,
        updatedAt: {
          gte: lastWeekStart,
          lt: lastWeekEnd
        }
      }
    });
    
    const lastWeekScore = lastWeekTotal > 0 ? Math.round((lastWeekCompleted / lastWeekTotal) * 100) : 0;
    
    const trendPercentage = lastWeekScore > 0 ? ((score - lastWeekScore) / lastWeekScore * 100).toFixed(1) : 0;
    const trendDirection = trendPercentage > 0 ? 'up' : trendPercentage < 0 ? 'down' : 'neutral';
    
    res.json({
      score: score,
      trend: {
        percentage: Math.abs(trendPercentage),
        direction: trendDirection
      }
    });
  } catch (error) {
    return handleDatabaseError(error, res, 'fetch productivity statistics');
  }
});

// Overdue tasks endpoint
// Optional ?userId= filters to that user's overdue tasks (primary assignee).
router.get('/overdue-tasks', requireAuth, async (req, res) => {
  try {
    const { orgId, userId } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }

    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }

    const now = new Date();
    const userFilter = userId ? { userId } : {};

    const overdueCount = await prisma.macroTask.count({
      where: {
        orgId,
        ...userFilter,
        status: {
          not: 'completed'
        },
        dueDate: {
          lt: now
        }
      }
    });
    
    const priority = overdueCount > 5 ? 'high' : overdueCount > 2 ? 'medium' : 'low';
    
    res.json({
      count: overdueCount,
      priority: priority,
      label: overdueCount === 0 ? 'All caught up!' : `${overdueCount} overdue`
    });
  } catch (error) {
    return handleDatabaseError(error, res, 'fetch overdue task statistics');
  }
});

export default router;