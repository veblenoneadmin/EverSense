// backend/lib/attendance-cron.js
// Checks every 1 minute — auto-clocks out sessions open longer than 9h 30m
// and sends notifications to the user + all ADMIN/OWNER/HALL_OF_JUSTICE members.
//
// ──────────────────────────────────────────────────────────────────────────────
// ⚠  DO NOT REPLACE THE SIMPLE "single-session age >= 9h30m" RULE.
// ──────────────────────────────────────────────────────────────────────────────
// We previously tried a "cumulative daily cap" that summed closed-session
// durations and auto-closed open sessions when the daily total hit 9h30m.
// Every variant caused user-visible outages:
//
//   · 16h rolling window → Gwen's overnight-auto-closed session (24h42m duration)
//     leaked into the next day and closed every new clock-in in seconds.
//   · date-column scoping → admin@eversense.ai's AWST-morning clock-in was
//     stored with UTC yesterday's date, so it matched the previous day's 8h+
//     closed session and her session was closed seconds after every resume.
//   · timeOut-recency scoping → got closer but still introduced edge cases.
//
// The simple single-session rule is the one thing that reliably works across
// timezones, overnight sessions, and resume-on-clock-in. If someone needs a
// daily cap back, gate it behind an opt-in env var so the default stays simple.
// ──────────────────────────────────────────────────────────────────────────────

import { prisma } from './prisma.js';
import { createNotification } from '../api/notifications.js';
import { broadcast } from './sse.js';

const AUTO_CLOCKOUT_SECONDS = 9.5 * 3600; // 9h 30m — do not change without discussion
const INTERVAL_MS = 60 * 1000;             // every 1 minute
const ORPHAN_ALERT_SECONDS = 16 * 3600;   // 16h — flag forgotten sessions to super admin
const SUPER_ADMIN_EMAIL = 'admin@eversense.ai';
// Track which sessions we've already alerted on to avoid spamming the bell.
const alertedOrphanSessions = new Set();

function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

async function runAutoClockout() {
  if (!process.env.DATABASE_URL) return;
  // Kill-switch: set AUTO_CLOCKOUT_DISABLED=true on Railway to skip the cron
  // entirely. The frontend 8h 30m popup + 8h 40m auto-clockout becomes the
  // only mechanism. Forgotten sessions (closed laptop, etc.) will persist
  // until the next clock-in's resume logic — manually clean up if needed.
  if (/^(1|true|yes)$/i.test(process.env.AUTO_CLOCKOUT_DISABLED || '')) return;
  try {
    // TIMESTAMPDIFF with direct interpolation — no parameter binding, no BigInt issue
    const overdueRows = await prisma.$queryRawUnsafe(
      `SELECT id, userId, orgId, timeIn
       FROM attendance_logs
       WHERE timeOut IS NULL
         AND TIMESTAMPDIFF(SECOND, timeIn, NOW()) >= ${AUTO_CLOCKOUT_SECONDS}`
    );

    if (!overdueRows.length) return;

    console.log(`[AttendanceCron] Auto-clocking out ${overdueRows.length} overdue session(s)`);

    for (const row of overdueRows) {
      try {
        const now = new Date();
        const timeIn = new Date(row.timeIn);
        const grossSeconds = Math.floor((now.getTime() - timeIn.getTime()) / 1000);

        // Clock out
        await prisma.$executeRawUnsafe(
          `UPDATE attendance_logs
           SET timeOut = ?, duration = ?, updatedAt = NOW(3)
           WHERE id = ? AND timeOut IS NULL`,
          now, grossSeconds, row.id
        );

        // Stop any running task timers — same cleanup that manual clock-out does.
        // Without this, the user's active_timers and open time_logs rows would
        // outlive their attendance session and accumulate phantom hours.
        try {
          await prisma.$executeRawUnsafe(
            `DELETE FROM active_timers WHERE userId = ? AND orgId = ?`,
            row.userId, row.orgId
          );
          await prisma.$executeRawUnsafe(
            'UPDATE time_logs SET `end` = ?, duration = TIMESTAMPDIFF(SECOND, `begin`, ?) WHERE userId = ? AND orgId = ? AND `end` IS NULL',
            now, now, row.userId, row.orgId
          );
        } catch (e) {
          console.warn('[AttendanceCron] timer cleanup error:', e.message);
        }

        // Broadcast SSE so all connected clients (admin view) refresh immediately.
        // Two events: attendance clock-out + timer stop, so frontend tabs that
        // have a task timer running can clear their local state.
        try { broadcast(row.orgId, 'attendance', { action: 'clock-out', userId: row.userId }); } catch { /* non-fatal */ }
        try { broadcast(row.orgId, 'timer', { action: 'stop', userId: row.userId, reason: 'auto-clockout' }); } catch { /* non-fatal */ }

        // Fetch user info
        let userName = 'Unknown';
        let userEmail = '';
        try {
          const userRows = await prisma.$queryRawUnsafe(
            'SELECT name, email FROM `User` WHERE id = ? LIMIT 1',
            row.userId
          );
          if (userRows.length) {
            userName = userRows[0].name || userRows[0].email;
            userEmail = userRows[0].email;
          }
        } catch { /* non-fatal */ }

        const durationStr = fmtDuration(grossSeconds);
        const clockInTime = timeIn.toLocaleTimeString('en-AU', {
          hour: '2-digit', minute: '2-digit', hour12: true,
        });

        // Notify the user themselves
        try {
          await createNotification({
            userId: row.userId,
            orgId:  row.orgId,
            title:  'Auto Clock-Out',
            body:   `You were automatically clocked out after ${durationStr} (clocked in at ${clockInTime}). Please review your attendance record.`,
            link:   '/attendance',
            type:   'warning',
          });
        } catch (e) {
          console.warn('[AttendanceCron] User notification error:', e.message);
        }

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

        console.log(`[AttendanceCron] ✅ Auto-clocked out ${userName} (${row.userId}) after ${durationStr}`);
      } catch (rowErr) {
        console.error(`[AttendanceCron] Failed to process session ${row.id}:`, rowErr.message);
      }
    }
  } catch (err) {
    console.error('[AttendanceCron] Error:', err.message);
  }
}

