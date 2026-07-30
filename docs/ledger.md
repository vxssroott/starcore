# Ledger design and integration notes

This document summarizes the design decisions and integration guidance for the ledger core.

Principles:
- The PostgreSQL database is the single source of truth. Business rules that guarantee double-entry accounting are enforced in the DB (functions, constraints, triggers) whenever possible.
- Keep the domain model stable: transactions, postings, accounts, outbox, and audit_logs are the primitives. Services calling the DB should not rely on side effects or in-process logic for core invariants.

Key features implemented:
- Immutable append-only ledger: updates and deletes are rejected at the DB level.
- Double-entry enforcement: ledger.assert_transaction_balanced checks that postings for a transaction net to zero.
- Idempotency: transactions.request_id unique constraint + create_transaction function short-circuits if request_id already exists.
- Transactional outbox: ledger.outbox table is written in the same DB transaction as the postings so that event dispatchers can reliably read and publish.
- Derived balances: ledger.account_balances view derives balances from postings; consider a materialized view for scale.
- Audit logs: ledger.audit_logs exists; application or DB triggers should write actor/action metadata per operation.

Operational notes & next steps:
- Create a DB role for the application and grant only the required rights (EXECUTE on create_transaction, INSERT on accounts when creating accounts, SELECT on balances, etc.). Avoid granting wide rights to PUBLIC.
- Add a publisher process (separate service / cron / background job) that polls ledger.outbox for published = false, attempts to publish, marks published = true on success, increments attempt_count and logs errors on failure.
- Consider partitioning ledger.postings by time for very large systems.
- For regulatory auditing, export ledger.transactions and ledger.postings snapshots regularly and keep write-once backups.

Example usage (pseudo):

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ledger = new LedgerClient(pool);

const txId = await ledger.createTransaction({
  requestId: 'client-uuid-123',
  description: 'Initial funding',
  postings: [
    { account_code: 'bank:liability:customer:123', amount: '1000.00', entry_type: 'credit' },
    { account_code: 'bank:asset:cash', amount: '1000.00', entry_type: 'debit' }
  ],
  outbox: { aggregate_type: 'transaction', aggregate_id: null, event_type: 'ledger.transaction.created', payload: { tx: '...' } }
});

