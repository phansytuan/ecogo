-- Structured driver endpoints and authoritative provider route snapshot.
-- Existing rows remain a controlled legacy state; matching excludes them only
-- when route_valid is false. No coordinates or provider references are invented.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS origin_formatted_address text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS origin_latitude double precision;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS origin_longitude double precision;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS origin_place_id text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS origin_location_source text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS destination_formatted_address text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS destination_latitude double precision;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS destination_longitude double precision;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS destination_place_id text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS destination_location_source text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS original_route_distance_meters integer;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS original_route_duration_seconds integer;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS original_route_polyline text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS route_calculated_at timestamptz;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS routing_provider text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS route_valid boolean NOT NULL DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS route_revision integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS ride_waypoints (
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  formatted_address text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  place_id text,
  location_source text NOT NULL CHECK (location_source IN ('MANUAL_ADDRESS','CURRENT_GPS','MAP_PIN')),
  PRIMARY KEY (ride_id, position)
);
CREATE INDEX IF NOT EXISTS idx_ride_waypoints_ride ON ride_waypoints(ride_id, position);

CREATE TABLE IF NOT EXISTS ride_route_revisions (
  id bigserial PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ride_route_revisions ON ride_route_revisions(ride_id, revision);

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_origin_coordinates_check;
ALTER TABLE rides ADD CONSTRAINT rides_origin_coordinates_check CHECK (
  (origin_latitude IS NULL AND origin_longitude IS NULL) OR
  (origin_latitude BETWEEN -90 AND 90 AND origin_longitude BETWEEN -180 AND 180));
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_destination_coordinates_check;
ALTER TABLE rides ADD CONSTRAINT rides_destination_coordinates_check CHECK (
  (destination_latitude IS NULL AND destination_longitude IS NULL) OR
  (destination_latitude BETWEEN -90 AND 90 AND destination_longitude BETWEEN -180 AND 180));

UPDATE rides SET
  original_route_distance_meters = distance_m,
  original_route_duration_seconds = duration_s,
  route_calculated_at = created_at,
  routing_provider = 'legacy',
  route_valid = route IS NOT NULL AND distance_m > 0 AND duration_s > 0
WHERE original_route_distance_meters IS NULL;
