// src/services/auth.ts
import pool from '../db';
import bcrypt from 'bcrypt';

export async function createUser(ownerId: string | null, username: string | null, email: string | null, password: string | null, metadata: any = {}) {
  const hash = password ? await bcrypt.hash(password, 12) : null;
  const res = await pool.query(`SELECT * FROM auth.create_user($1,$2,$3,$4,$5)`, [ownerId, username, email, hash, metadata]);
  return res.rows[0];
}

export async function registerDevice(userId: string, fingerprint: string, userAgent: string, ip: string | null = null, metadata: any = {}) {
  const res = await pool.query(`SELECT * FROM auth.register_device($1,$2,$3,$4,$5)`, [userId, fingerprint, userAgent, ip, metadata]);
  return res.rows[0];
}

export async function createSession(userId: string, deviceId: string | null = null, ip: string | null = null, userAgent: string | null = null, expiresAt: string | null = null) {
  const res = await pool.query(`SELECT * FROM auth.create_session($1,$2,$3,$4,$5)`, [userId, deviceId, ip, userAgent, expiresAt]);
  return res.rows[0];
}

export async function revokeSession(sessionId: string) {
  await pool.query(`SELECT auth.revoke_session($1)`, [sessionId]);
}

export async function recordLoginAttempt(userId: string | null, username: string | null, ip: string | null, deviceId: string | null, successful = false, reason: string | null = null) {
  const res = await pool.query(`SELECT * FROM auth.record_login_attempt($1,$2,$3,$4,$5,$6)`, [userId, username, ip, deviceId, successful, reason]);
  return res.rows[0];
}
