// src/integrations/credentials.ts

import pool from '../db';
import { ProviderCredentials } from './types';
import { encryptBlob, decryptBlob } from './crypto';

// Store credentials: accepts either a plain object or an already-encrypted string.
export async function storeCredentials(provider: string, creds: any) {
  let stored: string;
  if (typeof creds === 'string') {
    // assume already encrypted or raw string; try to detect
    if (creds.startsWith('enc:v1:')) {
      stored = creds;
    } else {
      // attempt to JSON.parse; if ok, encrypt; else encrypt raw string
      try {
        JSON.parse(creds);
        stored = encryptBlob(JSON.parse(creds));
      } catch {
        stored = encryptBlob(creds);
      }
    }
  } else {
    stored = encryptBlob(creds);
  }

  const res = await pool.query(`INSERT INTO integrations.credentials(provider, encrypted) VALUES($1,$2) RETURNING *`, [provider, stored]);
  return res.rows[0] as ProviderCredentials;
}

// Get the latest credentials for a provider and decrypt them. Returns null if none.
export async function getDecryptedCredentials(provider: string) {
  const res = await pool.query(`SELECT * FROM integrations.get_credentials($1)`, [provider]);
  const row = res.rows[0];
  if (!row) return null;
  try {
    const decrypted = decryptBlob(row.encrypted);
    return { ...row, decrypted } as any;
  } catch (err) {
    console.error('failed to decrypt credentials for', provider, err);
    return { ...row, decrypted: null } as any;
  }
}

// Raw getter (returns raw encrypted string as stored)
export async function getRawCredentials(provider: string) {
  const res = await pool.query(`SELECT * FROM integrations.get_credentials($1)`, [provider]);
  return res.rows[0] as ProviderCredentials | null;
}
