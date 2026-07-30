// src/services/transferService.ts

import { createPaymentIntent, executePaymentIntent } from './payments';
import { auditLog } from '../lib/audit';
import { sendToProvider } from './providerService';
import { IntegrationRequest } from '../integrations/types';
import { v4 as uuidv4 } from 'uuid';

export async function initiateTransfer(fromAccountId: string, toAccountId: string, amount: number, currency = 'NGN', options: { reserve?: boolean; provider?: string; metadata?: any; idempotencyKey?: string | null; correlationId?: string | null } = {}) {
  // create payment intent via payments SQL functions
  const intent = await createPaymentIntent(options.idempotencyKey ?? null, options.correlationId ?? null, fromAccountId, toAccountId, amount, currency, !!options.reserve, options.metadata ?? {});
  await auditLog('transfer.intent_created', { intentId: intent.id, from: fromAccountId, to: toAccountId, amount });

  // if a provider is specified (e.g., bank:default) then submit to provider after execution
  return intent;
}

export async function finalizeAndExecute(intentId: string, providerKey?: string) {
  // execute intent using payments.execute_payment_intent
  const transfer = await executePaymentIntent(intentId);
  await auditLog('transfer.executed', { transferId: transfer.id, paymentIntentsId: transfer.payment_intent_id });

  // If provider integration required (e.g., external bank transfer), create integration request
  if (providerKey) {
    const req: IntegrationRequest = {
      id: uuidv4(),
      type: 'bank_transfer',
      provider: providerKey,
      payload: {
        transferId: transfer.id,
        from: transfer.from_account_id,
        to: transfer.to_account_id,
        amount: transfer.amount,
        currency: transfer.currency,
        metadata: transfer.metadata,
      }
    };

    // send to provider (this will use circuit breaker, rate limiter, signing, and audit)
    const res = await sendToProvider(req);
    await auditLog('transfer.provider_submission', { transferId: transfer.id, provider: providerKey, providerStatus: res.status });
    return { transfer, providerResponse: res };
  }

  return { transfer };
}
