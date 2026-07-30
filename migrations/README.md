// migrations/README.md

This directory contains SQL migrations for the integrations and retry/outbox system.

Apply with psql or your preferred migration runner. Example:

psql $DATABASE_URL -f migrations/2026_07_30_101_integrations_schema.sql
psql $DATABASE_URL -f migrations/2026_07_30_102_integration_outbox_proc.sql

Notes:
- migrations are additive and safe to run multiple times (use IF NOT EXISTS where possible).
