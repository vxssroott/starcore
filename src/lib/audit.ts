// src/lib/audit.ts

import pool from '../db';

export async function auditLog(event: string, payload: any) {
  try {
    await pool.query(`INSERT INTO audit.events(event_type, payload) VALUES($1,$2)`, [event, JSON.stringify(payload)]);
  } catch (err) {
    console.error('audit log failed', err);
  }
}
