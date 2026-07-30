# Payments Engine

This module provides a Postgres-first Payment Engine that orchestrates payments while using the Ledger as the single source of truth.

Key features
- Payment intents with idempotency
- Reservations-aware flow (uses reservations.create_reservation and reservations.capture_reservation)
- Internal transfers that create double-entry ledger transactions (debit + credit)
- Transfer records, receipts, events, and transfer attempts for external rails
- Reversals via compensating ledger transactions
- Scheduling/recurring placeholders and worker helpers

Design notes
- The service NEVER writes balances directly. All movements use ledger.create_transaction().
- When a payment intent is created with reserve=true, a DB reservation is created on the from account and the intent status becomes 'reserved'. Execution will capture the reservation (creating the debit transaction) and then create the credit transaction for the recipient.
- Idempotency: payments.idempotency_keys stores mapping of key -> created payment intent id. Create uses the idempotency key to return the same payment_intent if present.
- Events are stored in payments.events for domain publication. A separate process should read this table and publish to message bus if needed.

Worker responsibilities
- Scheduled transfers: call SELECT payments.run_scheduled_transfers(batch_limit)
- Recurring transfers: a worker should evaluate recurring_transfers.next_run and create payment intents accordingly
- Retries for transfer_attempts: external rails integration should insert transfer_attempts rows and a worker should perform retries with backoff

APIs (TypeScript wrappers)
- createPaymentIntent(idempotencyKey, correlationId, fromAccountId, toAccountId, amount, currency, reserve=false, metadata)
- executePaymentIntent(paymentIntentId)
- reverseTransfer(transferId, reason)

