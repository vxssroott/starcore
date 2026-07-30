// src/services/reportingService.ts
// Lightweight TypeScript service layer for the reporting subsystem.

import { Pool } from 'pg';

export type StatementType = 'monthly' | 'quarterly' | 'annual' | 'custom';

export interface GenerateStatementParams {
  tenantId: string;
  accountId: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  type?: StatementType;
  generatedBy?: string | null;
}

export class ReportingService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async generateStatement(params: GenerateStatementParams): Promise<string> {
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT reporting.generate_statement($1::uuid, $2::uuid, $3::date, $4::date, $5::varchar, $6::uuid) as id', [
        params.tenantId,
        params.accountId,
        params.startDate,
        params.endDate,
        params.type || 'custom',
        params.generatedBy || null,
      ]);
      return res.rows[0].id;
    } finally {
      client.release();
    }
  }

  async createExportRecord(statementId: string, format: 'pdf'|'csv'|'xlsx'|'json', storageKey?: string, url?: string) {
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT reporting.create_export_record($1::uuid, $2::varchar, $3::text, $4::text) as id', [
        statementId,
        format,
        storageKey || null,
        url || null,
      ]);
      return res.rows[0].id;
    } finally {
      client.release();
    }
  }

  async incrementExportDownload(exportId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT reporting.increment_export_download($1::uuid)', [exportId]);
    } finally {
      client.release();
    }
  }

  // Scheduling helper: create a job record
  async scheduleStatementJob(statementId: string, jobType: 'generate'|'export'|'regenerate', scheduledAt: string, payload?: any) {
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT reporting.create_statement_job($1::uuid, $2::varchar, $3::timestamptz, $4::jsonb) as id', [
        statementId,
        jobType,
        scheduledAt,
        payload ? payload : null,
      ]);
      return res.rows[0].id;
    } finally {
      client.release();
    }
  }
}
