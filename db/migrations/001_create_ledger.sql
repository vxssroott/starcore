-- db/migrations/001_create_ledger.sql

-- Ledger schema: append-only, immutable double-entry accounting core
-- Key goals:
--  - Immutable append-only transactions & postings
--  - Double-entry accounting (each transaction must balance to zero)
--  - Idempotency via request_id
--  - Transactional outbox for reliable event publishing
--  - Audit trail for regulatory needs
--  - Derived balances via safe SQL views

CREATE SCHEMA IF NOT EXISTS ledger;

-- Accounts: canonical list of accounting ledgers (asset, liability, equity, income, expense, off-ledger)
CREATE TABLE IF NOT EXISTS ledger.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactions: the grouping entity for postings. Immutable once created.
CREATE TABLE IF NOT EXISTS ledger.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT, -- client-provided id for idempotency (optional)
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ledger_transactions_request_id_unique UNIQUE (request_id) -- NULLs allowed but non-null must be unique
);

-- Postings: individual legs of double-entry. Use positive amounts only; sign comes from side (debit/credit).
CREATE TABLE IF NOT EXISTS ledger.postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES ledger.transactions(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES ledger.accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(24,8) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit','credit')),
  reference TEXT, -- external reference id
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure postings currency matches account currency when relevant (simple check by join in trigger/function below optional)

-- Outbox: transactional outbox pattern for reliable asynchronous side-effects
CREATE TABLE IF NOT EXISTS ledger.outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- Audit log: captures actions; can be filled by application or DB triggers
CREATE TABLE IF NOT EXISTS ledger.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT, -- user/service that performed the action
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS ledger_postings_account_idx ON ledger.postings (account_id);
CREATE INDEX IF NOT EXISTS ledger_postings_tx_idx ON ledger.postings (transaction_id);
CREATE INDEX IF NOT EXISTS ledger_postings_account_currency_idx ON ledger.postings (account_id, currency);
CREATE INDEX IF NOT EXISTS ledger_outbox_published_idx ON ledger.outbox (published, created_at);

-- Prevent UPDATE / DELETE on transactions and postings (append-only). We allow INSERT only.
CREATE OR REPLACE FUNCTION ledger.prevent_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger is append-only: modifications to this table are not allowed';
END;
$$;

CREATE TRIGGER prevent_transactions_update
  BEFORE UPDATE OR DELETE ON ledger.transactions
  FOR EACH ROW EXECUTE FUNCTION ledger.prevent_modification();

CREATE TRIGGER prevent_postings_update
  BEFORE UPDATE OR DELETE ON ledger.postings
  FOR EACH ROW EXECUTE FUNCTION ledger.prevent_modification();

-- A helper function to validate that a set of postings for a transaction balances to zero
-- caller must insert into ledger.transactions first, then insert postings; this function can be used in a transaction to check balancing.

CREATE OR REPLACE FUNCTION ledger.assert_transaction_balanced(tx_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  net NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END), 0)
    INTO net
    FROM ledger.postings
    WHERE transaction_id = tx_id;

  IF net <> 0 THEN
    RAISE EXCEPTION 'transaction % is not balanced (net=%)', tx_id, net;
  END IF;
END;
$$;

-- Convenience view: derived balances per account and currency (live view)
CREATE OR REPLACE VIEW ledger.account_balances AS
SELECT
  p.account_id,
  p.currency,
  SUM(CASE WHEN p.entry_type = 'debit' THEN p.amount ELSE -p.amount END) AS balance
FROM ledger.postings p
GROUP BY p.account_id, p.currency;

-- Materialized view if you prefer faster reads and periodic refreshes (create on first run if needed)
-- CREATE MATERIALIZED VIEW ledger.account_balances_mat AS
-- SELECT * FROM ledger.account_balances;

-- Function: create a transaction with postings and outbox event in a single ACID transaction.
-- Ensures idempotency by request_id. If request_id already exists, returns existing transaction id and does nothing.

CREATE OR REPLACE FUNCTION ledger.create_transaction(
  _request_id TEXT,
  _description TEXT,
  _metadata JSONB,
  _postings JSONB, -- array of postings: [{account_code, amount, currency, entry_type, reference, metadata}, ...]
  _outbox JSONB -- optional outbox event: {aggregate_type, aggregate_id, event_type, payload}
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  tx_id UUID;
  rec JSONB;
  acct RECORD;
  posting JSONB;
  acct_id UUID;
BEGIN
  -- Idempotency: if request_id provided and already exists, return existing id
  IF _request_id IS NOT NULL THEN
    SELECT id INTO tx_id FROM ledger.transactions WHERE request_id = _request_id LIMIT 1;
    IF tx_id IS NOT NULL THEN
      RETURN tx_id;
    END IF;
  END IF;

  -- Create transaction row
  INSERT INTO ledger.transactions (request_id, description, metadata)
    VALUES (_request_id, _description, COALESCE(_metadata, '{}'::jsonb))
    RETURNING id INTO tx_id;

  -- Insert postings. We expect _postings to be a JSON array of objects
  FOR rec IN SELECT * FROM jsonb_array_elements(_postings) LOOP
    posting := rec;

    -- Resolve account by code. This keeps ledger.transactions lightweight and avoids exposing raw account ids.
    SELECT id, currency INTO acct_id, acct
      FROM (SELECT id, currency FROM ledger.accounts WHERE code = (posting->> 'account_code') LIMIT 1) AS t(id, currency);

    IF acct_id IS NULL THEN
      RAISE EXCEPTION 'account not found: %', posting->> 'account_code';
    END IF;

    -- Ensure currency consistency if specified
    IF posting ? 'currency' AND posting->> 'currency' <> acct.currency THEN
      RAISE EXCEPTION 'currency mismatch for account %: account_currency=% but posting_currency=%', posting->> 'account_code', acct.currency, posting->> 'currency';
    END IF;

    INSERT INTO ledger.postings (transaction_id, account_id, amount, currency, entry_type, reference, metadata)
      VALUES (tx_id, acct_id, (posting->> 'amount')::numeric, COALESCE(posting->> 'currency', acct.currency), posting->> 'entry_type', posting->> 'reference', COALESCE(posting-> 'metadata', '{}'::jsonb));
  END LOOP;

  -- Assert balanced before leaving transaction
  PERFORM ledger.assert_transaction_balanced(tx_id);

  -- Insert outbox event if provided
  IF COALESCE(_outbox, 'null'::jsonb) IS NOT NULL THEN
    INSERT INTO ledger.outbox (aggregate_type, aggregate_id, event_type, payload)
      VALUES (_outbox->> 'aggregate_type',
              CASE WHEN (_outbox->> 'aggregate_id') IS NULL THEN NULL ELSE (_outbox->> 'aggregate_id')::uuid END,
              _outbox->> 'event_type',
              COALESCE(_outbox-> 'payload', '{}'::jsonb));
  END IF;

  RETURN tx_id;
END;
$$;

-- SECURITY: Revoke default public privileges and grant explicit access to roles as needed
REVOKE ALL ON SCHEMA ledger FROM PUBLIC;
GRANT USAGE ON SCHEMA ledger TO PUBLIC; -- adjust in production

REVOKE ALL ON ALL TABLES IN SCHEMA ledger FROM PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA ledger TO PUBLIC; -- read-only for general users; adjust in production

-- NOTE: In production, create a dedicated DB role for the application with EXECUTE on functions like ledger.create_transaction and limited SELECT on views.

-- End of migration
