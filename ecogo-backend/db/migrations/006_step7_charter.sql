-- Charter mode: a posted ride with no booked seats is also offered for charter
-- along the same corridor. Drivers may opt out.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS charter_opt_out boolean NOT NULL DEFAULT false;
