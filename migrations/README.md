// migrations/README.md

Added payments engine migration. Apply it after the previous migrations:

psql $DATABASE_URL -f migrations/2026_07_30_103_payments_engine.sql
