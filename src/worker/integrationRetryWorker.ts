// src/worker/integrationRetryWorker.ts

import pool from '../db';
import { dequeueDue } from '../integrations/retry';
import { providerManager } from '../integrations/manager';
import { auditLog } from '../lib/audit';

async function processBatch() {
  const rows = await dequeueDue(20);
  if (!rows || rows.length === 0) return;
  for (const r of rows) {
    const id = r.id;
    try {
      const req = {
        id: r.request_id,
        type: r.type,
        provider: r.provider,
        payload: r.payload,
      };
      await auditLog('retry.processing', { id: req.id, provider: req.provider, type: req.type });
      const res = await providerManager.handle(req as any);

      // Treat 'ok' and 'pending' as successful submission to provider
      if (res && (res.status === 'ok' || res.status === 'pending')) {
        await pool.query('DELETE FROM integrations.retry_queue WHERE id = $1', [id]);
        await auditLog('retry.success', { id: req.id, provider: req.provider, status: res.status });
      } else {
        throw new Error('provider returned failure: ' + JSON.stringify(res));
      }
    } catch (err) {
      console.error('retry worker error for id', r.id, String(err));
      // exponential backoff: next_at = now() + pow(2, attempt) minutes
      await pool.query(
        `UPDATE integrations.retry_queue
         SET attempt = attempt + 1,
             next_at = now() + ( (pow(2, attempt)::int) || ' minutes')::interval,
             locked = false,
             locked_at = NULL
         WHERE id = $1`,
        [id],
      );
      await auditLog('retry.failed', { id: r.request_id, error: String(err) });
    }
  }
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function main() {
  console.log('integration retry worker started');
  while (true) {
    try {
      await processBatch();
    } catch (err) {
      console.error('retry worker loop error', err);
    }
    const wait = parseInt(process.env.RETRY_POLL_INTERVAL_MS || '5000', 10);
    await sleep(wait);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
