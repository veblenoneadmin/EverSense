// backend/services/dailyPersonReportScheduler.js
// Daily per-person completion digest — 5:00 PM AWST (09:00 UTC)
// Sends ONE email per org covering each member's tasks completed today,
// with actual hours logged today, plus project + milestone connections.
// Recipients: admin@veblengroup.com.au + genesis@veblengroup.com.au

import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma.js';

const RECIPIENTS = ['admin@veblengroup.com.au', 'genesis@veblengroup.com.au'];

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

function fmtDate(d) {
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Tasks "completed today": macro_tasks.completedAt within window (or status=completed + updatedAt in window as fallback).
// Attribute to: task owner (macro_tasks.userId) AND any task_assignees rows whose status='completed' for that task.
async function getOrgDailyReport(orgId, start, end) {
  // 1. Pull candidate tasks
  const tasks = await prisma.$queryRawUnsafe(
    `SELECT mt.id, mt.title, mt.userId, mt.projectId, mt.milestoneId,
            mt.completedAt, mt.actualHours, mt.isTeamTask,
            p.name as projectName
       FROM macro_tasks mt
       LEFT JOIN projects p ON p.id = mt.projectId
      WHERE mt.orgId = ?
        AND mt.status = 'completed'
        AND (
          (mt.completedAt IS NOT NULL AND mt.completedAt >= ? AND mt.completedAt <= ?)
          OR (mt.completedAt IS NULL AND mt.updatedAt >= ? AND mt.updatedAt <= ?)
        )`,
    orgId, start, end, start, end
  );

  if (tasks.length === 0) return { members: [] };

  const taskIds = tasks.map(t => t.id);
  const ph = taskIds.map(() => '?').join(',');

  // 2. Milestone names
  const milestoneIds = [...new Set(tasks.map(t => t.milestoneId).filter(Boolean))];
  const msMap = {};
  if (milestoneIds.length > 0) {
    const mph = milestoneIds.map(() => '?').join(',');
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, name FROM project_milestones WHERE id IN (${mph})`,
      ...milestoneIds
    ).catch(() => []);
    for (const r of rows) msMap[r.id] = r.name;
  }

  // 3. Per-assignee completions (team tasks)
  const assigneeRows = await prisma.$queryRawUnsafe(
    `SELECT taskId, userId FROM task_assignees
      WHERE taskId IN (${ph}) AND status = 'completed'`,
    ...taskIds
  ).catch(() => []);

  // 4. Hours logged today per (userId, taskId).
  // Computes overlap with [start, end] so a log's contribution is the time
  // it actually spent in today's window — even if begin/end straddle midnight
  // or the log is still open (end IS NULL).
  const logRows = await prisma.$queryRawUnsafe(
    `SELECT userId, taskId,
            SUM(GREATEST(0, TIMESTAMPDIFF(
              SECOND,
              GREATEST(\`begin\`, ?),
              LEAST(COALESCE(\`end\`, NOW(3)), ?)
            ))) AS secs
       FROM time_logs
      WHERE orgId = ?
        AND taskId IN (${ph})
        AND \`begin\` <= ?
        AND (\`end\` IS NULL OR \`end\` >= ?)
      GROUP BY userId, taskId`,
    start, end, orgId, ...taskIds, end, start
  ).catch((e) => { console.error('[DailyPersonReport] time_logs query error:', e.message); return []; });
  const hoursMap = new Map(); // key = `${userId}:${taskId}` → hours
  for (const r of logRows) {
    hoursMap.set(`${r.userId}:${r.taskId}`, Number(r.secs || 0) / 3600);
  }
  console.log(`[DailyPersonReport] time_logs overlap rows: ${logRows.length}`);

  // 5. Attribute each task to users who "finished" it today
  // owner + assignees-with-completed-status, deduped
  const taskAssignees = new Map(); // taskId → Set(userId)
  for (const t of tasks) {
    const set = new Set();
    if (t.userId) set.add(t.userId);
    taskAssignees.set(t.id, set);
  }
  for (const a of assigneeRows) {
    const set = taskAssignees.get(a.taskId);
    if (set) set.add(a.userId);
  }

  // 6. Group by user
  const perUser = new Map(); // userId → [{ task fields }]
  for (const t of tasks) {
    const users = taskAssignees.get(t.id) || new Set();
    for (const uid of users) {
      if (!perUser.has(uid)) perUser.set(uid, []);
      perUser.get(uid).push({
        title: t.title,
        projectName: t.projectName || null,
        milestoneName: msMap[t.milestoneId] || null,
        hoursToday: +(hoursMap.get(`${uid}:${t.id}`) || 0).toFixed(2),
        actualHoursTotal: t.actualHours != null ? Number(t.actualHours) : 0,
      });
    }
  }

  if (perUser.size === 0) return { members: [] };

  // 7. Resolve user names
  const userIds = [...perUser.keys()];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  const members = userIds.map(uid => {
    const u = userMap.get(uid);
    const items = perUser.get(uid);
    const totalHoursToday = items.reduce((s, x) => s + x.hoursToday, 0);
    return {
      userId: uid,
      name: u?.name || u?.email || 'Unknown',
      email: u?.email || '',
      tasks: items,
      totalHoursToday: +totalHoursToday.toFixed(2),
      taskCount: items.length,
    };
  }).sort((a, b) => b.taskCount - a.taskCount || b.totalHoursToday - a.totalHoursToday);

  return { members };
}

function buildHTML(orgName, report, dateLabel) {
  const { members } = report;

  if (members.length === 0) {
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#141414;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:720px;margin:0 auto;padding:24px 16px;">
  <div style="background:#1e1e1e;border:1px solid #3c3c3c;border-radius:12px;padding:28px;">
    <div style="font-size:11px;color:#909090;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Daily Completion Digest</div>
    <h1 style="margin:0 0 4px;font-size:22px;color:#f0f0f0;">${orgName}</h1>
    <p style="margin:0;font-size:13px;color:#909090;">${dateLabel} · 5:00 PM AWST</p>
    <p style="margin-top:20px;font-size:13px;color:#c0c0c0;">No tasks were completed today.</p>
  </div>
</div></body></html>`;
  }

  const taskRow = (t) => {
    const meta = [];
    if (t.projectName) meta.push(`<span style="color:#569cd6;">${t.projectName}</span>`);
    if (t.milestoneName) meta.push(`<span style="color:#c586c0;">◆ ${t.milestoneName}</span>`);
    const metaLine = meta.length > 0 ? `<div style="font-size:11px;color:#909090;margin-top:3px;">${meta.join(' · ')}</div>` : '';
    return `<tr style="border-bottom:1px solid #2d2d2d;">
      <td style="padding:10px 12px;font-size:13px;color:#dcdcdc;">
        ${t.title}${metaLine}
      </td>
      <td style="padding:10px 12px;font-size:13px;color:#4ec9b0;font-weight:600;text-align:right;white-space:nowrap;">${t.hoursToday}h</td>
    </tr>`;
  };

  const memberSection = (m) => `
    <div style="background:#1e1e1e;border:1px solid #3c3c3c;border-radius:12px;overflow:hidden;margin-bottom:14px;">
      <div style="padding:14px 16px;border-bottom:1px solid #2d2d2d;display:flex;justify-content:space-between;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#f0f0f0;">${m.name}</div>
          <div style="font-size:11px;color:#909090;margin-top:2px;">${m.email}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px;font-weight:700;color:#4ec9b0;">${m.taskCount} done</div>
          <div style="font-size:11px;color:#909090;margin-top:2px;">${m.totalHoursToday}h logged today</div>
        </div>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tbody>${m.tasks.map(taskRow).join('')}</tbody>
      </table>
    </div>`;

  const orgTotalTasks = members.reduce((s, m) => s + m.taskCount, 0);
  const orgTotalHours = +members.reduce((s, m) => s + m.totalHoursToday, 0).toFixed(2);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#141414;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:720px;margin:0 auto;padding:24px 16px;">
  <div style="background:#1e1e1e;border:1px solid #3c3c3c;border-radius:12px;padding:24px;margin-bottom:16px;">
    <div style="font-size:11px;color:#909090;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Daily Completion Digest</div>
    <h1 style="margin:0 0 4px;font-size:22px;color:#f0f0f0;">${orgName}</h1>
    <p style="margin:0 0 14px;font-size:13px;color:#909090;">${dateLabel} · 5:00 PM AWST</p>
    <div style="display:flex;gap:16px;">
      <div><span style="font-size:24px;font-weight:700;color:#4ec9b0;font-family:monospace;">${orgTotalTasks}</span>
        <span style="font-size:11px;color:#909090;margin-left:6px;text-transform:uppercase;letter-spacing:1px;">tasks done</span></div>
      <div><span style="font-size:24px;font-weight:700;color:#569cd6;font-family:monospace;">${orgTotalHours}h</span>
        <span style="font-size:11px;color:#909090;margin-left:6px;text-transform:uppercase;letter-spacing:1px;">logged</span></div>
      <div><span style="font-size:24px;font-weight:700;color:#dcdcaa;font-family:monospace;">${members.length}</span>
        <span style="font-size:11px;color:#909090;margin-left:6px;text-transform:uppercase;letter-spacing:1px;">people</span></div>
    </div>
  </div>
  ${members.map(memberSection).join('')}
  <div style="text-align:center;padding:12px;">
    <p style="margin:0;font-size:11px;color:#555;">Sent automatically by EverSense · 5:00 PM AWST</p>
  </div>
</div></body></html>`;
}

async function sendForOrg(org, start, end, dateLabel) {
  try {
    const report = await getOrgDailyReport(org.id, start, end);
    const html = buildHTML(org.name, report, dateLabel);
    await transporter.sendMail({
      from: `"EverSense Reports" <${process.env.SMTP_USER}>`,
      to: RECIPIENTS.join(', '),
      subject: `📋 Daily Completions — ${org.name} — ${dateLabel}`,
      html,
    });
    console.log(`[DailyPersonReport] ✅ sent for ${org.name} — ${report.members.length} member(s), ${report.members.reduce((s, m) => s + m.taskCount, 0)} task(s)`);
  } catch (err) {
    console.error(`[DailyPersonReport] ❌ failed for ${org.name}:`, err.message);
  }
}

async function runAll() {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const dateLabel = fmtDate(now);

  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`[DailyPersonReport] Running for ${orgs.length} org(s)…`);
  await Promise.allSettled(orgs.map(org => sendForOrg(org, start, end, dateLabel)));
}

// Dependency-free daily scheduler: check every minute for 09:00 UTC (5pm AWST),
// fire once per UTC day. Tracks last-run-day in memory to avoid re-firing.
let lastFiredUtcDay = null;
export function startDailyPersonReportScheduler() {
  setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() !== 9 || now.getUTCMinutes() !== 0) return;
    const dayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    if (lastFiredUtcDay === dayKey) return;
    lastFiredUtcDay = dayKey;
    runAll().catch(e => console.error('[DailyPersonReport] runAll error:', e.message));
  }, 60 * 1000);
  console.log('[DailyPersonReport] ✅ Scheduled — daily at 5:00 PM AWST (09:00 UTC)');
}

// Expose manual trigger for admin route
export { runAll as runDailyPersonReportNow };
