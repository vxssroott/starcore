// src/integrations/credentials.ts

import pool from '../db';
import { ProviderCredentials } from './types';

export async function storeCredentials(provider: string, encryptedBlob: string) {
  const res = await pool.query(`INSERT INTO integrations.credentials(provider, encrypted) VALUES($1,$2) RETURNING *`, [provider, encryptedBlob]);
  return res.rows[0] as ProviderCredentials;
}

export async function getCredentials(provider: string) {
  const res = await pool.query(`SELECT * FROM integrations.get_credentials($1)`, [provider]);
  return res.rows[0] as ProviderCredentials | null;
}
