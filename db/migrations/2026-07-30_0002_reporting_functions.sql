-- PL/pgSQL helper functions for reporting
-- These functions avoid hard dependencies on ledger tables at CREATE time by using dynamic SQL.

CREATE OR REPLACE FUNCTION reporting.generate_statement(
  p_tenant_id uuid,
  p_account_id uuid,
  p_start_date date,
  p_end_date date,
  p_type varchar DEFAULT 'custom',
  p_generated_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_statement_id uuid := gen_random_uuid();
  v_seq_start bigint := NULL;
  v_seq_end bigint := NULL;
  v_ledger_candidates text[] := ARRAY[
    'ledger.transactions',
    'public.ledger_transactions',
    'ledger.transaction_entries',
    'public.transactions'
  ];
  v_tbl text;
  v_sql text;
BEGIN
  -- Best-effort: capture a max sequence number from a known ledger table if present.
  FOREACH v_tbl IN ARRAY v_ledger_candidates LOOP
    BEGIN
      v_sql := format('SELECT max(seq) FROM %s', v_tbl);
      EXECUTE v_sql INTO v_seq_end;
      IF v_seq_end IS NOT NULL THEN
        -- We only capture an end sequence; start sequence will be derived by looking up first seq before start_date.
        EXIT;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      -- try next
      CONTINUE;
    END;
  END LOOP;

  -- insert statement metadata; we deliberately do not store balances.
  INSERT INTO reporting.statements (id, tenant_id, account_id, statement_type, start_date, end_date, ledger_seq_start, ledger_seq_end, generated_by, status)
  VALUES (v_statement_id, p_tenant_id, p_account_id, p_type, p_start_date, p_end_date, v_seq_start, v_seq_end, p_generated_by, 'pending');

  RETURN v_statement_id;
END;
$$;


CREATE OR REPLACE FUNCTION reporting.create_statement_job(
  p_statement_id uuid,
  p_job_type varchar,
  p_scheduled_at timestamptz,
  p_payload jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_job_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO reporting.statement_jobs (id, statement_id, job_type, payload, scheduled_at)
  VALUES (v_job_id, p_statement_id, p_job_type, p_payload, p_scheduled_at);
  RETURN v_job_id;
END;
$$;


CREATE OR REPLACE FUNCTION reporting.create_export_record(
  p_statement_id uuid,
  p_format varchar,
  p_storage_key text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_content_type text DEFAULT NULL,
  p_size_bytes bigint DEFAULT NULL,
  p_checksum text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_export_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO reporting.statement_exports (id, statement_id, format, storage_key, url, content_type, size_bytes, checksum)
  VALUES (v_export_id, p_statement_id, p_format, p_storage_key, p_url, p_content_type, p_size_bytes, p_checksum);
  RETURN v_export_id;
END;
$$;


CREATE OR REPLACE FUNCTION reporting.increment_export_download(p_export_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE reporting.statement_exports
  SET downloaded_count = reporting.statement_exports.downloaded_count + 1,
      last_downloaded_at = now()
  WHERE id = p_export_id;
END;
$$;


-- Cache helpers
CREATE OR REPLACE FUNCTION reporting.cache_set(p_key text, p_value jsonb, p_ttl_seconds int DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ttl_seconds IS NULL THEN
    INSERT INTO reporting.reporting_cache (key, value, expire_at)
    VALUES (p_key, p_value, NULL)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expire_at = NULL, created_at = now();
  ELSE
    INSERT INTO reporting.reporting_cache (key, value, expire_at)
    VALUES (p_key, p_value, now() + (p_ttl_seconds || ' seconds')::interval)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expire_at = EXCLUDED.expire_at, created_at = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION reporting.cache_get(p_key text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_value jsonb;
BEGIN
  SELECT value INTO v_value FROM reporting.reporting_cache WHERE key = p_key AND (expire_at IS NULL OR expire_at > now());
  RETURN v_value;
END;
$$;

-- housekeeping: remove expired cache rows
CREATE OR REPLACE FUNCTION reporting.purge_expired_cache()
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM reporting.reporting_cache WHERE expire_at IS NOT NULL AND expire_at <= now()
  RETURNING 1 INTO v_deleted;
  RETURN COALESCE(v_deleted, 0);
END;
$$;
