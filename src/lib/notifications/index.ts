// src/lib/notifications/index.ts

import { Pool } from 'pg';
import { EnqueueArgs, QueueRow, NotificationChannel } from './types';

export class NotificationClient {
  pool: Pool;
  constructor(pool: Pool) {
    this.pool = pool;
  }

  async enqueue(args: EnqueueArgs): Promise<string> {
    const res = await this.pool.query(
      `SELECT notifications.enqueue_notification($1::text, $2::uuid, $3::text, $4::int, $5::notifications.notification_channel, $6::jsonb, $7::timestamptz, $8::int, $9::text, $10::text) as id`,
      [
        args.requestId ?? null,
        args.ownerId,
        args.templateName,
        args.templateVersion ?? null,
        args.channel ?? null,
        args.payload ? JSON.stringify(args.payload) : null,
        args.scheduledAt ?? null,
        args.priority ?? 100,
        args.aggregateType ?? null,
        args.aggregateId ?? null,
      ]
    );
    return res.rows[0].id;
  }

  async fetchNextBatch(batchSize = 50): Promise<QueueRow[]> {
    const res = await this.pool.query(`SELECT * FROM notifications.fetch_next_batch($1)`, [batchSize]);
    return res.rows as QueueRow[];
  }

  async markAttempt(queueId: string, channel: NotificationChannel, success: boolean, providerResponse: any = {}, maxAttempts = 5) {
    await this.pool.query(`SELECT notifications.mark_attempt($1::uuid, $2::notifications.notification_channel, $3::boolean, $4::jsonb, $5::int)`, [queueId, channel, success, JSON.stringify(providerResponse), maxAttempts]);
  }
}
