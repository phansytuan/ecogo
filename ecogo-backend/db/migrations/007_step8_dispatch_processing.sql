-- Dispatch needs a visible "in progress" state between Received and Assigned.
-- A claimed request moves to 'processing' so the queue shows who is working on
-- what, and the auto-matcher (which only touches 'pending') backs off.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending','processing','matched','confirmed','ongoing',
                    'completed','cancelled','no_match'));
