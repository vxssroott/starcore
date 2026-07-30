// src/scripts/encrypt_existing_credentials.ts

import pool from '../db';
import { encryptBlob } from '../integrations/crypto';

async function main() {
  if (!process.env.SECRET_SIGNING_KEY) {
    console.error('SECRET_SIGNING_KEY must be set to run this script');
    process.exit(1);
  }

  console.log('Scanning integrations.credentials for plaintext entries...');
  const res = await pool.query(`SELECT id, provider, encrypted FROM integrations.credentials FOR UPDATE`);
  for (const row of res.rows) {
    const val: string = row.encrypted;
    if (!val || val.startsWith('enc:v1:')) {
      console.log(`Skipping id=${row.id} provider=${row.provider} (already encrypted)`);
      continue;
    }
    console.log(`Encrypting id=${row.id} provider=${row.provider}`);
    const encrypted = encryptBlob(val);
    await pool.query(`UPDATE integrations.credentials SET encrypted = $1 WHERE id = $2`, [encrypted, row.id]);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
