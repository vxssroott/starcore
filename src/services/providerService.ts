// src/services/providerService.ts

import { IntegrationRequest, IntegrationResponse } from '../integrations/types';
import { providerManager } from '../integrations/manager';
import { getCredentials } from '../integrations/credentials';
import { isOpen, recordFailure, recordSuccess } from '../integrations/circuit';
import { allow } from '../integrations/rateLimiter';
import { signRequest } from '../integrations/requestSigning';
import { auditLog } from '../lib/audit';

const SECRET = process.env.SECRET_SIGNING_KEY || '';

export async function sendToProvider(req: IntegrationRequest): Promise<IntegrationResponse> {
  const key = `${req.provider}`;

  if (isOpen(key)) {
    await auditLog('provider.circuit_open', { provider: req.provider, requestId: req.id });
    throw new Error('provider circuit is open');
  }

  if (!allow(key, 10, 1000)) {
    await auditLog('provider.rate_limited', { provider: req.provider, requestId: req.id });
    throw new Error('rate limited');
  }

  // fetch credentials (may be encrypted blob)
  const creds = await getCredentials(req.provider);
  let credentialObj: any = null;
  if (creds && creds.encrypted) {
    try {
      credentialObj = JSON.parse(creds.encrypted);
    } catch (err) {
      // try base64 decode
      try {
        const decoded = Buffer.from(creds.encrypted, 'base64').toString('utf-8');
        credentialObj = JSON.parse(decoded);
      } catch (err2) {
        credentialObj = { raw: creds.encrypted };
      }
    }
  }

  // attach signing header if secret present
  const signature = SECRET ? signRequest(SECRET, { id: req.id, type: req.type, payload: req.payload }) : undefined;

  await auditLog('provider.request', { provider: req.provider, requestId: req.id, type: req.type });

  try {
    // delegate to provider adapter
    const provider = providerManager.getProvider(req.provider);
    if (!provider) throw new Error('provider not found');

    // if provider supports prepare/withCredentials pattern
    if (typeof provider.withCredentials === 'function') {
      provider.withCredentials(credentialObj, { signature });
    }

    const res = await provider.handle(req);

    await auditLog('provider.response', { provider: req.provider, requestId: req.id, status: res.status });

    recordSuccess(key);
    return res;
  } catch (err: any) {
    recordFailure(key);
    await auditLog('provider.error', { provider: req.provider, requestId: req.id, error: String(err) });
    throw err;
  }
}
