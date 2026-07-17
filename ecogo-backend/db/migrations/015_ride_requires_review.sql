-- Overdue rides with active bookings require human review instead of cancellation.
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_status_check;

ALTER TABLE rides
  ADD CONSTRAINT rides_status_check
  CHECK (
    status IN ('open','full','ongoing','completed','cancelled','expired','requires_review')
  );
