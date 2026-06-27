-- Step 2: ride-request lifecycle + dispatch claim columns on bookings.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS req_window_start  timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS req_window_end    timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS req_desired_pickup timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
