// backend/lib/reconciliation-cron.js
//
// Hourly check that detects DRIFT between time_logs and macro_tasks.actualHours.
// macro_tasks.actualHours is meant to be the cumulative hours worked across all
// users on a task, derived from SUM(time_logs.duration). When they disagree by
// more than 30 minutes, it's a sign that one path wrote to actualHours without
// going through time_logs (or vice versa).
//
// What this DOES:
//   · Read-only — never writes to time_logs or macro_tasks
//   · Notifies admin@eversense.ai when significant drift is found
//   · Logs every check tick for observability
//
// What this DOES NOT do:
//   · Auto-correct drift (too risky — humans should review the reason)
//   · Modify any data in any table
//   · Touch attendance_logs at all
//
// Kill-switch: set RECONCILIATION_DISABLED=true on Railway to pause this cron.

import { prisma } from './prisma.js';
import { createNotification } from '../api/notifications.js';

const INTERVAL_MS = 60 * 60 * 1000;            // every 1 hour
const DRIFT_THRESHOLD_SEC = 30 * 60;           // 30 minutes
const SUPER_ADMIN_EMAIL = 'admin@eversense.ai';
// Track which tasks we've already alerted on so we don't spam every hour
// with the same drift. Reset every 24h so persistent drift gets re-flagged.
let alertedTaskIds = new Set();
let alertResetTs   = Date.now();

function fmtHours(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

async function runReconciliation() {
  if (!process.env.DATABASE_URL) return;
  if (/^(1|true|yes)$/i.test(process.env.RECONCILIATION_DISABLED || '')) return;

  // Reset the alert set every 24h
  if (Date.now() - alertResetTs > 24 * 3600 * 1000) {
    alertedTaskIds = new Set();
    alertResetTs   = Date.now();
  }

  try {
    // Find tasks where SUM(time_logs.duration) disagrees with actualHours by
    // more than the threshold. We compare in seconds (actualHours * 3600) so
    // tasks with no time_logs OR no actualHours both surface.
    const driftRows = await prisma.$queryRawUnsafe(
      `SELECT mt.id, mt.title, mt.actualHours, mt.orgId,
              COALESCE(SUM(tl.duration), 0) AS time_logs_secs,
              ROUND(mt.actualHours * 3600) AS actual_secs,
              ABS(ROUND(mt.actualHours * 3600) - COALESCE(SUM(tl.duration), 0)) AS drift_secs
         FROM macro_tasks mt
         LEFT JOIN time_logs tl ON tl.taskId = mt.id AND tl.end IS NOT NULL
        GROUP BY mt.id
       HAVING drift_secs > ${DRIFT_THRESHOLD_SEC}
        ORDER BY drift_secs DESC
        LIMIT 50`
    );

    if (!driftRows.length) {
      console.log('[Reconciliation] ✓ no drift detected');
      return;
    }

    console.log(`[Reconciliation] ⚠ ${driftRows.length} task(s) with drift > 30min`);

    // Look up super admin user once
    const adminRows = await prisma.$queryRawUnsafe(
      `SELECT u.id, m.orgId FROM \`User\` u
         LEFT JOIN memberships m ON m.userId = u.id
        WHERE u.email = ? LIMIT 1`,
      SUPER_ADMIN_EMAIL
    ).catch(() => []);
    if (!adminRows.length) {
      console.warn('[Reconciliation] super admin not found, skipping notify');
      return;
    }
    const adminId = adminRows[0].id;

    let newAlerts = 0;
    for (const r of driftRows) {
      if (alertedTaskIds.has(r.id)) continue; // already alerted in this 24h window
      alertedTaskIds.add(r.id);
      newAlerts++;

      const actualSec   = Number(r.actual_secs);
      const timeLogsSec = Number(r.time_logs_secs);
      const driftSec    = Number(r.drift_secs);
      const direction   = actualSec > timeLogsSec ? 'actualHours > time_logs' : 'time_logs > actualHours';

      try {
        await createNotification({
          userId: adminId,
          orgId:  r.orgId,
          title:  `Drift: ${r.title || r.id.slice(0, 8)}`,
          body:   `Task "${r.title || r.id}" has ${fmtHours(driftSec)} drift. ` +
                  `actualHours=${fmtHours(actualSec)}, time_logs sum=${fmtHours(timeLogsSec)}. ` +
                  `(${direction})`,
          link:   `/super-admin?taskId=${r.id}`,
          type:   'warning',
        });
      } catch (e) {
        console.warn('[Reconciliation] notify error:', e.message);
      }

      console.log(`  · ${r.title?.slice(0, 50) || r.id.slice(0, 8)} drift=${fmtHours(driftSec)} (${direction})`);
    }
    if (newAlerts > 0) console.log(`[Reconciliation] alerted on ${newAlerts} new task(s)`);
  } catch (err) {
    console.error('[Reconciliation] error:', err.message);
  }
}

export function startReconciliationCron() {
  // Delay first run 30s after boot so DB is ready and other crons have settled.
  setTimeout(runReconciliation, 30 * 1000);
  setInterval(runReconciliation, INTERVAL_MS);
  console.log(`  ✅ Reconciliation cron started (every 1h, threshold: ${DRIFT_THRESHOLD_SEC}s, recipient: ${SUPER_ADMIN_EMAIL})`);
}
