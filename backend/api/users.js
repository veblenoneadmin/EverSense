// backend/api/users.js — User profile endpoints (avatar, etc.)
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/rbac.js';

const router = express.Router();

let avatarColumnReady = false;

// ── POST /api/users/avatar ────────────────────────────────────────────────────
router.post('/avatar', requireAuth, async (req, res) => {
  const { dataUrl } = req.body;
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image data' });
  }
  if (dataUrl.length > 280000) {
    return res.status(400).json({ error: 'Image too large (max ~200KB).' });
  }

  if (!avatarColumnReady) {
    try {
      await prisma.$executeRawUnsafe('ALTER TABLE `user` MODIFY `image` MEDIUMTEXT NULL');
      console.log('✅ user.image column widened to MEDIUMTEXT');
    } catch (e) {
      console.warn('⚠️  ALTER TABLE user.image failed (may already be wide enough):', e.message);
    }
    avatarColumnReady = true;
  }

  try {
    await prisma.$executeRawUnsafe(
      'UPDATE `user` SET `image` = ?, `updatedAt` = NOW() WHERE `id` = ?',
      dataUrl, req.user.id
    );
    res.json({ success: true, image: dataUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/users/avatar ──────────────────────────────────────────────────
router.delete('/avatar', requireAuth, async (req, res) => {
  try {
    await prisma.$executeRawUnsafe(
      'UPDATE `user` SET `image` = NULL, `updatedAt` = NOW() WHERE `id` = ?',
      req.user.id
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
