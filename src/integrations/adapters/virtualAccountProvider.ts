// src/integrations/adapters/virtualAccountProvider.ts

import { registerProvider } from '../registry';
import { IntegrationRequest, IntegrationResponse } from '../types';
import { auditLog } from '../../lib/audit';

function createVirtualAccountProvider() {
  return {
    async withCredentials(creds: any, meta: any) {
      (this as any).__creds = creds;
      (this as any).__meta = meta;
    },
    async handle(req: IntegrationRequest): Promise<IntegrationResponse> {
      const creds = (this as any).__creds || {};
      const baseUrl = creds.baseUrl || process.env.VA_PROVIDER_BASE_URL;
      const apiKey = creds.apiKey || process.env.VA_PROVIDER_API_KEY;
      if (!baseUrl) throw new Error('virtual account provider baseUrl not configured');

      const url = `${baseUrl.replace(/\/$/, '')}/v1/virtual-accounts`;
      const body = { id: req.id, type: req.type, payload: req.payload };

      await auditLog('virtualAccountProvider.call', { url, requestId: req.id });

      const headers: any = { 'content-type': 'application/json' };
      if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;
      if ((this as any).__meta?.signature) headers['x-signature'] = (this as any).__meta.signature;

      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await resp.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      if (!resp.ok) {
        await auditLog('virtualAccountProvider.error', { status: resp.status, body: parsed, requestId: req.id });
        return { requestId: req.id, status: 'error', code: String(resp.status), body: parsed };
      }

      await auditLog('virtualAccountProvider.success', { status: resp.status, body: parsed, requestId: req.id });
      return { requestId: req.id, status: 'ok', body: parsed } as IntegrationResponse;
    },
    async health() { return true; }
  };
}

registerProvider({ key: 'virtual:default', create: createVirtualAccountProvider }, ['virtual_account']);
