-- migrations/2026_07_30_002_payments_engine.sql

-- Payment Engine: payments schema, tables, functions
CREATE SCHEMA IF NOT EXISTS payments;

-- Idempotency keys
CREATE TABLE IF NOT EXISTS payments.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  response jsonb,
  created_at timestamptz DEFAULT now()
);

-- Beneficiaries
CREATE TABLE IF NOT EXISTS payments.beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text,
  account_details jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Payment statuses
CREATE TYPE payments.payment_status AS ENUM ('pending','authorized','reserved','processing','completed','failed','cancelled','expired','reversed');

-- Payment intents
CREATE TABLE IF NOT EXISTS payments.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NULL,
  correlation_id text NULL,
  from_account_id uuid NOT NULL,
  to_account_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  reserve boolean DEFAULT false,
  reservation_id uuid NULL,
  status payments.payment_status NOT NULL DEFAULT 'pending',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Transfers: link to ledger transactions (debit and credit)
CREATE TABLE IF NOT EXISTS payments.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NULL REFERENCES payments.payment_intents(id) ON DELETE SET NULL,
  from_account_id uuid NOT NULL,
  to_account_id uuid NOT NULL,
  amount bigint NOT NULL,
  currency text NOT NULL,
  debit_tx_id uuid NULL REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  credit_tx_id uuid NULL REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  status payments.payment_status NOT NULL DEFAULT 'processing',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Transfer attempts for external rails
CREATE TABLE IF NOT EXISTS payments.transfer_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES payments.transfers(id) ON DELETE CASCADE,
  attempt_payload jsonb,
  attempt_response jsonb,
  status text,
  created_at timestamptz DEFAULT now()
);

-- Receipts
CREATE TABLE IF NOT EXISTS payments.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid REFERENCES payments.transfers(id) ON DELETE SET NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Events (simple audit log)
CREATE TABLE IF NOT EXISTS payments.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text,
  subject_id uuid,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Helper: create payment intent with optional reservation and idempotency handling
