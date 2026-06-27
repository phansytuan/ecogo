-- =====================================================================
-- ECOGO — Database schema (MVP). PostgreSQL 16 + PostGIS.
-- Source of truth. Run via: npm run db:init
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- USERS — passengers, drivers, dispatchers, admins share one table; roles[] distinguishes.
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL UNIQUE,
  full_name     text,
  avatar_url    text,
  roles         text[] NOT NULL DEFAULT '{passenger}',
  rating        numeric(3,2) DEFAULT 5.00,
  kyc_status    text NOT NULL DEFAULT 'none'
                CHECK (kyc_status IN ('none','pending','verified','rejected')),
  kyc_documents jsonb,
  referred_by   uuid REFERENCES users(id),
  referred_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN (roles);

-- VEHICLES
CREATE TABLE IF NOT EXISTS vehicles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid NOT NULL REFERENCES users(id),
  type        text NOT NULL CHECK (type IN ('limousine','car_4','car_7','van_16')),
  plate       text NOT NULL,
  model       text,
  seats       int  NOT NULL CHECK (seats > 0),
  is_ev       boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON vehicles(driver_id);

-- RIDES — geospatial heart.
CREATE TABLE IF NOT EXISTS rides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid NOT NULL REFERENCES users(id),
  vehicle_id      uuid NOT NULL REFERENCES vehicles(id),
  origin_label    text,
  dest_label      text,
  route           geometry(LineString, 4326) NOT NULL,
  duration_s      int  NOT NULL,
  departure_time  timestamptz NOT NULL,
  total_seats     int  NOT NULL CHECK (total_seats > 0),
  available_seats int  NOT NULL CHECK (available_seats >= 0),
  price_per_seat  numeric(12,0),
  allows_cargo    boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','full','ongoing','completed','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rides_route ON rides USING GIST (route);
CREATE INDEX IF NOT EXISTS idx_rides_open  ON rides(departure_time) WHERE status = 'open';

-- BOOKINGS — stores fp/fd for segment matching. dispatched_by added for dispatch audit.
CREATE TABLE IF NOT EXISTS bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id       uuid REFERENCES rides(id),
  passenger_id  uuid NOT NULL REFERENCES users(id),
  pickup        geometry(Point, 4326) NOT NULL,
  dropoff       geometry(Point, 4326) NOT NULL,
  pickup_label  text,
  dropoff_label text,
  fp            double precision,
  fd            double precision,
  seats         int NOT NULL DEFAULT 1 CHECK (seats > 0),
  fare          numeric(12,0),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','matched','confirmed','ongoing',
                                  'completed','cancelled','no_match')),
  matched_by    text CHECK (matched_by IN ('auto','dispatcher')),
  dispatched_by uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (fp IS NULL OR fd IS NULL OR fp < fd)
);
CREATE INDEX IF NOT EXISTS idx_bookings_ride      ON bookings(ride_id);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger ON bookings(passenger_id);
CREATE INDEX IF NOT EXISTS idx_bookings_pending   ON bookings(created_at)
  WHERE status IN ('pending','no_match');

-- REFERRALS + AFFILIATE_EARNINGS (3-year ledger)
CREATE TABLE IF NOT EXISTS referrals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id         uuid NOT NULL REFERENCES users(id),
  referred_user_id  uuid NOT NULL REFERENCES users(id),
  pct               numeric(4,3) NOT NULL DEFAULT 0.050,
  started_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '3 years',
  UNIQUE (referred_user_id)
);
CREATE TABLE IF NOT EXISTS affiliate_earnings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id   uuid NOT NULL REFERENCES referrals(id),
  booking_id    uuid NOT NULL REFERENCES bookings(id),
  base_amount   numeric(12,0) NOT NULL,
  pct           numeric(4,3)  NOT NULL,
  earned        numeric(12,0) NOT NULL,
  payout_status text NOT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending','paid')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_earnings_referral ON affiliate_earnings(referral_id);

-- TRANSACTIONS (cash record-keeping, not a gateway)
CREATE TABLE IF NOT EXISTS transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES bookings(id),
  gross        numeric(12,0) NOT NULL,
  platform_fee numeric(12,0) NOT NULL,
  driver_net   numeric(12,0) NOT NULL,
  method       text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','wallet','gateway')),
  settled      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_booking ON transactions(booking_id);

-- RATINGS
CREATE TABLE IF NOT EXISTS ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id),
  rater_id    uuid NOT NULL REFERENCES users(id),
  ratee_id    uuid NOT NULL REFERENCES users(id),
  score       int  NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);

-- SUPPORT_TICKETS
CREATE TABLE IF NOT EXISTS support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id),
  booking_id  uuid REFERENCES bookings(id),
  category    text CHECK (category IN ('complaint','support','dispute','safety')),
  status      text NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','in_progress','resolved','closed')),
  assignee_id uuid REFERENCES users(id),
  body        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_open ON support_tickets(created_at) WHERE status = 'open';
