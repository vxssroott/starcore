-- 2026-07-30 0001_create_reporting_schema_and_tables.sql
-- Reporting / Statements initial schema
-- Non-destructive: does not reference ledger tables at DDL time.

BEGIN;

CREATE SCHEMA IF NOT EXISTS reporting;

-- statements: metadata about generated statements. Do NOT store derived balances here.
CREATE TABLE IF NOT EXISTS reporting.statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  account_id uuid NOT NULL,
  statement_type varchar(32) NOT NULL CHECK (statement_type IN ('monthly','quarterly','annual','custom')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  ledger_seq_start bigint NULL,
  ledger_seq_end bigint NULL,
  generated_by uuid NULL,
  status varchar(32) NOT NULL DEFAULT 'pending', -- pending | running | completed | failed
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reporting_period_ok CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS reporting_statements_account_period_idx ON reporting.statements (tenant_id, account_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS reporting_statements_status_idx ON reporting.statements (status) WHERE status IS NOT NULL;

-- statement_jobs: scheduled or ad-hoc jobs to produce statements/exports
CREATE TABLE IF NOT EXISTS reporting.statement_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES reporting.statements(id) ON DELETE CASCADE,
  job_type varchar(32) NOT NULL CHECK (job_type IN ('generate','export','regenerate')),
  payload jsonb NULL,
  scheduled_at timestamptz NOT NULL,
  run_at timestamptz NULL,
  status varchar(32) NOT NULL DEFAULT 'scheduled', -- scheduled | running | completed | failed
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reporting_statement_jobs_schedule_idx ON reporting.statement_jobs (scheduled_at) WHERE status = 'scheduled';

-- statement_exports: produced export artifacts referencing statements
CREATE TABLE IF NOT EXISTS reporting.statement_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES reporting.statements(id) ON DELETE CASCADE,
  format varchar(16) NOT NULL CHECK (format IN ('pdf','csv','xlsx','json')),
  storage_key text NULL, -- pointer to object store (S3/MinIO)
  url text NULL,
  content_type text NULL,
  size_bytes bigint NULL,
  checksum text NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  downloaded_count int NOT NULL DEFAULT 0,
  last_downloaded_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS reporting_statement_exports_statement_idx ON reporting.statement_exports (statement_id, format);

-- report_templates: user-defined or system-defined reporting templates
CREATE TABLE IF NOT EXISTS reporting.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  owner_id uuid NULL,
  template jsonb NOT NULL, -- template definition (fields, filters, grouping)
  schedule jsonb NULL, -- optional schedule definition (cron-like or window)
  description text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reporting_report_templates_tenant_idx ON reporting.report_templates (tenant_id, name);

-- report_history: append-only record of generated reports
CREATE TABLE IF NOT EXISTS reporting.report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NULL REFERENCES reporting.report_templates(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL,
  report_name text NOT NULL,
  params jsonb NULL,
  period_start date NULL,
  period_end date NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  status varchar(32) NOT NULL DEFAULT 'completed',
  result jsonb NULL -- contains pointers to exports, counts, summary
);

CREATE INDEX IF NOT EXISTS reporting_report_history_template_idx ON reporting.report_history (template_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS reporting_report_history_tenant_idx ON reporting.report_history (tenant_id, generated_at DESC);

-- transaction_categories: category definitions for transaction tagging
CREATE TABLE IF NOT EXISTS reporting.transaction_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  rules jsonb NULL, -- rules used to auto-categorize (merchant patterns, MCCs, regexes)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS reporting_transaction_categories_tenant_idx ON reporting.transaction_categories (tenant_id);

-- spending_categories: mapping of transactions to higher-level spending categories
CREATE TABLE IF NOT EXISTS reporting.spending_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES reporting.transaction_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reporting_spending_categories_tenant_idx ON reporting.spending_categories (tenant_id);

-- reporting_cache: simple key/value cache to improve reporting performance
CREATE TABLE IF NOT EXISTS reporting.reporting_cache (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  expire_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reporting_reporting_cache_expire_idx ON reporting.reporting_cache (expire_at) WHERE expire_at IS NOT NULL;

-- lightweight helper function to keep updated_at in statements
CREATE OR REPLACE FUNCTION reporting.touch_statements_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reporting_statements_updated_at
BEFORE UPDATE ON reporting.statements
FOR EACH ROW
EXECUTE FUNCTION reporting.touch_statements_updated_at();

COMMIT;
