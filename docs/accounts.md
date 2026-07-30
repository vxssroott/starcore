# Account and Reservation Service

This introduces a Postgres-first implementation of accounts, ledger, and reservations.

Goals & decisions
- Lightweight customers table. owner_id is the stable identifier for an external Customer Service.
- Each account maps to one ledger_account.
- Reservations support partial capture, release, and expiration.
- Reservations never modify ledger transactions (ledger is single source of truth).
- Balances are derived via views: ledger_balance, reserved_balance, pending_balance, available_balance.
- Keyset pagination for transaction history (ledger.get_account_transactions).

Database migrations
- migrations/2026_07_30_001_accounts_reservations.sql contains:
  - customers, ledger_accounts, ledger_transactions, accounts, reservations tables
  - ledger.create_transaction() (must be used by all financial operations)
  - reservations.* functions: create_reservation, capture_reservation, release_reservation, expire_reservations
  - derived views: ledger_balances, reservation_summaries, account_wallets
  - ledger.get_account_transactions() for keyset pagination

Worker interface for expirations
- Call: SELECT reservations.expire_reservations(<batch_limit>);
- Behaviour: marks eligible reservations as expired and releases their remaining amounts (updates released_amount and status).
- Note: we intentionally do NOT include a scheduler. A background worker should call this function regularly.

TypeScript wrappers
- src/services/accountService.ts
  - createCustomer, createLedgerAccount, createAccount, getWallet
- src/services/ledger.ts
  - createTransaction (wraps ledger.create_transaction)
  - getAccountTransactions (wraps ledger.get_account_transactions for keyset pagination)
- src/services/reservationService.ts
  - createReservation, captureReservation, releaseReservation, expireReservations

Sign conventions
- Captures create a ledger transaction with negative amount. Adjust to your platform conventions if needed.

Testing
- test/integration/reservations.test.ts shows example integration tests using DATABASE_URL.

Notes
- All balances are derived in SQL views. Do NOT persist balance fields in application tables.
- Reservation operations use SELECT ... FOR UPDATE to ensure correctness under concurrency.

