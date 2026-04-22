// backend/lib/hrsense-notify.js — Fire-and-forget outbound webhooks to HRSense.
// Posts `{ event, data, ts }` to HRSENSE_WEBHOOK_URL with X-Internal-Secret header.
// Any caller can wrap their write path with this and not worry about blocking
// or erroring — failures are logged, never thrown.
//
// DORMANT BY DEFAULT: if HRSENSE_WEBHOOK_URL env var is not set, the function
// returns immediately and does nothing. Safe to import and call from anywhere.

const HRSENSE_URL = process.env.HRSENSE_WEBHOOK_URL || '';
const SECRET      = process.env.INTERNAL_API_SECRET || '';

/**
 * Fire an event to HRSense. Returns immediately; HTTP call runs in the background.
 * @param {string} event — e.g. 'contract.signed', 'invoice.paid'
 * @param {object} data  — event payload (must be JSON-serialisable)
 */
export function notifyHRSense(event, data = {}) {
  if (!HRSENSE_URL) return;   // disabled / dormant
  if (!SECRET) {
    console.warn('[HRSense] INTERNAL_API_SECRET missing; skipping', event);
    return;
  }
  // Non-blocking: kick off the fetch and forget. Any error stays inside this IIFE.
  (async () => {
    try {
      const body = JSON.stringify({ event, data, ts: new Date().toISOString() });
      const res = await fetch(HRSENSE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': SECRET,
        },
        body,
      });
      if (!res.ok) {
        console.warn(`[HRSense] ${event} → ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.warn(`[HRSense] ${event} send error:`, err.message);
    }
  })();
}
