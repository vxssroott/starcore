-- migrations/2026_07_30_001_accounts_reservations.sql

-- Lightweight customer table. owner_id is the stable identifier for the Customer Service.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS customers (
  owner_id uuid PRIMARY KEY,
  name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Ledger accounts: every application account maps to exactly one ledger_account.
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES customers(owner_id) ON DELETE SET NULL,
  name text,
  currency text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Ledger transactions are the single source of truth for balances.
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE CASCADE,
  amount bigint NOT NULL, -- smallest currency unit (e.g., cents). Positive/negative depends on platform convention.
  currency text NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'posted', -- 'posted' | 'pending' | 'reversed'
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Accounts: single-currency account that maps to a ledger_account.
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES customers(owner_id) ON DELETE CASCADE,
  ledger_account_id uuid NOT NULL UNIQUE REFERENCES ledger_accounts(id) ON DELETE CASCADE,
  currency text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Reservations: supports partial captures, releases, expiration. Reservations never modify ledger_transactions/balance.
CREATE TYPE reservation_status AS ENUM ('active','released','expired','fully_captured');

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  ledger_account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE CASCADE,

  -- Values are stored in the smallest currency unit (e.g. cents)
  reserved_amount bigint NOT NULL CHECK (reserved_amount >= 0), -- original reserved amount
  captured_amount bigint NOT NULL DEFAULT 0 CHECK (captured_amount >= 0),
  released_amount bigint NOT NULL DEFAULT 0 CHECK (released_amount >= 0),

  status reservation_status NOT NULL DEFAULT 'active',
  expires_at timestamptz NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),

  CHECK (captured_amount + released_amount <= reserved_amount)
);

-- Derived views: ledger balance (sum of posted transactions), pending balance, reserved balances, wallet view per account.

CREATE OR REPLACE VIEW ledger_balances AS
SELECT
  ledger_account_id,
  COALESCE(SUM(CASE WHEN status = 'posted' THEN amount ELSE 0 END),0) AS ledger_balance,
  COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END),0) AS pending_balance
FROM ledger_transactions
GROUP BY ledger_account_id;

CREATE OR REPLACE VIEW reservation_summaries AS
SELECT
  account_id,
  COALESCE(SUM(reserved_amount - captured_amount - released_amount),0) AS reserved_balance
FROM reservations
WHERE status = 'active'
GROUP BY account_id;

CREATE OR REPLACE VIEW account_wallets AS
SELECT
  a.id AS account_id,
  la.id AS ledger_account_id,
  la.currency,
  COALESCE(lb.ledger_balance,0) AS ledger_balance,
  COALESCE(rs.reserved_balance,0) AS reserved_balance,
  COALESCE(lb.pending_balance,0) AS pending_balance,
  (COALESCE(lb.ledger_balance,0) - COALESCE(rs.reserved_balance,0)) AS available_balance
FROM accounts a
JOIN ledger_accounts la ON a.ledger_account_id = la.id
LEFT JOIN ledger_balances lb ON la.id = lb.ledger_account_id
LEFT JOIN reservation_summaries rs ON a.id = rs.account_id;

-- Helper function: create a ledger transaction. All financial operations MUST call this.
CREATE OR REPLACE FUNCTION ledger.create_transaction(
  p_ledger_account_id uuid,
  p_amount bigint,
  p_currency text,
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_status text DEFAULT 'posted'
) RETURNS ledger_transactions AS $$
DECLARE
  tx ledger_transactions%ROWTYPE;
BEGIN
  INSERT INTO ledger_transactions (ledger_account_id, amount, currency, type, metadata, status)
  VALUES (p_ledger_account_id, p_amount, p_currency, p_type, COALESCE(p_metadata, '{}'::jsonb), p_status)
  RETURNING * INTO tx;
  RETURN tx;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reservation functions
