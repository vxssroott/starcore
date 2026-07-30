// src/integrations/retry.ts

import pool from '../db';
import { IntegrationRequest } from './types';

export async function enqueueRetry(req: IntegrationRequest, attempt = 0) {
  // simple outbox-style enqueue
  await pool.query(`INSERT INTO integrations.retry_queue(request_id, provider, type, payload, attempt, next_at) VALUES($1,$2,$3,$4,$5,now() + interval '1 minute')`, [req.id, req.provider, req.type, JSON.stringify(req.payload), attempt]);
}

export async function dequeueDue(limit = 20) {
  const res = await pool.query(`SELECT * FROM integrations.dequeue_due($1)`, [limit]);
  return res.rows as any[];
}
