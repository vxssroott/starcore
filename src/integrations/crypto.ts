// src/integrations/crypto.ts

import crypto from 'crypto';

const SECRET = process.env.SECRET_SIGNING_KEY || '';
if (!SECRET) {
  // do not throw on import; functions will error at use if missing
}

function deriveKey(secret: string) {
  // use SHA-256 of secret as 32-byte key
  return crypto.createHash('sha256').update(secret).digest();
}

// Format: enc:v1:<base64(iv || authTag || ciphertext)>
export function encryptBlob(obj: any): string {
  if (!SECRET) throw new Error('SECRET_SIGNING_KEY not set');
  const key = deriveKey(SECRET);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = typeof obj === 'string' ? obj : JSON.stringify(obj);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // store as iv|auth|cipher
  const payload = Buffer.concat([iv, authTag, ciphertext]);
  return 'enc:v1:' + payload.toString('base64');
}

export function decryptBlob(encrypted: string): any {
  if (!SECRET) throw new Error('SECRET_SIGNING_KEY not set');
  if (!encrypted || typeof encrypted !== 'string') return null;
  if (!encrypted.startsWith('enc:v1:')) {
    // not in our encrypted format
    try {
      // maybe it's plain JSON
      return JSON.parse(encrypted);
    } catch {
      // return raw string
      return encrypted;
    }
  }
  const b = Buffer.from(encrypted.slice('enc:v1:'.length), 'base64');
  const iv = b.slice(0, 12);
  const authTag = b.slice(12, 28);
  const ciphertext = b.slice(28);
  const key = deriveKey(SECRET);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  try {
    return JSON.parse(plain);
  } catch {
    return plain;
  }
}
