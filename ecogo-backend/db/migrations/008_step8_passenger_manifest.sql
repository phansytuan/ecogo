-- Detailed pickup/dropoff addresses chosen on the map (free-text, beside the
-- corridor label), and the companion manifest for multi-seat bookings.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_address  text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_address text;

CREATE TABLE IF NOT EXISTS booking_passengers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  full_name  text NOT NULL,
  phone      text,
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_passengers_booking ON booking_passengers(booking_id);
