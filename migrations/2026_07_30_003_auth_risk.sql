-- migrations/2026_07_30_003_auth_risk.sql

-- Authentication and Risk domain
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS risk;

-- Users tied to customers.owner_id when available
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NULL REFERENCES customers(owner_id) ON DELETE SET NULL,
  username text UNIQUE,
  email text UNIQUE,
  password_hash text NULL,
  mfa_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Devices and fingerprints
CREATE TABLE IF NOT EXISTS auth.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  user_agent text,
  ip_address inet NULL,
  trust_score integer DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
  trusted boolean DEFAULT false,
  last_seen timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Sessions and refresh tokens
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid NULL REFERENCES auth.devices(id) ON DELETE SET NULL,
  revoked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid NULL REFERENCES auth.devices(id) ON DELETE SET NULL,
  refresh_token_id uuid NULL REFERENCES auth.refresh_tokens(id) ON DELETE SET NULL,
  ip_address inet NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  revoked boolean DEFAULT false
);

-- Login attempts, brute-force protection and velocity tracking
CREATE TABLE IF NOT EXISTS auth.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  username text NULL,
  ip_address inet NULL,
  device_id uuid NULL REFERENCES auth.devices(id) ON DELETE SET NULL,
  successful boolean NOT NULL DEFAULT false,
  reason text NULL,
  created_at timestamptz DEFAULT now()
);

-- Account locks
CREATE TABLE IF NOT EXISTS auth.account_locks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locked_until timestamptz NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- IP reputation abstraction
CREATE TABLE IF NOT EXISTS auth.ip_reputation (
  ip inet PRIMARY KEY,
  score integer DEFAULT 0,
  source text,
  updated_at timestamptz DEFAULT now()
);

-- Risk rules and evaluations
CREATE TYPE risk.decision AS ENUM ('APPROVE','REVIEW','DECLINE');

CREATE TABLE IF NOT EXISTS risk.rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  priority integer DEFAULT 100,
  -- JSON definition for rule parameters; engines can interpret this
  definition jsonb NOT NULL,
  action risk.decision NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk.rule_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES risk.rules(id) ON DELETE SET NULL,
  subject_type text,
  subject_id uuid,
  matched boolean,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk.scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text,
  subject_id uuid,
  score integer,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text,
  subject_id uuid,
  decision risk.decision,
  reason text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Helper functions for auth
