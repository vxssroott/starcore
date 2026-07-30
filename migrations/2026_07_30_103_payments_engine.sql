-- migrations/2026_07_30_103_payments_engine.sql

-- Payments engine: payment_intents, transfers and helper functions

CREATE SCHEMA IF NOT EXISTS payments;

CREATE TABLE IF NOT EXISTS payments.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NULL,
  correlation_id text NULL,
  from_account_id uuid NOT NULL,
  to_account_id uuid NOT NULL,
  amount bigint NOT NULL,
  currency text NOT NULL,
  reserve boolean NOT NULL DEFAULT false,
  reservation_id uuid NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | processing | success | failed | reversed
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_payment_intents_idempotency_idx ON payments.payment_intents(idempotency_key);

CREATE TABLE IF NOT EXISTS payments.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NULL REFERENCES payments.payment_intents(id) ON DELETE SET NULL,
  from_account_id uuid NOT NULL,
  to_account_id uuid NOT NULL,
  amount bigint NOT NULL,
  currency text NOT NULL,
  debit_tx_id uuid NULL, -- references ledger_transactions.id
  credit_tx_id uuid NULL,
  status text NOT NULL DEFAULT 'processing', -- processing | success | failed | reversed
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_transfers_from_account_idx ON payments.transfers(from_account_id);
CREATE INDEX IF NOT EXISTS payments_transfers_to_account_idx ON payments.transfers(to_account_id);

-- create_payment_intent: idempotent by idempotency_key when provided
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
  existing payments.payment_intents%ROWTYPE;
  new_row payments.payment_intents%ROWTYPE;
  reservation_row uuid;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO existing FROM payments.payment_intents WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
      RETURN existing;
    END IF;
  END IF;

  IF p_reserve THEN
    -- create reservation against from_account
    PERFORM 1 FROM accounts WHERE id = p_from_account_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'from account not found';
    END IF;
    reservation_row := (SELECT id FROM reservations.create_reservation(p_from_account_id, p_amount, NULL, p_metadata));
  END IF;

  INSERT INTO payments.payment_intents (idempotency_key, correlation_id, from_account_id, to_account_id, amount, currency, reserve, reservation_id, metadata)
  VALUES (p_idempotency_key, p_correlation_id, p_from_account_id, p_to_account_id, p_amount, p_currency, p_reserve, reservation_row, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- execute_payment_intent: processes a payment_intent into a transfer and ledger transactions.
CREATE OR REPLACE FUNCTION payments.execute_payment_intent(p_payment_intent_id uuid) RETURNS payments.transfers AS $$
DECLARE
  intent payments.payment_intents%ROWTYPE;
  tr payments.transfers%ROWTYPE;
  debit_tx ledger_transactions%ROWTYPE;
  credit_tx ledger_transactions%ROWTYPE;
  acct_currency text;
BEGIN
  SELECT * INTO intent FROM payments.payment_intents WHERE id = p_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_intent % not found', p_payment_intent_id;
  END IF;

  IF intent.status NOT IN ('pending','processing') THEN
    RAISE EXCEPTION 'payment_intent % cannot be executed from status %', p_payment_intent_id, intent.status;
  END IF;

  UPDATE payments.payment_intents SET status = 'processing' WHERE id = intent.id;

  -- determine currency from accounts if necessary
  SELECT currency INTO acct_currency FROM accounts WHERE id = intent.from_account_id;
  IF acct_currency IS NULL THEN
    RAISE EXCEPTION 'from account % not found', intent.from_account_id;
  END IF;

  IF intent.reserve AND intent.reservation_id IS NOT NULL THEN
    -- capture reservation which will create a ledger transaction (debit) via reservations.capture_reservation
    debit_tx := reservations.capture_reservation(intent.reservation_id, intent.amount, 'capture_payment_intent', intent.metadata);
    -- create credit transaction to recipient account
    credit_tx := ledger.create_transaction((SELECT ledger_account_id FROM accounts WHERE id = intent.to_account_id), intent.amount, acct_currency, 'credit_payment_intent', intent.metadata, 'posted');
  ELSE
    -- create debit and credit transactions directly
    debit_tx := ledger.create_transaction((SELECT ledger_account_id FROM accounts WHERE id = intent.from_account_id), -intent.amount, acct_currency, 'debit_payment_intent', intent.metadata, 'posted');
    credit_tx := ledger.create_transaction((SELECT ledger_account_id FROM accounts WHERE id = intent.to_account_id), intent.amount, acct_currency, 'credit_payment_intent', intent.metadata, 'posted');
  END IF;

  INSERT INTO payments.transfers (payment_intent_id, from_account_id, to_account_id, amount, currency, debit_tx_id, credit_tx_id, status, metadata)
  VALUES (intent.id, intent.from_account_id, intent.to_account_id, intent.amount, acct_currency, debit_tx.id, credit_tx.id, 'success', intent.metadata)
  RETURNING * INTO tr;

  UPDATE payments.payment_intents SET status = 'success' WHERE id = intent.id;

  RETURN tr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- reverse_transfer: creates offsetting ledger transactions and marks transfer as reversed
CREATE OR REPLACE FUNCTION payments.reverse_transfer(p_transfer_id uuid, p_reason text DEFAULT NULL) RETURNS payments.transfers AS $$
DECLARE
  tr payments.transfers%ROWTYPE;
  rev_debit ledger_transactions%ROWTYPE;
  rev_credit ledger_transactions%ROWTYPE;
BEGIN
  SELECT * INTO tr FROM payments.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer % not found', p_transfer_id;
  END IF;

  IF tr.status = 'reversed' THEN
    RETURN tr; -- idempotent
  END IF;

  -- create reversing transactions: credit the from_account (positive), debit the to_account (negative)
  rev_debit := ledger.create_transaction((SELECT ledger_account_id FROM accounts WHERE id = tr.to_account_id), -tr.amount, tr.currency, 'reversal_debit', jsonb_build_object('reversal_of', tr.id, 'reason', COALESCE(p_reason, '')));
  rev_credit := ledger.create_transaction((SELECT ledger_account_id FROM accounts WHERE id = tr.from_account_id), tr.amount, tr.currency, 'reversal_credit', jsonb_build_object('reversal_of', tr.id, 'reason', COALESCE(p_reason, '')));

  UPDATE payments.transfers SET status = 'reversed', metadata = jsonb_set(COALESCE(metadata,'{}'::jsonb), '{reversal_reason}', to_jsonb(COALESCE(p_reason,''))) WHERE id = tr.id RETURNING * INTO tr;

  RETURN tr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_transfers_for_account: keyset pagination
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
