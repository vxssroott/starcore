// src/services/ledger.ts
import pool from '../db';

export interface LedgerTransaction {
  id: string;
  ledger_account_id: string;
  amount: number;
  currency: string;
  type: string;
  status: string;
  metadata: any;
  created_at: string;
}

export async function createTransaction(ledgerAccountId: string, amount: number, currency: string, type: string, metadata: any = {}, status: string = 'posted'): Promise<LedgerTransaction> {
  const res = await pool.query(`SELECT * FROM ledger.create_transaction($1,$2,$3,$4,$5,$6)`, [ledgerAccountId, amount, currency, type, metadata, status]);
  return res.rows[0];
}

export async function getAccountTransactions(accountId: string, limit = 50, afterCreatedAt: string | null = null, afterId: string | null = null) {
  const res = await pool.query(`SELECT * FROM ledger.get_account_transactions($1,$2,$3,$4)`, [accountId, limit, afterCreatedAt, afterId]);
  return res.rows as LedgerTransaction[];
}
