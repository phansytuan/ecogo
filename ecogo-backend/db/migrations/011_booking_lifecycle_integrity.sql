-- A booking represents one passenger obligation and may be settled only once.
-- Application-level passenger advisory locks protect cross-ride scheduling.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_booking ON transactions(booking_id);
DROP INDEX IF EXISTS idx_transactions_booking;
