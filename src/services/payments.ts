// src/services/payments.ts
import pool from '../db';

export interface PaymentIntent {
  id: string;
  idempotency_key: string | null;
  correlation_id: string | null;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  currency: string;
  reserve: boolean;
  reservation_id: string | null;
  status: string;
  metadata: any;
  created_at: string;
}

export interface Transfer {
  id: string;
  payment_intent_id: string | null;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  currency: string;
  debit_tx_id: string | null;
  credit_tx_id: string | null;
  status: string;
  metadata: any;
  created_at: string;
}

export async function createPaymentIntent(idempotencyKey: string | null, correlationId: string | null, fromAccountId: string, toAccountId: string, amount: number, currency: string, reserve = false, metadata: any = {}) : Promise<PaymentIntent> {
  const res = await pool.query(`SELECT * FROM payments.create_payment_intent($1,$2,$3,$4,$5,$6,$7,$8)`, [idempotencyKey, correlationId, fromAccountId, toAccountId, amount, currency, reserve, metadata]);
  return res.rows[0] as PaymentIntent;
}

export async function executePaymentIntent(paymentIntentId: string): Promise<Transfer> {
  const res = await pool.query(`SELECT * FROM payments.execute_payment_intent($1)`, [paymentIntentId]);
  return res.rows[0] as Transfer;
}

export async function reverseTransfer(transferId: string, reason: string | null = null): Promise<Transfer> {
  const res = await pool.query(`SELECT * FROM payments.reverse_transfer($1,$2)`, [transferId, reason]);
  return res.rows[0] as Transfer;
}

export async function getTransfersForAccount(accountId: string, limit = 50, afterCreatedAt: string | null = null, afterId: string | null = null) {
  const res = await pool.query(`SELECT * FROM payments.get_transfers_for_account($1,$2,$3,$4)`, [accountId, limit, afterCreatedAt, afterId]);
  return res.rows as Transfer[];
}
