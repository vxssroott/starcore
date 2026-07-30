-- migrations/2026_07_30_101_integrations_schema.sql

-- Add pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS integrations;

CREATE TABLE IF NOT EXISTS integrations.credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  encrypted text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations.retry_queue (
  id BIGSERIAL PRIMARY KEY,
  request_id uuid NOT NULL,
  provider text NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  attempt int NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  locked boolean DEFAULT false,
  locked_at timestamptz NULL,
  created_at timestamptz DEFAULT now()
);

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.events (
  id BIGSERIAL PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- helper: read last credential for provider
CREATE OR REPLACE FUNCTION integrations.get_credentials(p_provider text)
RETURNS TABLE(id uuid, provider text, encrypted text, created_at timestamptz)
LANGUAGE sql AS $$
  SELECT id, provider, encrypted, created_at FROM integrations.credentials WHERE provider = p_provider ORDER BY created_at DESC LIMIT 1;
$$;
