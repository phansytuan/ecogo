-- Addressable seats. Each ride gets one row per sellable seat position; a seat
-- is either free, locked by the driver (for an offline/direct passenger), or
-- held by an online booking. Locked seats are never offered for online booking.
CREATE TABLE IF NOT EXISTS ride_seats (
  ride_id     uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  seat_id     text NOT NULL,                       -- e.g. 'R2-1'
  row_num     int  NOT NULL,
  col_num     int  NOT NULL,
  status      text NOT NULL DEFAULT 'free'
              CHECK (status IN ('free','locked','booked')),
  booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  note        text,                                -- driver's note for a locked seat
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ride_id, seat_id)
);
CREATE INDEX IF NOT EXISTS idx_ride_seats_booking ON ride_seats(booking_id);

-- A booking can name the specific seat(s) it holds.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seat_ids text[];
