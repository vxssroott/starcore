// src/lib/notifications/worker.ts

/**
 * Worker skeleton
 * - fetches a small batch (via fetchNextBatch)
 * - for each row, call the appropriate adapter (email/sms/push)
 * - record attempt via NotificationClient.markAttempt
 * - respects idempotency and SKIP LOCKED behavior
 */

import { NotificationClient } from './index';

export async function runWorker(nc: NotificationClient) {
  // very small example loop — production should use backoff, concurrency limits
  const batch = await nc.fetchNextBatch(20);
  for (const row of batch) {
    try {
      // choose adapter based on row.channel or template
      // TODO: implement adapters and template rendering
      const channel = row.channel ?? 'in_app';

      // Example: pretend delivery succeeded
      const providerResponse = { ok: true };
      await nc.markAttempt(row.id, channel as any, true, providerResponse);
    } catch (err) {
      const providerResponse = { error: (err as Error).message };
      await nc.markAttempt(row.id, (row.channel ?? 'in_app') as any, false, providerResponse);
    }
  }
}
