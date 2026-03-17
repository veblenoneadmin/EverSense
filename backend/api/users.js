import express from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/rbac.js';

const router = express.Router();

// POST /api/users/avatar — save base64 avatar to user.image
router.post('/avatar', requireAuth, async (req, res) => {
  try {
    const { dataUrl } = req.body;
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    await prisma.$executeRawUnsafe(
      'UPDATE `User` SET `image` = ?, `updatedAt` = NOW() WHERE `id` = ?',
      dataUrl,
      req.user.id
    );

    res.json({ success: true });
  } catch (e) {
    console.error('Avatar upload error:', e.message);
    res.status(500).json({ error: 'Failed to save avatar' });
  }
});

// DELETE /api/users/avatar — remove avatar
router.delete('/avatar', requireAuth, async (req, res) => {
  try {
    await prisma.$executeRawUnsafe(
      'UPDATE `User` SET `image` = NULL, `updatedAt` = NOW() WHERE `id` = ?',
      req.user.id
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Avatar delete error:', e.message);
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

export default router;
