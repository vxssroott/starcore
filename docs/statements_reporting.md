# Statements & Reporting

This directory contains the initial scaffold for the Statements & Reporting platform.

Goals:
- Provide an append-only metadata model for statements and exports.
- Avoid duplicating ledger balances or modifying ledger transactions.
- Provide PL/pgSQL functions and TypeScript services to generate statements and exports.
- Provide a worker skeleton for scheduled jobs.

What's included in this commit:
- db/migrations/2026-07-30_0001_create_reporting_schema_and_tables.sql
- db/migrations/2026-07-30_0002_reporting_functions.sql
- src/services/reportingService.ts
- src/workers/statementWorker.ts
- docs/statements_reporting.md
- tests/integration/reporting.test.ts (placeholder)

Next steps:
- Implement exporters (CSV, PDF, XLSX) that read ledger views and produce artifacts in object storage.
- Implement read-only reporting views that reference the Ledger's canonical tables.
- Add integration tests wired to a test database and object storage emulator.

