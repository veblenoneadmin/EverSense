// backend/api/notifications.js — Notifications CRUD
import express from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, withOrgScope } from '../lib/rbac.js';

const router = express.Router();

// ── Lazy table init ───────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `notifications` (' +
      '  `id` VARCHAR(191) NOT NULL,' +
      '  `userId` VARCHAR(36) NOT NULL,' +
      '  `orgId` VARCHAR(191) NOT NULL,' +
      '  `title` VARCHAR(500) NOT NULL,' +
      '  `body` TEXT NULL,' +
      '  `link` VARCHAR(500) NULL,' +
      '  `type` VARCHAR(50) NOT NULL DEFAULT \'info\',' +
      '  `isRead` TINYINT(1) NOT NULL DEFAULT 0,' +
      '  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      '  PRIMARY KEY (`id`),' +
      '  KEY `notif_userId_idx` (`userId`),' +
      '  KEY `notif_orgId_userId_idx` (`orgId`, `userId`),' +
      '  KEY `notif_createdAt_idx` (`createdAt`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    tablesReady = true;
    console.log('[Notifications] Table ready');
  } catch (e) {
    console.error('[Notifications] Table init error:', e.message);
  }
}

// ── GET /api/notifications ────────────────────────────────────────────────────
router.get('/', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTables();
    const limit = Math.min(parseInt(req.query.limit || '30'), 50);

    const notifications = await prisma.$queryRawUnsafe(
      'SELECT * FROM notifications WHERE userId = ? AND orgId = ? ORDER BY createdAt DESC LIMIT ?',
      req.user.id, req.orgId, limit
    );

    const unreadCount = await prisma.$queryRawUnsafe(
      'SELECT COUNT(*) as cnt FROM notifications WHERE userId = ? AND orgId = ? AND isRead = 0',
      req.user.id, req.orgId
    );

    res.json({
      notifications: notifications.map(n => ({
        id: n.id,
        title: n.title,
        body: n.body,
        link: n.link,
        type: n.type,
        isRead: !!n.isRead,
        createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
      })),
      unreadCount: Number(unreadCount[0]?.cnt ?? 0),
    });
  } catch (err) {
    console.error('[Notifications] list error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ── PUT /api/notifications/read-all ──────────────────────────────────────────
router.put('/read-all', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTables();
    await prisma.$executeRawUnsafe(
      'UPDATE notifications SET isRead = 1 WHERE userId = ? AND orgId = ?',
      req.user.id, req.orgId
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('[Notifications] read-all error:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// ── PUT /api/notifications/:id/read ──────────────────────────────────────────
router.put('/:id/read', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTables();
    await prisma.$executeRawUnsafe(
      'UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ? AND orgId = ?',
      req.params.id, req.user.id, req.orgId
    );
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('[Notifications] read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// ── POST /api/notifications (internal — called by other routes) ───────────────
router.post('/', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTables();
    const { userId, title, body, link, type = 'info' } = req.body;
    if (!userId || !title) {
      return res.status(400).json({ error: 'userId and title are required' });
    }
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      'INSERT INTO notifications (id, userId, orgId, title, body, link, type, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(3))',
      id, userId, req.orgId, title, body || null, link || null, type
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error('[Notifications] create error:', err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
router.delete('/:id', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTables();
    await prisma.$executeRawUnsafe(
      'DELETE FROM notifications WHERE id = ? AND userId = ? AND orgId = ?',
      req.params.id, req.user.id, req.orgId
    );
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('[Notifications] delete error:', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;

// Types that warrant an email notification
const EMAIL_TYPES = new Set(['task', 'comment', 'overdue', 'due_soon', 'reminder']);

// ── Helper exported for other routes to create notifications ─────────────────
export async function createNotification({ userId, orgId, title, body = null, link = null, type = 'info' }) {
  try {
    await ensureTables();
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      'INSERT INTO notifications (id, userId, orgId, title, body, link, type, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(3))',
      id, userId, orgId, title, body, link, type
    );

    // Send email for important notification types (non-blocking)
    if (EMAIL_TYPES.has(type) && process.env.SMTP_HOST) {
      sendNotificationEmail(userId, title, body, link, type).catch(() => {});
    }
  } catch (e) {
    // Non-critical — don't throw
    console.error('[Notifications] createNotification error:', e.message);
  }
}

async function sendNotificationEmail(userId, title, body, link, type) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user?.email) return;

    const { transporter } = await import('../lib/mailer.js');
    const appUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || 'https://eversense.app';
    const fullLink = link ? `${appUrl}${link}` : appUrl;

    const iconMap = { task: '📋', comment: '💬', overdue: '⚠️', due_soon: '⏰', reminder: '🔔' };
    const icon = iconMap[type] || '🔔';

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: user.email,
      subject: `${icon} ${title}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f4f4f7;">
  <div style="max-width: 560px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #1e1e2e, #2d2d3f); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
      <span style="font-size: 28px; font-weight: 700; color: #fff;">EverSense</span>
    </div>
    <div style="background: #fff; padding: 28px 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
      <p style="margin: 0 0 6px; font-size: 13px; color: #888;">Hi ${user.name || 'there'},</p>
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #1a1a2e;">${icon} ${title}</h2>
      ${body ? `<p style="margin: 0 0 20px; font-size: 14px; color: #555; line-height: 1.6;">${body}</p>` : ''}
      <div style="text-align: center; margin: 24px 0;">
        <a href="${fullLink}" style="display: inline-block; background: #007acc; color: #fff; text-decoration: none; padding: 11px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">View in EverSense</a>
      </div>
      <p style="margin: 16px 0 0; font-size: 12px; color: #aaa; text-align: center;">You received this because of your notification settings in EverSense.</p>
    </div>
  </div>
</body>
</html>`,
    });
  } catch (e) {
    console.error('[Notifications] email send error:', e.message);
  }
}
