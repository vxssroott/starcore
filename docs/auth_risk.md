# Authentication, Security & Risk

This module introduces the Authentication and Risk domains to the platform.

Identity
- auth.users: user accounts optionally tied to customers.owner_id
- auth.devices: device registration, fingerprinting, trust scoring
- auth.sessions, auth.refresh_tokens: session & refresh token support
- auth.login_attempts: login attempts tracking for brute-force and velocity
- auth.account_locks: account locking
- auth.ip_reputation: IP reputation store

Risk Engine
- risk.rules: rule storage (JSON-based definitions)
- risk.rule_evaluations: per-invocation rule matches
- risk.scores: numeric score storage
- risk.decisions: decision store (APPROVE/REVIEW/DECLINE)
- risk.evaluate_payment_intent(payment_intent_id): evaluates a payment intent against simple built-in heuristics (amount thresholds, device trust, ip reputation, velocity, beneficiary history) and returns a decision

Integration with Payments
- payments.execute_payment_intent now calls risk.evaluate_payment_intent and will only proceed with ledger writes if the decision is APPROVE.
- If the decision is REVIEW, the payment_intent is marked pending and no ledger writes happen; if DECLINE, the intent is failed.

Worker responsibilities
- Enrich ip_reputation table from external services
- Run scheduled risk rule changes and manage active/inactive rules
- Implement an event publisher to stream risk.decisions and risk.rule_evaluations to downstream systems

Notes & Operational concerns
- Risk functions are SECURITY DEFINER: review ownership and GRANT EXECUTE only to the application DB role.
- The risk engine intentionally only evaluates and records decisions; it never modifies balances.
- Rules are stored as JSON definitions for future pluggable engines.