CREATE OR REPLACE FUNCTION auth.create_user(p_owner_id uuid DEFAULT NULL, p_username text DEFAULT NULL, p_email text DEFAULT NULL, p_password_hash text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS auth.users AS $$
DECLARE
  u auth.users%ROWTYPE;
BEGIN
  INSERT INTO auth.users (owner_id, username, email, password_hash, metadata) VALUES (p_owner_id, p_username, p_email, p_password_hash, COALESCE(p_metadata,'{}'::jsonb)) RETURNING * INTO u;
  RETURN u;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.register_device(p_user_id uuid, p_fingerprint text, p_user_agent text, p_ip inet DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS auth.devices AS $$
DECLARE
  d auth.devices%ROWTYPE;
BEGIN
  INSERT INTO auth.devices (user_id, fingerprint, user_agent, ip_address, metadata) VALUES (p_user_id, p_fingerprint, p_user_agent, p_ip, COALESCE(p_metadata,'{}'::jsonb)) RETURNING * INTO d;
  INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'device', d.id, TRUE, jsonb_build_object('action','device_registered'));
  RETURN d;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.create_session(p_user_id uuid, p_device_id uuid DEFAULT NULL, p_ip inet DEFAULT NULL, p_user_agent text DEFAULT NULL, p_expires_at timestamptz DEFAULT NULL)
RETURNS auth.sessions AS $$
DECLARE
  s auth.sessions%ROWTYPE;
  rt auth.refresh_tokens%ROWTYPE;
BEGIN
  INSERT INTO auth.refresh_tokens (token, user_id, device_id, expires_at) VALUES (gen_random_uuid()::text, p_user_id, p_device_id, p_expires_at) RETURNING * INTO rt;
  INSERT INTO auth.sessions (user_id, device_id, refresh_token_id, ip_address, user_agent, expires_at) VALUES (p_user_id, p_device_id, rt.id, p_ip, p_user_agent, p_expires_at) RETURNING * INTO s;
  RETURN s;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.revoke_session(p_session_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE auth.sessions SET revoked = true WHERE id = p_session_id;
  UPDATE auth.refresh_tokens SET revoked = true WHERE id = (SELECT refresh_token_id FROM auth.sessions WHERE id = p_session_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.record_login_attempt(p_user_id uuid DEFAULT NULL, p_username text DEFAULT NULL, p_ip inet DEFAULT NULL, p_device_id uuid DEFAULT NULL, p_successful boolean DEFAULT false, p_reason text DEFAULT NULL)
RETURNS auth.login_attempts AS $$
DECLARE
  la auth.login_attempts%ROWTYPE;
BEGIN
  INSERT INTO auth.login_attempts (user_id, username, ip_address, device_id, successful, reason) VALUES (p_user_id, p_username, p_ip, p_device_id, p_successful, p_reason) RETURNING * INTO la;
  RETURN la;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Simple velocity check helper: count recent attempts
CREATE OR REPLACE FUNCTION auth.count_recent_login_attempts(p_user_id uuid DEFAULT NULL, p_ip inet DEFAULT NULL, p_window_interval text DEFAULT '5 minutes')
RETURNS integer AS $$
DECLARE
  cnt integer := 0;
BEGIN
  SELECT COUNT(*) INTO cnt FROM auth.login_attempts WHERE created_at >= now() - (p_window_interval::interval) AND (
    (p_user_id IS NOT NULL AND user_id = p_user_id) OR (p_ip IS NOT NULL AND ip_address = p_ip)
  );
  RETURN cnt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Risk evaluation function: evaluate a payment_intent and produce APPROVE/REVIEW/DECLINE
CREATE OR REPLACE FUNCTION risk.evaluate_payment_intent(p_payment_intent_id uuid)
RETURNS risk.decision AS $$
DECLARE
  pi payments.payment_intents%ROWTYPE;
  score integer := 0;
  dev_id uuid;
  ip inet;
  device_row auth.devices%ROWTYPE;
  ip_rep_row auth.ip_reputation%ROWTYPE;
  amount bigint;
  decision risk.decision;
  rule_rec RECORD;
BEGIN
  SELECT * INTO pi FROM payments.payment_intents WHERE id = p_payment_intent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_intent % not found', p_payment_intent_id;
  END IF;

  amount := pi.amount;

  -- Extract metadata-supplied device and ip if present
  IF pi.metadata ? 'device_id' THEN
    dev_id := (pi.metadata->>'device_id')::uuid;
  END IF;
  IF pi.metadata ? 'ip_address' THEN
    ip := (pi.metadata->>'ip_address')::inet;
  END IF;

  -- Amount-based scoring
  IF amount >= 100000 THEN -- >= 1000.00
    score := score + 60;
    INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'payment_intent', pi.id, TRUE, jsonb_build_object('rule','amount_high','amount',amount));
  ELSIF amount >= 50000 THEN
    score := score + 30;
    INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'payment_intent', pi.id, TRUE, jsonb_build_object('rule','amount_medium','amount',amount));
  ELSIF amount >= 10000 THEN
    score := score + 10;
    INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'payment_intent', pi.id, TRUE, jsonb_build_object('rule','amount_low','amount',amount));
  ELSE
    INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'payment_intent', pi.id, FALSE, jsonb_build_object('rule','amount_ok','amount',amount));
  END IF;

  -- Device trust
  IF dev_id IS NOT NULL THEN
    SELECT * INTO device_row FROM auth.devices WHERE id = dev_id;
    IF FOUND THEN
      score := score + (100 - device_row.trust_score) / 2; -- higher deduction if low trust
      INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'device', dev_id, TRUE, jsonb_build_object('trust_score', device_row.trust_score));
    ELSE
      score := score + 20; -- unknown device
      INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'device', dev_id, FALSE, jsonb_build_object('message','device_not_found'));
    END IF;
  ELSE
    score := score + 20; -- no device info
    INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'device', NULL, FALSE, jsonb_build_object('message','no_device_info'));
  END IF;

  -- IP reputation
  IF ip IS NOT NULL THEN
    SELECT * INTO ip_rep_row FROM auth.ip_reputation WHERE ip = ip;
    IF FOUND THEN
      -- Assume ip_rep_row.score ranges -100..100 where negative is bad
      IF ip_rep_row.score < -50 THEN
        score := score + 40;
        INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'ip', NULL, TRUE, jsonb_build_object('ip', ip, 'ip_score', ip_rep_row.score));
      ELSIF ip_rep_row.score < 0 THEN
        score := score + 10;
        INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'ip', NULL, TRUE, jsonb_build_object('ip', ip, 'ip_score', ip_rep_row.score));
      ELSE
        INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'ip', NULL, FALSE, jsonb_build_object('ip', ip, 'ip_score', ip_rep_row.score));
      END IF;
    ELSE
      -- unknown IP, small penalty
      score := score + 5;
      INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'ip', NULL, FALSE, jsonb_build_object('message','ip_unknown','ip', ip));
    END IF;
  ELSE
    score := score + 5; -- no IP provided
    INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'ip', NULL, FALSE, jsonb_build_object('message','no_ip'));
  END IF;

  -- Velocity: count recent transfers for from_account
  DECLARE
    recent_count integer;
  BEGIN
    SELECT COUNT(*) INTO recent_count FROM payments.transfers WHERE from_account_id = pi.from_account_id AND created_at > now() - interval '1 hour';
    IF recent_count >= 5 THEN
      score := score + 30;
      INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'velocity', pi.id, TRUE, jsonb_build_object('recent_count', recent_count));
    ELSIF recent_count >= 3 THEN
      score := score + 10;
      INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'velocity', pi.id, TRUE, jsonb_build_object('recent_count', recent_count));
    ELSE
      INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'velocity', pi.id, FALSE, jsonb_build_object('recent_count', recent_count));
    END IF;
  END;

  -- Beneficiary history: if to_account has never received funds from this from_account, small penalty
  DECLARE
    hist_count integer;
  BEGIN
    SELECT COUNT(*) INTO hist_count FROM payments.transfers WHERE from_account_id = pi.from_account_id AND to_account_id = pi.to_account_id;
    IF hist_count = 0 THEN
      score := score + 10;
      INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'beneficiary', pi.id, TRUE, jsonb_build_object('history', hist_count));
    ELSE
      INSERT INTO risk.rule_evaluations (rule_id, subject_type, subject_id, matched, details) VALUES (NULL, 'beneficiary', pi.id, FALSE, jsonb_build_object('history', hist_count));
    END IF;
  END;

  -- Normalize score to 0..100
  IF score < 0 THEN score := 0; END IF;
  IF score > 100 THEN score := 100; END IF;

  INSERT INTO risk.scores (subject_type, subject_id, score, reason) VALUES ('payment_intent', pi.id, score, 'composite') RETURNING * INTO rule_rec;

  -- Map to decision thresholds
  IF score >= 80 THEN
    decision := 'DECLINE';
  ELSIF score >= 50 THEN
    decision := 'REVIEW';
  ELSE
    decision := 'APPROVE';
  END IF;

  INSERT INTO risk.decisions (subject_type, subject_id, decision, reason, details) VALUES ('payment_intent', pi.id, decision, 'thresholds', jsonb_build_object('score', score));

  RETURN decision;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace payments.execute_payment_intent to enforce risk evaluation before ledger writes
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
  decision risk.decision;
