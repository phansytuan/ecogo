-- Write-ahead outbox and in-app history: sent means one push succeeded, skipped
-- means no device tokens, and failed means every delivery failed and is retried.
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_retry ON notifications(created_at) WHERE status IN ('pending','failed');
