// src/integrations/types.ts

export type ProviderType =
  | 'airtime'
  | 'data'
  | 'electricity'
  | 'cable'
  | 'internet'
  | 'giftcard'
  | 'bank_transfer'
  | 'virtual_account'
  | 'card_issuing'
  | 'card_funding'
  | 'card_withdrawal'
  | 'bank_verification'
  | 'bvn_verification'
  | 'nin_verification'
  | 'exchange_rates'
  | 'notifications';

export interface ProviderCredentials {
  id: string;
  provider: string;
  encrypted: string; // encrypted blob (JSON) stored
  created_at: string;
}

export interface IntegrationRequest<T = any> {
  id: string;
  type: ProviderType | string;
  provider: string; // provider key/name
  payload: T;
  idempotency_key?: string | null;
  correlation_id?: string | null;
}

export interface IntegrationResponse<T = any> {
  requestId: string;
  status: 'ok' | 'error' | 'pending';
  code?: string;
  body?: T;
  error?: any;
}
