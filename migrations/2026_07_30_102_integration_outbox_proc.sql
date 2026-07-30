-- migrations/2026_07_30_102_integration_outbox_proc.sql

-- Dequeue due retries atomically and lock them for processing.
CREATE OR REPLACE FUNCTION integrations.dequeue_due(p_limit integer)
RETURNS TABLE(
  id bigint,
  request_id uuid,
  provider text,
  type text,
  payload jsonb,
  attempt int,
  next_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH to_lock AS (
    SELECT id FROM integrations.retry_queue
    WHERE next_at <= now() AND (locked IS NULL OR locked = false)
    ORDER BY next_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE integrations.retry_queue q
  SET locked = true, locked_at = now()
  FROM to_lock
  WHERE q.id = to_lock.id
  RETURNING q.id, q.request_id, q.provider, q.type, q.payload, q.attempt, q.next_at, q.created_at;
END;
$$;
