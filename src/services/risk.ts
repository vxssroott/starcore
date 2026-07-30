// src/services/risk.ts
import pool from '../db';

export async function evaluatePaymentIntent(paymentIntentId: string) {
  const res = await pool.query(`SELECT * FROM risk.evaluate_payment_intent($1)`, [paymentIntentId]);
  // Postgres enum returns e.g. 'APPROVE' string
  return res.rows[0] ? res.rows[0].evaluate_payment_intent : null;
}

export async function getDecisionForPayment(paymentIntentId: string) {
  const res = await pool.query(`SELECT * FROM risk.decisions WHERE subject_type = 'payment_intent' AND subject_id = $1 ORDER BY created_at DESC LIMIT 1`, [paymentIntentId]);
  return res.rows[0] || null;
}
