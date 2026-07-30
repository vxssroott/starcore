# Notifications architecture

This document briefly describes the flow and architecture for the notifications platform.

Event-driven flow (simplified):

1) Domain event occurs (e.g., payment.created) inside a transaction.
2) Service calls notifications.enqueue_notification(...) which:
   - inserts a row into notifications.notification_queue
   - inserts a row into notifications.notification_outbox (same transaction)
3) A worker polls notification_queue (FOR UPDATE SKIP LOCKED) and picks work
4) Worker renders templates (language/version) respecting user preferences and quiet hours
5) Worker invokes adapter (SMTP, SMS provider, Push) and calls notifications.mark_attempt(...)
6) mark_attempt writes an append-only history row and updates queue status (sent / pending / dead_letter)

OTP flow:
- OTP is persisted hashed in email_verifications / sms_verifications with TTL
- Verification attempts are recorded and limited; verification writes an audit row and marks verified flag on success

Delivery guarantees and retries:
- Enqueue + outbox are transactional to avoid lost events
- Worker uses attempt_count + exponential backoff; items are moved to dead_letter after max attempts

Security notes:
- PL/pgSQL functions are SECURITY DEFINER but in production must be owned by a dedicated DB role with least privilege
- OTPs are stored hashed; do not log plain OTPs

