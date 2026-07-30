// src/server/api/transferHandler.ts

import { initiateTransfer, finalizeAndExecute } from '../../services/transferService';
import { json } from '@tanstack/react-start/server-entry';

export async function handleCreateIntent(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { fromAccountId, toAccountId, amount, currency, reserve, provider, metadata, idempotencyKey, correlationId } = body;
  if (!fromAccountId || !toAccountId || !amount) {
    return new Response(JSON.stringify({ error: 'missing parameters' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  try {
    const intent = await initiateTransfer(fromAccountId, toAccountId, Number(amount), currency ?? 'NGN', { reserve: !!reserve, provider, metadata, idempotencyKey, correlationId });
    return new Response(JSON.stringify({ ok: true, intent }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('createIntent error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}

export async function handleExecuteIntent(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { intentId, provider } = body;
  if (!intentId) {
    return new Response(JSON.stringify({ error: 'missing intentId' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  try {
    const res = await finalizeAndExecute(intentId, provider);
    return new Response(JSON.stringify({ ok: true, result: res }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('executeIntent error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
