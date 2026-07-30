// src/services/accountService.ts
import pool from '../db';

export async function createCustomer(ownerId: string, name: string = '', metadata: any = {}) {
  const res = await pool.query(`INSERT INTO customers (owner_id, name, metadata) VALUES ($1,$2,$3) ON CONFLICT (owner_id) DO UPDATE SET name = EXCLUDED.name RETURNING *`, [ownerId, name, metadata]);
  return res.rows[0];
}

export async function createLedgerAccount(ownerId: string, currency: string, name: string = '', metadata: any = {}) {
  const res = await pool.query(`INSERT INTO ledger_accounts (owner_id, currency, name, metadata) VALUES ($1,$2,$3,$4) RETURNING *`, [ownerId, currency, name, metadata]);
  return res.rows[0];
}

export async function createAccount(ownerId: string, ledgerAccountId: string, currency: string, metadata: any = {}) {
  const res = await pool.query(`INSERT INTO accounts (owner_id, ledger_account_id, currency, metadata) VALUES ($1,$2,$3,$4) RETURNING *`, [ownerId, ledgerAccountId, currency, metadata]);
  return res.rows[0];
}

export async function getWallet(accountId: string) {
  const res = await pool.query(`SELECT * FROM account_wallets WHERE account_id = $1`, [accountId]);
  return res.rows[0];
}
