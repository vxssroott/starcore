# Ledger module (TypeScript)

This module provides a minimal, reference implementation of the ledger transactional API for Node.js.
It expects a PostgreSQL database with the migration from db/migrations/001_create_ledger.sql applied.

Design goals implemented here:
- Idempotent, ACID createTransaction API
- Transactional outbox insertion
- Append-only ledger enforced by DB triggers
- Simple helper for derived balances

Notes:
- This file uses `pg`. Add it to package.json when integrating: `npm install pg` or `bun add pg`.
- Keep business logic in SQL functions where appropriate (ledger.create_transaction) to ensure correctness even if multiple services call into DB directly.