CREATE OR REPLACE FUNCTION reservations.create_reservation(
  p_account_id uuid,
  p_amount bigint,
  p_expires_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS reservations AS $$
DECLARE
  r reservations%ROWTYPE;
  l_account_id uuid;
  acct_currency text;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'reserved amount must be > 0';
  END IF;

  SELECT ledger_account_id, currency INTO l_account_id, acct_currency FROM accounts WHERE id = p_account_id FOR SHARE;
  IF l_account_id IS NULL THEN
    RAISE EXCEPTION 'account % not found', p_account_id;
  END IF;

  INSERT INTO reservations (account_id, ledger_account_id, reserved_amount, captured_amount, released_amount, status, expires_at, metadata)
  VALUES (p_account_id, l_account_id, p_amount, 0, 0, 'active', p_expires_at, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING * INTO r;

  RETURN r;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reservations._get_remaining(p_reservation_id uuid) RETURNS bigint AS $$
DECLARE
  res_row reservations%ROWTYPE;
BEGIN
  SELECT * INTO res_row FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation % not found', p_reservation_id;
  END IF;
  RETURN res_row.reserved_amount - res_row.captured_amount - res_row.released_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Capture a reservation (supports partial capture). This writes to ledger via ledger.create_transaction().
CREATE OR REPLACE FUNCTION reservations.capture_reservation(
  p_reservation_id uuid,
  p_amount bigint,
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS ledger_transactions AS $$
DECLARE
  res_row reservations%ROWTYPE;
  remaining bigint;
  tx ledger_transactions%ROWTYPE;
  acct_currency text;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'capture amount must be > 0';
  END IF;

  SELECT * INTO res_row FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation % not found', p_reservation_id;
  END IF;

  IF res_row.status <> 'active' THEN
    RAISE EXCEPTION 'reservation % not active', p_reservation_id;
  END IF;

  remaining := res_row.reserved_amount - res_row.captured_amount - res_row.released_amount;
  IF p_amount > remaining THEN
    RAISE EXCEPTION 'capture amount % exceeds remaining reserved amount %', p_amount, remaining;
  END IF;

  -- Fetch currency from ledger account via accounts join
  SELECT a.currency INTO acct_currency FROM accounts a WHERE a.id = res_row.account_id;

  -- Create ledger transaction. The convention here: captures create a posted ledger transaction reducing available ledger balance.
  -- Amount sign conventions are application-specific. We'll store captured amounts as negative values to represent debits.
  tx := ledger.create_transaction(res_row.ledger_account_id, -p_amount, acct_currency, p_type, p_metadata, 'posted');

  UPDATE reservations
  SET captured_amount = captured_amount + p_amount,
      status = CASE WHEN captured_amount + p_amount >= reserved_amount THEN 'fully_captured' ELSE status END
  WHERE id = p_reservation_id;

  RETURN tx;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Release a reservation (partial or full). This does NOT touch ledger transactions.
CREATE OR REPLACE FUNCTION reservations.release_reservation(
  p_reservation_id uuid,
  p_amount bigint DEFAULT NULL
) RETURNS reservations AS $$
DECLARE
  res_row reservations%ROWTYPE;
  remaining bigint;
  release_amount bigint;
BEGIN
  SELECT * INTO res_row FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation % not found', p_reservation_id;
  END IF;
  IF res_row.status <> 'active' THEN
    RAISE EXCEPTION 'reservation % not active', p_reservation_id;
  END IF;

  remaining := res_row.reserved_amount - res_row.captured_amount - res_row.released_amount;
  IF remaining <= 0 THEN
    -- Nothing to release, mark fully captured if appropriate
    UPDATE reservations SET status = 'fully_captured' WHERE id = p_reservation_id RETURNING * INTO res_row;
    RETURN res_row;
  END IF;

  IF p_amount IS NULL THEN
    release_amount := remaining;
  ELSE
    IF p_amount <= 0 THEN
      RAISE EXCEPTION 'release amount must be > 0';
    END IF;
    IF p_amount > remaining THEN
      RAISE EXCEPTION 'release amount % exceeds remaining %', p_amount, remaining;
    END IF;
    release_amount := p_amount;
  END IF;

  UPDATE reservations
  SET released_amount = released_amount + release_amount,
      status = CASE WHEN (reserved_amount - captured_amount - (released_amount + release_amount)) <= 0 THEN 'released' ELSE status END
  WHERE id = p_reservation_id
  RETURNING * INTO res_row;

  -- If fully released (no remaining), mark released
  IF res_row.reserved_amount - res_row.captured_amount - res_row.released_amount <= 0 THEN
    UPDATE reservations SET status = 'released' WHERE id = p_reservation_id RETURNING * INTO res_row;
  END IF;

  RETURN res_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Expire reservations whose expires_at has passed. This is intended to be called by a worker.
CREATE OR REPLACE FUNCTION reservations.expire_reservations(batch_limit integer DEFAULT 100) RETURNS integer AS $$
DECLARE
  r reservations%ROWTYPE;
  count_processed integer := 0;
BEGIN
  FOR r IN SELECT * FROM reservations WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now() LIMIT batch_limit FOR UPDATE SKIP LOCKED LOOP
    UPDATE reservations
    SET released_amount = released_amount + (r.reserved_amount - r.captured_amount - r.released_amount),
        status = 'expired'
    WHERE id = r.id;
    count_processed := count_processed + 1;
  END LOOP;
  RETURN count_processed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keyset pagination for account transactions. Order by created_at DESC, id DESC.
CREATE OR REPLACE FUNCTION ledger.get_account_transactions(
  p_account_id uuid,
  p_limit integer DEFAULT 50,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL
) RETURNS SETOF ledger_transactions AS $$
DECLARE
  la_id uuid;
  query_text text;
BEGIN
  SELECT ledger_account_id INTO la_id FROM accounts WHERE id = p_account_id;
  IF la_id IS NULL THEN
    RAISE EXCEPTION 'account % not found', p_account_id;
  END IF;

  RETURN QUERY
  SELECT * FROM ledger_transactions lt
  WHERE lt.ledger_account_id = la_id
  AND (
    p_after_created_at IS NULL
    OR (lt.created_at < p_after_created_at)
    OR (lt.created_at = p_after_created_at AND lt.id < p_after_id)
  )
  ORDER BY lt.created_at DESC, lt.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
