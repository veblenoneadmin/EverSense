// backend/lib/attendance-cron.js
// Runs every 5 minutes — auto-clocks out sessions open longer than 9h 30m
// and sends notifications to the user + all ADMIN/OWNER/HALL_OF_JUSTICE members

import cron from 'node-cron';
import { prisma } from './prisma.js';
import { createNotification } from '../api/notifications.js';

const AUTO_CLOCKOUT_SECONDS = 9.5 * 3600; // 9 hours 30 minutes

function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

async function runAutoClockout() {
  if (!process.env.DATABASE_URL) return;
  try {
    // Find all open attendance logs older than 9h30m
    const overdueRows = await prisma.$queryRawUnsafe(
      `SELECT id, userId, orgId, timeIn
       FROM attendance_logs
       WHERE timeOut IS NULL
         AND TIMESTAMPDIFF(SECOND, timeIn, NOW()) >= ?`,
      AUTO_CLOCKOUT_SECONDS
    );

    if (!overdueRows.length) return;

    console.log(`[AttendanceCron] Auto-clocking out ${overdueRows.length} overdue session(s)`);

    for (const row of overdueRows) {
      const now = new Date();
      const grossSeconds = Math.floor((now.getTime() - new Date(row.timeIn).getTime()) / 1000);

      // Clock out
      await prisma.$executeRawUnsafe(
        `UPDATE attendance_logs
         SET timeOut = ?, duration = ?, updatedAt = NOW(3)
         WHERE id = ? AND timeOut IS NULL`,
        now, grossSeconds, row.id
      );

      // Fetch user info
      let userName = 'Unknown';
      let userEmail = '';
      try {
        const userRows = await prisma.$queryRawUnsafe(
          'SELECT name, email FROM User WHERE id = ? LIMIT 1',
          row.userId
        );
        if (userRows.length) {
          userName = userRows[0].name || userRows[0].email;
          userEmail = userRows[0].email;
        }
      } catch { /* non-fatal */ }

      const durationStr = fmtDuration(grossSeconds);
      const clockInTime = new Date(row.timeIn).toLocaleTimeString('en-AU', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });

      // Notify the user themselves
      await createNotification({
        userId: row.userId,
        orgId:  row.orgId,
        title:  'Auto Clock-Out',
        body:   `You were automatically clocked out after ${durationStr} (clocked in at ${clockInTime}). Please review your attendance record.`,
        link:   '/attendance',
        type:   'warning',
      });

      // Notify all ADMIN / OWNER / HALL_OF_JUSTICE in the org
      try {
        const managers = await prisma.$queryRawUnsafe(
          `SELECT userId FROM memberships
           WHERE orgId = ? AND role IN ('OWNER','ADMIN','HALL_OF_JUSTICE') AND userId != ?`,
          row.orgId, row.userId
        );

        for (const mgr of managers) {
          await createNotification({
            userId: mgr.userId,
            orgId:  row.orgId,
            title:  `Auto Clock-Out: ${userName}`,
            body:   `${userName} (${userEmail}) was automatically clocked out after ${durationStr}. They clocked in at ${clockInTime} and did not manually clock out.`,
            link:   '/attendance',
            type:   'warning',
          });
        }
      } catch (e) {
        console.warn('[AttendanceCron] Manager notification error:', e.message);
      }

      console.log(`[AttendanceCron] Auto-clocked out ${userName} (${row.userId}) after ${durationStr}`);
    }
  } catch (err) {
    console.error('[AttendanceCron] Error:', err.message);
  }
}

export function startAttendanceCron() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', runAutoClockout);
  console.log('  ✅ Attendance auto-clockout cron started (checks every 5 min, limit: 9h30m)');
}
