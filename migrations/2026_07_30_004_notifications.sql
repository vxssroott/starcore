-- migrations/2026_07_30_004_notifications.sql

-- Notifications platform schema and core functions
-- Adds templates, preferences, queue/outbox, history, devices, verifications

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Namespace
CREATE SCHEMA IF NOT EXISTS notifications;

-- Channels enum
CREATE TYPE notifications.notification_channel AS ENUM ('email','sms','push','in_app','whatsapp');

-- Queue status
CREATE TYPE notifications.queue_status AS ENUM ('pending','in_progress','sent','failed','dead_letter','scheduled');

-- Templates table: language + versioning + audit
CREATE TABLE IF NOT EXISTS notifications.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, -- logical template name e.g. "payment.receipt"
  language text NOT NULL DEFAULT 'en',
  version integer NOT NULL DEFAULT 1,
  subject text,
  body text NOT NULL, -- markdown or templating language
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  replaced_by uuid NULL REFERENCES notifications.notification_templates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name, language, version)
);

-- Channel/provider configuration table (admin-managed)
CREATE TABLE IF NOT EXISTS notifications.channel_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel notifications.notification_channel NOT NULL,
  name text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb, -- e.g. smtp connection, sms provider keys
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Push devices table
CREATE TABLE IF NOT EXISTS notifications.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES customers(owner_id) ON DELETE CASCADE,
  device_token text NOT NULL,
  platform text NULL, -- 'ios' | 'android' | 'web'
  metadata jsonb DEFAULT '{}'::jsonb,
  last_seen timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User notification preferences
CREATE TABLE IF NOT EXISTS notifications.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES customers(owner_id) ON DELETE CASCADE,
  template_name text NULL, -- NULL = global default
  channel notifications.notification_channel NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  language text NULL, -- override language
  quiet_hours jsonb DEFAULT NULL, -- e.g. {"start":"22:00","end":"07:00","timezone":"Africa/Lagos"}
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, template_name, channel)
);

-- OTP verifications (email/sms). Store hashed OTP and short TTL.
CREATE TABLE IF NOT EXISTS notifications.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES customers(owner_id) ON DELETE CASCADE,
  email text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications.sms_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES customers(owner_id) ON DELETE CASCADE,
  phone text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Transactional outbox for notification events
CREATE TABLE IF NOT EXISTS notifications.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id text NULL,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Notification queue: worker picks items from here
CREATE TABLE IF NOT EXISTS notifications.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NULL, -- optional idempotency key from caller
  owner_id uuid REFERENCES customers(owner_id) ON DELETE CASCADE,
  aggregate_type text NULL,
  aggregate_id text NULL,
  template_name text NOT NULL,
  template_version integer NULL,
  channel notifications.notification_channel NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  scheduled_at timestamptz NULL,
  priority integer NOT NULL DEFAULT 100,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NULL,
  status notifications.queue_status NOT NULL DEFAULT 'pending',
  last_error text NULL,
  dead_letter_reason text NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only history of delivery attempts
CREATE TABLE IF NOT EXISTS notifications.notification_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES notifications.notification_queue(id) ON DELETE CASCADE,
  channel notifications.notification_channel NOT NULL,
  status text NOT NULL, -- 'attempted' | 'delivered' | 'failed'
  provider_response jsonb DEFAULT '{}'::jsonb,
  attempt_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL
);

