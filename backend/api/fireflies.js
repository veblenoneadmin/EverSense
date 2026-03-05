// backend/api/fireflies.js — Fireflies webhook + transcript storage + notifications

import express from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { fetchTranscript, fetchLatestTranscripts } from '../lib/fireflies.js';
import { requireAuth, withOrgScope } from '../lib/rbac.js';

const router = express.Router();

// ── Table setup ───────────────────────────────────────────────────────────────
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
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `fireflies_transcripts` (' +
      '  `id` VARCHAR(191) NOT NULL,' +
      '  `title` VARCHAR(500) NOT NULL,' +
      '  `date` DATETIME(3) NULL,' +
      '  `duration` INT NULL,' +
      '  `participants` TEXT NULL,' +
      '  `overview` TEXT NULL,' +
      '  `action_items` TEXT NULL,' +
      '  `keywords` VARCHAR(1000) NULL,' +
      '  `outline` TEXT NULL,' +
      '  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      '  PRIMARY KEY (`id`),' +
      '  KEY `ft_date_idx` (`date`),' +
      '  KEY `ft_createdAt_idx` (`createdAt`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    tablesReady = true;
    console.log('  ✅ fireflies_transcripts table ready');
  } catch (_e) { /* tables likely exist */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function tryParseJSON(str, fallback = []) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function buildNotifBody(transcript) {
  const { date, duration, summary } = transcript;
  const dateStr = date
    ? new Date(typeof date === 'number' ? date : date).toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;
  const durationMin = duration ? Math.round(duration / 60) : null;
  const lines = [];
  if (dateStr)     lines.push(`Date: ${dateStr}`);
  if (durationMin) lines.push(`Duration: ${durationMin} min`);
  if (summary?.overview) { lines.push(''); lines.push('Summary:'); lines.push(summary.overview); }
  if (summary?.action_items) { lines.push(''); lines.push('Action Items:'); lines.push(summary.action_items); }
  if (summary?.keywords) { lines.push(''); lines.push(`Keywords: ${summary.keywords}`); }
  return lines.join('\n');
}

// ── Core: store transcript + send notifications ───────────────────────────────
// Returns true if this was a new transcript, false if already stored.
async function processTranscript(transcript) {
  const { id, title, date, duration, participants = [], summary } = transcript;
  if (!id) return false;

  await ensureTables();

  // Check if already stored
  const existing = await prisma.$queryRawUnsafe(
    'SELECT id, overview FROM fireflies_transcripts WHERE id = ? LIMIT 1', id
  );

  // Parse date safely
  let parsedDate = null;
  if (date) {
    const d = typeof date === 'number' ? new Date(date) : new Date(date);
    parsedDate = isNaN(d.getTime()) ? null : d;
  }

  const hasSummary = !!(summary?.overview || summary?.action_items || summary?.keywords || summary?.outline);

  if (existing.length) {
    // Already stored — if it had no summary before but now has one, update it
    if (!existing[0].overview && hasSummary) {
      await prisma.$executeRawUnsafe(
        'UPDATE fireflies_transcripts SET overview=?, action_items=?, keywords=?, outline=? WHERE id=?',
        summary.overview || null,
        summary.action_items || null,
        summary.keywords || null,
        summary.outline || null,
        id,
      );
      console.log(`[Fireflies] Updated summary for: "${title}"`);
      return true; // treat as new so notifications are sent
    }
    return false; // fully up to date, skip
  }

  // New transcript — store it
  await prisma.$executeRawUnsafe(
    'INSERT INTO fireflies_transcripts (id, title, date, duration, participants, overview, action_items, keywords, outline, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    id,
    title?.trim() || 'Untitled Meeting',
    parsedDate,
    duration || null,
    JSON.stringify(participants.map(e => String(e).trim()).filter(Boolean)),
    summary?.overview   || null,
    summary?.action_items || null,
    summary?.keywords   || null,
    summary?.outline    || null,
  );

  // Match participants to EverSense users
  const lcEmails = participants.map(e => String(e).toLowerCase().trim()).filter(Boolean);
  if (!lcEmails.length) {
    console.log(`[Fireflies] Stored transcript "${title}" — no participants to notify`);
    return true;
  }

  // Use Prisma ORM to avoid case-sensitive table name issues (User vs user on MySQL)
  // lcEmails are already lowercase; MySQL utf8mb4_unicode_ci is case-insensitive so this matches
  const users = await prisma.user.findMany({
    where: { email: { in: lcEmails } },
    select: { id: true, email: true },
  }).catch(() => []);

  if (!users.length) {
    console.log(`[Fireflies] Stored "${title}" — no matching users for: ${lcEmails.join(', ')}`);
    return true;
  }

  const notifTitle = `Meeting Summary: ${title?.trim() || 'Untitled Meeting'}`;
  const notifBody  = buildNotifBody(transcript);
  const notifLink  = `/meetings/${id}`;
  let notified = 0;

  for (const user of users) {
    const memberships = await prisma.membership.findMany({
      where:  { userId: user.id },
      select: { orgId: true },
    });
    for (const { orgId } of memberships) {
      await prisma.$executeRawUnsafe(
        'INSERT INTO notifications (id, userId, orgId, title, body, link, type, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW())',
        randomUUID(), user.id, orgId, notifTitle, notifBody, notifLink, 'meeting'
      );
      notified++;
    }
  }

  console.log(`[Fireflies] Stored + sent ${notified} notification(s) for: "${title}"`);
  return true;
}

// ── POST /api/fireflies/webhook ───────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  res.json({ received: true }); // respond immediately so Fireflies doesn't retry

  try {
    const { meetingId, transcriptId } = req.body;
    const id = meetingId || transcriptId;
    if (!id) { console.warn('[Fireflies] Webhook with no id'); return; }

    console.log(`[Fireflies] Webhook — fetching transcript: ${id}`);
    const transcript = await fetchTranscript(id);
    if (!transcript) { console.warn(`[Fireflies] No transcript for id: ${id}`); return; }

    await processTranscript(transcript);
  } catch (err) {
    console.error('[Fireflies] Webhook error:', err.message);
  }
});

