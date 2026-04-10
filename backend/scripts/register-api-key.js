/**
 * One-off script to register an API key for external use (n8n / Dredd).
 *
 * Usage: node backend/scripts/register-api-key.js
 *
 * This inserts the key directly into the api_keys table.
 * The key is stored as plain text (no hashing) — matches apiKeyAuth.js lookup.
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const KEY   = 'es_8dcf26b1f5bdf6c3e1cdc76ee38f4509fec14073c0d4633d77d32f045993099f';
const ORG_ID = 'cmmawrixu0002qu20rsy4kryc';  // Veblen
const LABEL  = 'Dred Client Provisioning';

async function main() {
  // Ensure the table exists
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS api_keys (' +
    '  id          VARCHAR(191) NOT NULL,' +
    '  `key`       VARCHAR(128) NOT NULL,' +
    '  name        VARCHAR(255) NOT NULL,' +
    '  orgId       VARCHAR(191) NOT NULL,' +
    '  userId      VARCHAR(36)  NOT NULL,' +
    '  lastUsedAt  DATETIME(3)  NULL,' +
    '  revokedAt   DATETIME(3)  NULL,' +
    '  createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
    '  PRIMARY KEY (id),' +
    '  UNIQUE KEY api_keys_key_unique (`key`),' +
    '  KEY api_keys_orgId_idx (orgId),' +
    '  KEY api_keys_userId_idx (userId)' +
    ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  ).catch(() => {});

  // Check if key already exists
  const existing = await prisma.$queryRawUnsafe(
    'SELECT id FROM api_keys WHERE `key` = ? LIMIT 1', KEY
  );
  if (existing.length > 0) {
    console.log('⚠️  Key already registered:', existing[0].id);
    // Make sure it's not revoked
    await prisma.$executeRawUnsafe(
      'UPDATE api_keys SET revokedAt = NULL WHERE `key` = ?', KEY
    );
    console.log('✅ Ensured key is active (revokedAt = NULL)');
    await prisma.$disconnect();
    return;
  }

  // Find the OWNER of the org to attach the key to
  const owner = await prisma.membership.findFirst({
    where: { orgId: ORG_ID, role: 'OWNER' },
    select: { userId: true },
  });

  if (!owner) {
    // Fallback: find any ADMIN
    const admin = await prisma.membership.findFirst({
      where: { orgId: ORG_ID, role: { in: ['ADMIN', 'HALL_OF_JUSTICE'] } },
      select: { userId: true },
    });
    if (!admin) {
      console.error('❌ No OWNER or ADMIN found for org', ORG_ID);
      await prisma.$disconnect();
      process.exit(1);
    }
    owner.userId = admin.userId;
  }

  console.log(`Found org owner: ${owner.userId}`);

  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    'INSERT INTO api_keys (id, `key`, name, orgId, userId, createdAt) VALUES (?, ?, ?, ?, ?, NOW(3))',
    id, KEY, LABEL, ORG_ID, owner.userId
  );

  console.log('✅ API key registered:');
  console.log(`   ID:    ${id}`);
  console.log(`   Key:   ${KEY.slice(0, 20)}...`);
  console.log(`   Label: ${LABEL}`);
  console.log(`   OrgId: ${ORG_ID}`);
  console.log(`   User:  ${owner.userId}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
