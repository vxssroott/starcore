// src/workers/statementWorker.ts
// Worker skeleton that picks up scheduled jobs and runs them.

import { Pool } from 'pg';
import { ReportingService } from '../services/reportingService';

export class StatementWorker {
  private pool: Pool;
  private service: ReportingService;
  private running = false;

  constructor(pool: Pool) {
    this.pool = pool;
    this.service = new ReportingService(pool);
  }

  async runOnce(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Grab a single scheduled job using FOR UPDATE SKIP LOCKED pattern.
      const jobRes = await client.query(`
        SELECT id, statement_id, job_type, payload
        FROM reporting.statement_jobs
        WHERE scheduled_at <= now() AND status = 'scheduled'
        ORDER BY scheduled_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);

      if (jobRes.rowCount === 0) {
        await client.query('COMMIT');
        return;
      }

      const job = jobRes.rows[0];

      // mark running
      await client.query('UPDATE reporting.statement_jobs SET status = $1, run_at = now(), attempts = attempts + 1 WHERE id = $2', ['running', job.id]);
      await client.query('COMMIT');

      // Execute outside transaction
      try {
        if (job.job_type === 'generate') {
          // payload should contain tenant/account/dates
          const p = job.payload || {};
          await this.service.generateStatement({
            tenantId: p.tenantId,
            accountId: p.accountId,
            startDate: p.startDate,
            endDate: p.endDate,
            type: p.type || 'custom',
            generatedBy: p.generatedBy || null,
          });
        } else if (job.job_type === 'export') {
          // Implement export orchestration here (placeholder)
          // e.g. call internal exporter to generate CSV/PDF and then create export record
        }

        await client.query('UPDATE reporting.statement_jobs SET status = $1 WHERE id = $2', ['completed', job.id]);
      } catch (err) {
        await client.query('UPDATE reporting.statement_jobs SET status = $1, last_error = $2 WHERE id = $3', ['failed', String(err), job.id]);
      }
    } finally {
      client.release();
    }
  }

  async start(pollIntervalMs = 5000) {
    if (this.running) return;
    this.running = true;
    while (this.running) {
      try {
        await this.runOnce();
      } catch (err) {
        console.error('statement worker error', err);
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  stop() {
    this.running = false;
  }
}