// ── GET /api/fireflies/transcripts ────────────────────────────────────────────
router.get('/transcripts', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTables();
    const rows = await prisma.$queryRawUnsafe(
      'SELECT id, title, date, duration, participants, overview, action_items, keywords, createdAt ' +
      'FROM fireflies_transcripts ORDER BY date DESC, createdAt DESC LIMIT 50'
    );
    const transcripts = rows.map(r => ({
      ...r,
      participants: tryParseJSON(r.participants, []),
    }));
    res.json({ success: true, transcripts });
  } catch (err) {
    console.error('[Fireflies] GET /transcripts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/fireflies/transcripts/:id ───────────────────────────────────────
router.get('/transcripts/:id', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureTables();
    const rows = await prisma.$queryRawUnsafe(
      'SELECT * FROM fireflies_transcripts WHERE id = ? LIMIT 1', req.params.id
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Transcript not found' });
    const t = rows[0];
    res.json({ success: true, transcript: { ...t, participants: tryParseJSON(t.participants, []) } });
  } catch (err) {
    console.error('[Fireflies] GET /transcripts/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/fireflies/status ─────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  res.json({ connected: !!process.env.FIREFLIES_API_KEY });
});

// ── Polling: check Fireflies every 30 minutes ─────────────────────────────────
export async function startFirefliesPolling() {
  if (!process.env.FIREFLIES_API_KEY) {
    console.log('[Fireflies] No API key — polling disabled');
    return;
  }

  const poll = async () => {
    try {
      console.log('[Fireflies] Polling for latest transcripts...');
      const transcripts = await fetchLatestTranscripts();
      let newCount = 0;
      for (const t of transcripts) {
        try {
          const isNew = await processTranscript(t);
          if (isNew) newCount++;
        } catch (e) {
          console.error('[Fireflies] Poll: error processing transcript:', t.id, e.message);
        }
      }
      if (newCount) console.log(`[Fireflies] Poll complete — ${newCount} new transcript(s)`);
      else console.log('[Fireflies] Poll complete — no new transcripts');
    } catch (err) {
      console.error('[Fireflies] Poll error:', err.message);
    }
  };

  // Run once immediately, then every 30 minutes
  await poll();
  setInterval(poll, 30 * 60 * 1000);
}

// ── POST /api/fireflies/sync — manual sync trigger ────────────────────────────
router.post('/sync', requireAuth, async (req, res) => {
  if (!process.env.FIREFLIES_API_KEY) {
    return res.status(503).json({ success: false, error: 'FIREFLIES_API_KEY not configured' });
  }
  try {
    const transcripts = await fetchLatestTranscripts();
    let newCount = 0;
    for (const t of transcripts) {
      try {
        const isNew = await processTranscript(t);
        if (isNew) newCount++;
      } catch (e) {
        console.error('[Fireflies] Sync: error processing transcript:', t.id, e.message);
      }
    }
    res.json({ success: true, total: transcripts.length, newCount });
  } catch (err) {
    console.error('[Fireflies] Manual sync error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
