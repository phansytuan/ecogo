-- Repair duplicate active bookings created before passenger-scoped locking.
-- Keep the oldest obligation and cancel later copies deterministically.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY passenger_id, ride_id ORDER BY created_at, id
         ) AS ordinal
  FROM bookings
  WHERE ride_id IS NOT NULL AND status IN ('matched','confirmed','ongoing')
)
UPDATE bookings b SET status = 'cancelled'
FROM ranked d
WHERE b.id = d.id AND d.ordinal > 1;

-- Return any specifically selected seats owned by repaired duplicates.
UPDATE ride_seats s
SET status = 'free', booking_id = NULL, updated_at = now()
FROM bookings b
WHERE s.booking_id = b.id AND b.status = 'cancelled';

-- Restore the cached availability/status for rides with addressable seats.
UPDATE rides r
SET available_seats = x.free,
    status = CASE
      WHEN r.status = 'full' AND x.free > 0 THEN 'open'
      WHEN r.status = 'open' AND x.free = 0 THEN 'full'
      ELSE r.status
    END
FROM (
  SELECT ride_id, count(*) FILTER (WHERE status = 'free')::int AS free
  FROM ride_seats GROUP BY ride_id
) x
WHERE r.id = x.ride_id AND r.status IN ('open','full');

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_passenger_ride
  ON bookings(passenger_id, ride_id)
  WHERE ride_id IS NOT NULL AND status IN ('matched','confirmed','ongoing');
