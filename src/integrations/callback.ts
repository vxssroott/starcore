// src/integrations/callback.ts

import { IntegrationRequest } from './types';
import { providerManager } from './manager';
import { auditLog } from '../lib/audit';

export async function handleCallback(req: IntegrationRequest) {
  auditLog('callback.received', { id: req.id, provider: req.provider, type: req.type });
  const res = await providerManager.handle(req);
  auditLog('callback.processed', { id: req.id, provider: req.provider, type: req.type, status: res.status });
  return res;
}
