-- Distance for pricing/scheduling, and actual-completion timestamp for gap rules.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS distance_m   double precision;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS completed_at timestamptz;
