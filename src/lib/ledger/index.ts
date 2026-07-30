// src/lib/ledger/index.ts
// Minimal TypeScript wrapper around the ledger.create_transaction PL/pgSQL function

import { Pool, PoolClient } from 'pg';

export type Posting = {
  account_code: string;
  amount: string; // decimal as string to avoid JS float issues
  currency?: string;
  entry_type: 'debit' | 'credit';
  reference?: string;
  metadata?: Record<string, unknown>;
};

export type OutboxEvent = {
  aggregate_type: string;
  aggregate_id?: string;
  event_type: string;
  payload: Record<string, unknown>;
};

export type CreateTransactionArgs = {
  requestId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  postings: Posting[];
  outbox?: OutboxEvent | null;
};

export class LedgerClient {
  pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // createTransaction: idempotent and ACID. Returns transaction id (UUID).
  async createTransaction(args: CreateTransactionArgs): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `SELECT ledger.create_transaction($1::text, $2::text, $3::jsonb, $4::jsonb, $5::jsonb) as tx_id`,
        [
          args.requestId ?? null,
          args.description ?? null,
          args.metadata ? JSON.stringify(args.metadata) : null,
          JSON.stringify(args.postings),
          args.outbox ? JSON.stringify(args.outbox) : null,
        ]
      );

      const txId = res.rows[0]?.tx_id as string;

      await client.query('COMMIT');
      return txId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // helper to get balances for an account
  async getBalances(accountCode: string) {
    const res = await this.pool.query(
      `SELECT b.account_id, a.code, b.currency, b.balance FROM ledger.account_balances b JOIN ledger.accounts a ON a.id = b.account_id WHERE a.code = $1`,
      [accountCode]
    );
    return res.rows;
  }
}
