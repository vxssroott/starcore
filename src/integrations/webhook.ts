// src/integrations/webhook.ts

import { IntegrationRequest } from './types';
import { providerManager } from './manager';
import { enqueueRetry } from './retry';
import { auditLog } from '../lib/audit';

export async function processWebhook(req: IntegrationRequest) {
  // try to find provider by key
  try {
    auditLog('webhook.received', { id: req.id, provider: req.provider, type: req.type });
    const res = await providerManager.handle(req);
    auditLog('webhook.processed', { id: req.id, provider: req.provider, type: req.type, status: res.status });
    return res;
  } catch (err) {
    auditLog('webhook.error', { id: req.id, provider: req.provider, error: String(err) });
    // enqueue retry
    await enqueueRetry(req);
    throw err;
  }
}