// ── Orphan-session alert ───────────────────────────────────────────────────
// When the auto-clockout cron is disabled (env: AUTO_CLOCKOUT_DISABLED=true),
// sessions that exceed 16h without manual clock-out become orphans. Notify
// only admin@eversense.ai so they can manually close the session — does NOT
// notify owners or other admins.
async function runOrphanSessionAlert() {
  if (!process.env.DATABASE_URL) return;
  try {
    const orphans = await prisma.$queryRawUnsafe(
      `SELECT id, userId, orgId, timeIn
       FROM attendance_logs
       WHERE timeOut IS NULL
         AND TIMESTAMPDIFF(SECOND, timeIn, NOW()) >= ${ORPHAN_ALERT_SECONDS}`
    );
    if (!orphans.length) return;

    // Look up super admin once per cycle
    const adminRows = await prisma.$queryRawUnsafe(
      `SELECT id, orgId FROM \`User\` u
       LEFT JOIN memberships m ON m.userId = u.id
       WHERE u.email = ? LIMIT 1`,
      SUPER_ADMIN_EMAIL
    ).catch(() => []);
    if (!adminRows.length) {
      console.warn('[OrphanSessionAlert] super admin not found, skipping notify');
      return;
    }
    const adminId = adminRows[0].id;

    for (const sess of orphans) {
      if (alertedOrphanSessions.has(sess.id)) continue;
      alertedOrphanSessions.add(sess.id);

      let userName = 'Unknown';
      try {
        const userRows = await prisma.$queryRawUnsafe(
          'SELECT name, email FROM `User` WHERE id = ? LIMIT 1',
          sess.userId
        );
        if (userRows.length) {
          userName = userRows[0].name || userRows[0].email;
        }
      } catch { /* non-fatal */ }

      const elapsed = Math.floor((Date.now() - new Date(sess.timeIn).getTime()) / 1000);
      const hours = Math.floor(elapsed / 3600);

      try {
        await createNotification({
          userId: adminId,
          orgId: sess.orgId,
          title: `Orphan Session: ${userName}`,
          body: `${userName} has been clocked in for ${hours}h without clocking out. Likely forgot — please review and close manually if needed.`,
          link:  '/attendance',
          type:  'warning',
        });
      } catch (e) {
        console.warn('[OrphanSessionAlert] notify error:', e.message);
      }

      console.log(`[OrphanSessionAlert] ⚠ ${userName} session ${sess.id} ≥ 16h — alerted ${SUPER_ADMIN_EMAIL}`);
    }
  } catch (err) {
    console.error('[OrphanSessionAlert] error:', err.message);
  }
}

export function startAttendanceCron() {
  // Run once immediately on startup to catch any already-overdue sessions
  runAutoClockout();
  runOrphanSessionAlert();
  // Then run every 1 minute via native setInterval (no external deps)
  setInterval(() => {
    runAutoClockout();
    runOrphanSessionAlert();
  }, INTERVAL_MS);
  console.log('  ✅ Attendance auto-clockout started (every 1 min, limit: 9h30m)');
  console.log('  ✅ Orphan-session alert started (every 1 min, threshold: 16h, recipient: ' + SUPER_ADMIN_EMAIL + ')');
}