-- Indexes for efficient worker reads and partitioning readiness
CREATE INDEX IF NOT EXISTS idx_notifications_queue_owner_status_next ON notifications.notification_queue(owner_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_notifications_queue_schedule_priority ON notifications.notification_queue(scheduled_at, priority);
CREATE INDEX IF NOT EXISTS idx_notifications_history_queue_created ON notifications.notification_history(queue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_outbox_processed_created ON notifications.notification_outbox(processed, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_templates_name_lang_version ON notifications.notification_templates(name, language, version);

-- Unique idempotency index (nullable request_id allowed once per owner + request)
CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_queue_request_id_owner ON notifications.notification_queue(request_id, owner_id) WHERE request_id IS NOT NULL;

-- PL/pgSQL functions: enqueue, fetch_batch, mark_attempt, expire_scheduled

CREATE OR REPLACE FUNCTION notifications.enqueue_notification(
  p_request_id text DEFAULT NULL,
  p_owner_id uuid,
  p_template_name text,
  p_template_version integer DEFAULT NULL,
  p_channel notifications.notification_channel DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_priority integer DEFAULT 100,
  p_aggregate_type text DEFAULT NULL,
  p_aggregate_id text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  q_id uuid;
BEGIN
  -- Idempotency: if request_id provided return existing queue id
  IF p_request_id IS NOT NULL THEN
    SELECT id INTO q_id FROM notifications.notification_queue WHERE request_id = p_request_id AND owner_id = p_owner_id LIMIT 1;
    IF q_id IS NOT NULL THEN
      RETURN q_id;
    END IF;
  END IF;

  INSERT INTO notifications.notification_queue(
    request_id, owner_id, template_name, template_version, channel, payload, scheduled_at, priority, aggregate_type, aggregate_id
  ) VALUES (
    p_request_id, p_owner_id, p_template_name, p_template_version, p_channel, COALESCE(p_payload, '{}'::jsonb), p_scheduled_at, p_priority, p_aggregate_type, p_aggregate_id
  ) RETURNING id INTO q_id;

  -- Insert an outbox event so external systems can be notified of the queued notification
  INSERT INTO notifications.notification_outbox(aggregate_type, aggregate_id, event_type, payload)
  VALUES (COALESCE(p_aggregate_type,'notification'), q_id::text, 'notification.queued', jsonb_build_object('queue_id', q_id::text, 'owner_id', p_owner_id::text, 'template_name', p_template_name)) ;

  RETURN q_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fetch next batch for processing. Worker should use FOR UPDATE SKIP LOCKED outside this function for concurrency.
CREATE OR REPLACE FUNCTION notifications.fetch_next_batch(p_batch_size integer DEFAULT 50)
RETURNS SETOF notifications.notification_queue AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM notifications.notification_queue
  WHERE status IN ('pending','scheduled')
    AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    AND (scheduled_at IS NULL OR scheduled_at <= now())
  ORDER BY priority ASC, created_at ASC
  LIMIT p_batch_size;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark an attempt and record history. On failure compute backoff and potentially dead-letter.
CREATE OR REPLACE FUNCTION notifications.mark_attempt(
  p_queue_id uuid,
  p_channel notifications.notification_channel,
  p_success boolean,
  p_provider_response jsonb DEFAULT '{}'::jsonb,
  p_max_attempts integer DEFAULT 5,
  p_base_backoff_seconds integer DEFAULT 60
) RETURNS void AS $$
DECLARE
  q notifications.notification_queue%ROWTYPE;
  next_backoff integer;
BEGIN
  SELECT * INTO q FROM notifications.notification_queue WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'queue % not found', p_queue_id;
  END IF;

  -- insert history entry
  INSERT INTO notifications.notification_history(queue_id, channel, status, provider_response, attempt_number, created_at, delivered_at)
  VALUES (p_queue_id, p_channel, CASE WHEN p_success THEN 'delivered' ELSE 'failed' END, COALESCE(p_provider_response, '{}'::jsonb), q.attempt_count + 1, now(), CASE WHEN p_success THEN now() ELSE NULL END);

  IF p_success THEN
    UPDATE notifications.notification_queue SET status = 'sent' WHERE id = p_queue_id;
  ELSE
    -- failure: increment attempt and compute exponential backoff
    UPDATE notifications.notification_queue
    SET attempt_count = attempt_count + 1,
        last_error = COALESCE(p_provider_response->>'error', NULL),
        next_attempt_at = now() + ( (power(2, LEAST(attempt_count, 10)) * p_base_backoff_seconds) || ' seconds')::interval,
        status = CASE WHEN attempt_count + 1 >= p_max_attempts THEN 'dead_letter' ELSE 'pending' END,
        dead_letter_reason = CASE WHEN attempt_count + 1 >= p_max_attempts THEN COALESCE(p_provider_response->>'error', 'max attempts reached') ELSE NULL END
    WHERE id = p_queue_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Expire scheduled notifications whose scheduled_at <= now(): mark them as pending
CREATE OR REPLACE FUNCTION notifications.expire_scheduled(p_batch_limit integer DEFAULT 100) RETURNS integer AS $$
DECLARE
  rec notifications.notification_queue%ROWTYPE;
  cnt integer := 0;
BEGIN
  FOR rec IN SELECT * FROM notifications.notification_queue WHERE status = 'scheduled' AND scheduled_at <= now() LIMIT p_batch_limit FOR UPDATE SKIP LOCKED LOOP
    UPDATE notifications.notification_queue SET status = 'pending' WHERE id = rec.id;
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup: move old outbox processed to archive table can be added later by partitioning strategy

-- Security / privileges note: functions are SECURITY DEFINER but should be owned by a dedicated DB role in production.
