// src/integrations/adapters/bankProvider.ts

import { registerProvider } from '../registry';
import { createSkeletonProvider } from '../provider-skeleton';
import { IntegrationRequest, IntegrationResponse } from '../types';
import { auditLog } from '../../lib/audit';

// Bank provider adapter that forwards requests to a configured bank API endpoint.
// Expects credentials blob to contain { baseUrl, apiKey } or an alternative shape.

function createBankProvider() {
  return {
    async withCredentials(creds: any, meta: any) {
      // store creds on instance for later
      (this as any).__creds = creds;
      (this as any).__meta = meta;
    },
    async handle(req: IntegrationRequest): Promise<IntegrationResponse> {
      const creds = (this as any).__creds || {};
      const baseUrl = creds.baseUrl || process.env.BANK_PROVIDER_BASE_URL;
      const apiKey = creds.apiKey || process.env.BANK_PROVIDER_API_KEY;
      if (!baseUrl) {
        throw new Error('bank provider baseUrl not configured');
      }

      // Map our integration request to provider API
      const url = `${baseUrl.replace(/\/$/, '')}/v1/transfer`;
      const body = {
        id: req.id,
        type: req.type,
        payload: req.payload,
      };

      await auditLog('bankProvider.call', { url, requestId: req.id });

      const headers: any = {
        'content-type': 'application/json',
      };
      if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;
      if ((this as any).__meta?.signature) headers['x-signature'] = (this as any).__meta.signature;

      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

      const text = await resp.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      if (!resp.ok) {
        await auditLog('bankProvider.error', { status: resp.status, body: parsed, requestId: req.id });
        return { requestId: req.id, status: 'error', code: String(resp.status), body: parsed };
      }

      await auditLog('bankProvider.success', { status: resp.status, body: parsed, requestId: req.id });

      return { requestId: req.id, status: 'ok', body: parsed } as IntegrationResponse;
    },
    async health() {
      return true;
    }
  };
}

registerProvider({ key: 'bank:default', create: createBankProvider }, ['bank_transfer', 'virtual_account']);
