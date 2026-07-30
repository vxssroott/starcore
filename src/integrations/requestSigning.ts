// src/integrations/requestSigning.ts

import crypto from 'crypto';

export function signRequest(secret: string, payload: any) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(typeof payload === 'string' ? payload : JSON.stringify(payload));
  return hmac.digest('hex');
}