BEGIN
  SELECT * INTO pi FROM payments.payment_intents WHERE id = p_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment intent % not found', p_payment_intent_id;
  END IF;

  IF pi.status NOT IN ('authorized','reserved','pending') THEN
    RAISE EXCEPTION 'payment intent % in invalid state %', p_payment_intent_id, pi.status;
  END IF;

  -- Evaluate risk
  decision := risk.evaluate_payment_intent(pi.id);
  IF decision = 'DECLINE' THEN
    UPDATE payments.payment_intents SET status = 'failed' WHERE id = pi.id;
    INSERT INTO payments.events (subject_type, subject_id, event_type, payload) VALUES ('payment_intent', pi.id, 'payment_intent.declined', jsonb_build_object('decision','DECLINE'));
    RAISE EXCEPTION 'payment intent % declined by risk engine', pi.id;
  ELSNIF decision = 'REVIEW' THEN
    -- Mark for manual review and do not proceed with ledger writes
    UPDATE payments.payment_intents SET status = 'pending' WHERE id = pi.id;
    INSERT INTO payments.events (subject_type, subject_id, event_type, payload) VALUES ('payment_intent', pi.id, 'payment_intent.review', jsonb_build_object('decision','REVIEW'));
    -- Return without executing
    RETURN NULL;
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

