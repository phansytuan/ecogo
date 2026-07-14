-- Detour-based matching + passenger-route fare snapshots.
--
-- Bookings snapshot everything the fare/eligibility decision was based on, so
-- historical bookings are immune to future pricing or detour-rule changes:
--   * route_distance_m  — passenger's own road distance (pickup -> dropoff),
--                         the fare basis (NOT the driver's detour).
--   * fare_per_seat / fare_rate_per_km — pricing inputs at booking time.
--   * original_route_m / matched_route_m / detour_m / detour_pct — driver-side
--     matching metrics at assignment time.
--   * pickup_insert_idx / dropoff_insert_idx — chosen insertion positions in
--     the driver's remaining stop sequence.
--   * extra_duration_s  — estimated additional drive time for the driver.
-- Place references keep the geocoding provenance of each endpoint.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_place_id    text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_place_id   text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS route_distance_m   integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS fare_per_seat      numeric(12,0);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS fare_rate_per_km   integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS original_route_m   integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS matched_route_m    integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS detour_m           integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS detour_pct         double precision;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_insert_idx  integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_insert_idx integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_duration_s   integer;

-- Rides posted before distance_m existed (migration 005) never got a road
-- distance. Backfill from the stored route geometry so the detour prefilter
-- and eligibility rule have a denominator for every ride. Geometry length is
-- the road polyline length — the same definition rides.create uses.
UPDATE rides SET distance_m = ST_Length(route::geography)
WHERE distance_m IS NULL;
