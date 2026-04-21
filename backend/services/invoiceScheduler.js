// backend/services/invoiceScheduler.js
// Bi-weekly payroll invoice generation.
// Fires once per day at 08:00 AWST (00:00 UTC). If today is the 15th OR
// the last day of the month, generate invoices for every org. Idempotent
// via UNIQUE(userId, orgId, periodStart, periodEnd) — safe to re-run.

import { prisma } from '../lib/prisma.js';
import { generateInvoicesForOrg, ensureInvoicesTable } from '../api/invoices.js';

function isLastDayOfMonth(d) {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.getUTCMonth() !== d.getUTCMonth();
}

async function runAll() {
  await ensureInvoicesTable();
  const now = new Date();
  const day = now.getUTCDate();
  const lastDay = isLastDayOfMonth(now);

  if (day !== 15 && !lastDay) {
    console.log(`[InvoiceScheduler] Day ${day} is not a payroll day, skipping.`);
    return;
  }

  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`[InvoiceScheduler] 💰 Generating bi-weekly invoices for ${orgs.length} org(s)…`);
  for (const org of orgs) {
    try {
      const r = await generateInvoicesForOrg(org.id, now);
      console.log(`[InvoiceScheduler] ✅ ${org.name}: created=${r.created} skipped=${r.skipped}`);
    } catch (e) {
      console.error(`[InvoiceScheduler] ❌ ${org.name}:`, e.message);
    }
  }
}

let lastFiredUtcDay = null;
export function startInvoiceScheduler() {
  setInterval(() => {
    const now = new Date();
    // 08:00 AWST = 00:00 UTC
    if (now.getUTCHours() !== 0 || now.getUTCMinutes() !== 0) return;
    const dayKey = now.toISOString().slice(0, 10);
    if (lastFiredUtcDay === dayKey) return;
    lastFiredUtcDay = dayKey;
    runAll().catch(e => console.error('[InvoiceScheduler] runAll error:', e.message));
  }, 60 * 1000);
  console.log('[InvoiceScheduler] ✅ Scheduled — daily at 08:00 AWST (00:00 UTC)');
}

export { runAll as runInvoiceGenerationNow };
