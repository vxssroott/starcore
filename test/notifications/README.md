# Notifications tests plan

This folder will contain integration tests for notifications. Tests will verify:

- enqueue is idempotent when requestId provided
- scheduled notifications become pending when scheduled_at passes
- worker picks notifications and mark_attempt updates history and queue status
- OTP creation and verification flow (hashed storage, expiration)
- quiet hours preference suppression

Test harness will reuse existing test DB migrations and run the new migration before tests.
