// src/services/reservationService.ts
import pool from '../db';
import { createTransaction } from './ledger';

export async function createReservation(accountId: string, amount: number, expiresAt: string | null = null, metadata: any = {}) {
  const res = await pool.query(`SELECT * FROM reservations.create_reservation($1,$2,$3,$4)`, [accountId, amount, expiresAt, metadata]);
  return res.rows[0];
}

export async function captureReservation(reservationId: string, amount: number, type: string = 'capture', metadata: any = {}) {
  // We call the DB function that already creates the ledger transaction.
  const res = await pool.query(`SELECT * FROM reservations.capture_reservation($1,$2,$3,$4)`, [reservationId, amount, type, metadata]);
  return res.rows[0];
}

export async function releaseReservation(reservationId: string, amount: number | null = null) {
  const res = await pool.query(`SELECT * FROM reservations.release_reservation($1,$2)`, [reservationId, amount]);
  return res.rows[0];
}

export async function expireReservations(batchLimit = 100) {
  const res = await pool.query(`SELECT reservations.expire_reservations($1) AS processed`, [batchLimit]);
  return res.rows[0].processed as number;
}