CREATE OR REPLACE FUNCTION payments.create_payment_intent(
  p_idempotency_key text,
  p_correlation_id text,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount bigint,
  p_currency text,
  p_reserve boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS payments.payment_intents AS $$
DECLARE
  existing payments.idempotency_keys%ROWTYPE;
  pi payments.payment_intents%ROWTYPE;
  wallet_row record;
  r_row reservations%ROWTYPE;
BEGIN
  -- Idempotency: if key exists, return associated intent if present
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO existing FROM payments.idempotency_keys WHERE key = p_idempotency_key;
    IF FOUND THEN
      -- Try to find a payment_intent with same correlation or metadata (best-effort)
      SELECT * INTO pi FROM payments.payment_intents WHERE id = (existing.response->>'payment_intent_id')::uuid;
      IF FOUND THEN
        RETURN pi;
      END IF;
    END IF;
  END IF;

  -- Validate accounts exist and currency match
  PERFORM 1 FROM accounts a WHERE a.id = p_from_account_id AND a.currency = p_currency FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'from account % not found or currency mismatch', p_from_account_id;
  END IF;
  PERFORM 1 FROM accounts a WHERE a.id = p_to_account_id AND a.currency = p_currency FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'to account % not found or currency mismatch', p_to_account_id;
  END IF;

  -- Fraud checks placeholder (user should extend)
  -- Example: CALL payments.run_fraud_checks(...);

  -- Validate available balance if reservation requested or immediate authorization
  SELECT * INTO wallet_row FROM account_wallets aw WHERE aw.account_id = p_from_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet for account % not found', p_from_account_id;
  END IF;

  IF p_reserve OR p_amount > 0 THEN
    IF wallet_row.available_balance < p_amount THEN
      RAISE EXCEPTION 'insufficient available balance';
    END IF;
  END IF;

  -- Insert payment intent
  INSERT INTO payments.payment_intents (idempotency_key, correlation_id, from_account_id, to_account_id, amount, currency, reserve, status, metadata)
  VALUES (p_idempotency_key, p_correlation_id, p_from_account_id, p_to_account_id, p_amount, p_currency, p_reserve, CASE WHEN p_reserve THEN 'reserved' ELSE 'authorized' END, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING * INTO pi;

  IF p_reserve THEN
    -- Create reservation on the from account
    r_row := reservations.create_reservation(p_from_account_id, p_amount, NULL, jsonb_build_object('payment_intent_id', pi.id));
    UPDATE payments.payment_intents SET reservation_id = r_row.id WHERE id = pi.id;
    pi.reservation_id := r_row.id;
  END IF;

  -- Store idempotency mapping
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO payments.idempotency_keys (key, response) VALUES (p_idempotency_key, jsonb_build_object('payment_intent_id', pi.id)) ON CONFLICT (key) DO NOTHING;
  END IF;

  -- Emit created event
  INSERT INTO payments.events (subject_type, subject_id, event_type, payload) VALUES ('payment_intent', pi.id, 'payment_intent.created', to_jsonb(pi));

  RETURN pi;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute payment intent: for internal transfers, capture reservation (if present) and create ledger entries for counterpart.
CREATE OR REPLACE FUNCTION payments.execute_payment_intent(
  p_payment_intent_id uuid
) RETURNS payments.transfers AS $$
DECLARE
  pi payments.payment_intents%ROWTYPE;
  res reservations%ROWTYPE;
  debit_tx ledger_transactions%ROWTYPE;
  credit_tx ledger_transactions%ROWTYPE;
  tr payments.transfers%ROWTYPE;
  acct_from ledger_accounts%ROWTYPE;
  acct_to ledger_accounts%ROWTYPE;
BEGIN
  SELECT * INTO pi FROM payments.payment_intents WHERE id = p_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment intent % not found', p_payment_intent_id;
  END IF;

  IF pi.status NOT IN ('authorized','reserved','pending') THEN
    RAISE EXCEPTION 'payment intent % in invalid state %', p_payment_intent_id, pi.status;
  END IF;

  -- fetch ledger accounts for from/to
  SELECT la.* INTO acct_from FROM ledger_accounts la JOIN accounts a ON a.ledger_account_id = la.id WHERE a.id = pi.from_account_id;
  SELECT la.* INTO acct_to FROM ledger_accounts la JOIN accounts a ON a.ledger_account_id = la.id WHERE a.id = pi.to_account_id;

  IF pi.reservation_id IS NOT NULL THEN
    -- capture reservation: this will create the debit ledger transaction for the from account
    debit_tx := reservations.capture_reservation(pi.reservation_id, pi.amount, 'capture', jsonb_build_object('payment_intent_id', pi.id));
  ELSE
    -- No reservation: create debit immediately
    debit_tx := ledger.create_transaction(acct_from.id, -pi.amount, pi.currency, 'debit', jsonb_build_object('payment_intent_id', pi.id), 'posted');
  END IF;

  -- Create credit ledger transaction for the recipient
  credit_tx := ledger.create_transaction(acct_to.id, pi.amount, pi.currency, 'credit', jsonb_build_object('payment_intent_id', pi.id), 'posted');

  -- Create transfer record
  INSERT INTO payments.transfers (payment_intent_id, from_account_id, to_account_id, amount, currency, debit_tx_id, credit_tx_id, status, metadata)
  VALUES (pi.id, pi.from_account_id, pi.to_account_id, pi.amount, pi.currency, debit_tx.id, credit_tx.id, 'completed', jsonb_build_object('payment_intent', to_jsonb(pi)))
  RETURNING * INTO tr;

  -- Update payment intent status
  UPDATE payments.payment_intents SET status = 'completed' WHERE id = pi.id;

  -- Create receipt
  INSERT INTO payments.receipts (transfer_id, receipt) VALUES (tr.id, jsonb_build_object('transfer_id', tr.id, 'debit_tx', debit_tx.id, 'credit_tx', credit_tx.id, 'amount', tr.amount, 'currency', tr.currency, 'created_at', now()));

  -- Emit events
  INSERT INTO payments.events (subject_type, subject_id, event_type, payload) VALUES ('transfer', tr.id, 'transfer.completed', to_jsonb(tr));
  INSERT INTO payments.events (subject_type, subject_id, event_type, payload) VALUES ('payment_intent', pi.id, 'payment_intent.completed', to_jsonb(pi));

  RETURN tr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reverse a transfer: create compensating ledger transactions and mark transfer/payment intent reversed
CREATE OR REPLACE FUNCTION payments.reverse_transfer(
  p_transfer_id uuid,
  p_reason text DEFAULT NULL
) RETURNS payments.transfers AS $$
DECLARE
  tr payments.transfers%ROWTYPE;
  debit_tx ledger_transactions%ROWTYPE;
  credit_tx ledger_transactions%ROWTYPE;
  rev_debit ledger_transactions%ROWTYPE;
  rev_credit ledger_transactions%ROWTYPE;
BEGIN
  SELECT * INTO tr FROM payments.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer % not found', p_transfer_id;
  END IF;
  IF tr.status = 'reversed' THEN
    RETURN tr;
  END IF;

  -- fetch ledger tx rows for original
  SELECT * INTO debit_tx FROM ledger_transactions WHERE id = tr.debit_tx_id;
  SELECT * INTO credit_tx FROM ledger_transactions WHERE id = tr.credit_tx_id;

  -- Create reversing transactions: credit the from account and debit the to account (negation)
  rev_debit := ledger.create_transaction(debit_tx.ledger_account_id, -debit_tx.amount, debit_tx.currency, 'reversal_debit', jsonb_build_object('reversed_transfer', tr.id), 'posted');
  rev_credit := ledger.create_transaction(credit_tx.ledger_account_id, -credit_tx.amount, credit_tx.currency, 'reversal_credit', jsonb_build_object('reversed_transfer', tr.id), 'posted');

  UPDATE payments.transfers SET status = 'reversed', metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reversal_reason', p_reason, 'reversal_debit_tx', rev_debit.id, 'reversal_credit_tx', rev_credit.id) WHERE id = tr.id RETURNING * INTO tr;

  -- Update payment_intent if exists
  IF tr.payment_intent_id IS NOT NULL THEN
    UPDATE payments.payment_intents SET status = 'reversed' WHERE id = tr.payment_intent_id;
  END IF;

  INSERT INTO payments.receipts (transfer_id, receipt) VALUES (tr.id, jsonb_build_object('reversal', true, 'reversal_debit_tx', rev_debit.id, 'reversal_credit_tx', rev_credit.id, 'created_at', now()));
  INSERT INTO payments.events (subject_type, subject_id, event_type, payload) VALUES ('transfer', tr.id, 'transfer.reversed', jsonb_build_object('reason', p_reason));

  RETURN tr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Simple retrieval of transfers for keyset pagination by created_at,id
CREATE OR REPLACE FUNCTION payments.get_transfers_for_account(
  p_account_id uuid,
  p_limit integer DEFAULT 50,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL
) RETURNS SETOF payments.transfers AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM payments.transfers t
  WHERE (t.from_account_id = p_account_id OR t.to_account_id = p_account_id)
  AND (
    p_after_created_at IS NULL
    OR (t.created_at < p_after_created_at)
    OR (t.created_at = p_after_created_at AND t.id < p_after_id)
  )
  ORDER BY t.created_at DESC, t.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Placeholder for scheduling/recurring machinery: scheduled_transfers and recurring_transfers tables
CREATE TABLE IF NOT EXISTS payments.scheduled_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_template jsonb NOT NULL,
  run_at timestamptz NOT NULL,
  status text DEFAULT 'scheduled',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments.recurring_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_template jsonb NOT NULL,
  interval text NOT NULL, -- cron or ISO interval
  next_run timestamptz NOT NULL,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- Worker helper for scheduled transfers (to be invoked by external worker)
CREATE OR REPLACE FUNCTION payments.run_scheduled_transfers(batch_limit integer DEFAULT 100) RETURNS integer AS $$
DECLARE
  s RECORD;
  created_count integer := 0;
  pi payments.payment_intents%ROWTYPE;
BEGIN
  FOR s IN SELECT * FROM payments.scheduled_transfers WHERE status = 'scheduled' AND run_at <= now() LIMIT batch_limit FOR UPDATE SKIP LOCKED LOOP
    -- create payment intent from template
    pi := (SELECT * FROM payments.create_payment_intent(
      (s.payment_intent_template->>'idempotency_key'),
      (s.payment_intent_template->>'correlation_id'),
      (s.payment_intent_template->>'from_account_id')::uuid,
      (s.payment_intent_template->>'to_account_id')::uuid,
      (s.payment_intent_template->>'amount')::bigint,
      (s.payment_intent_template->>'currency'),
      (s.payment_intent_template->>'reserve')::boolean,
      s.payment_intent_template->'metadata'
    ));
    UPDATE payments.scheduled_transfers SET status = 'processed' WHERE id = s.id;
    created_count := created_count + 1;
  END LOOP;
  RETURN created_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notes: External rails integration points should create transfer_attempts rows and rely on transfer_attempts.status for retry logic.

