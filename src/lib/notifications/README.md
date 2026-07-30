# Notifications module (TypeScript)

This module provides a light TypeScript wrapper and worker skeleton for the notifications platform.

What is included in this folder:

- types.ts — shared domain types used by the TS layer
- index.ts — NotificationClient with helpers that call PL/pgSQL functions
- worker.ts — a small worker skeleton showing how to poll and dispatch notifications

How it fits together
- Use notifications.enqueue_notification(...) inside transactional code to create a queued notification + outbox event in the same DB transaction.
- A worker polls (SELECT ... FOR UPDATE SKIP LOCKED) and sends via adapters, calling notifications.mark_attempt after each delivery attempt.

