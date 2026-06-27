-- =====================================================================
-- ECOGO — Database schema (MVP)
-- PostgreSQL 16 + PostGIS
-- Phù hợp Giai đoạn 1; thiết kế sẵn để mở rộng v1.5 (ghế theo đoạn) và v2.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
-- gen_random_uuid() có sẵn từ PG13 (pgcrypto). Nếu cần: CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ghi chú: dùng text + CHECK cho các trường trạng thái thay vì ENUM,
-- để thêm giá trị mới không phải ALTER TYPE (linh hoạt hơn ở giai đoạn đầu).

-- =====================================================================
-- USERS — hành khách, tài xế, điều phối viên, admin dùng chung 1 bảng.
-- Phân vai bằng roles[] vì một người có thể vừa là khách vừa là tài xế.
-- =====================================================================
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL UNIQUE,                 -- định danh chính (đăng nhập OTP)
  full_name     text,
  avatar_url    text,
  roles         text[] NOT NULL DEFAULT '{passenger}',-- {passenger, driver, dispatcher, admin}
  rating        numeric(3,2) DEFAULT 5.00,

  -- KYC / xác minh tài xế (Driver Verification)
  kyc_status    text NOT NULL DEFAULT 'none'
                CHECK (kyc_status IN ('none','pending','verified','rejected')),
  kyc_documents jsonb,                                -- ảnh GPLX, CCCD, đăng kiểm, bảo hiểm...

  -- Affiliate: ai đã giới thiệu user này (xem bảng referrals cho chi tiết hiệu lực)
  referred_by   uuid REFERENCES users(id),
  referred_at   timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_roles ON users USING GIN (roles);

-- =====================================================================
-- VEHICLES
-- =====================================================================
CREATE TABLE vehicles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid NOT NULL REFERENCES users(id),
  type        text NOT NULL CHECK (type IN ('limousine','car_4','car_7','van_16')),
  plate       text NOT NULL,
  model       text,
  seats       int  NOT NULL CHECK (seats > 0),
  is_ev       boolean NOT NULL DEFAULT false,         -- ưu tiên xe điện (VinFast)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicles_driver ON vehicles(driver_id);

-- =====================================================================
-- RIDES — chuyến tài xế đăng. Trái tim geospatial của hệ thống.
-- =====================================================================
CREATE TABLE rides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid NOT NULL REFERENCES users(id),
  vehicle_id      uuid NOT NULL REFERENCES vehicles(id),

  origin_label    text,                               -- "TP Hà Tĩnh"
  dest_label      text,                               -- "Hà Nội"
  route           geometry(LineString, 4326) NOT NULL,-- polyline từ Goong Directions
  duration_s      int  NOT NULL,                      -- tổng thời gian chạy → tính ETA tại điểm đón

  departure_time  timestamptz NOT NULL,
  total_seats     int  NOT NULL CHECK (total_seats > 0),
  available_seats int  NOT NULL CHECK (available_seats >= 0),  -- MVP: đếm ghế theo CẢ chuyến
  price_per_seat  numeric(12,0),                      -- VND; mô hình giá đơn giản cho MVP

  allows_cargo    boolean NOT NULL DEFAULT false,     -- hàng hóa nhỏ (gác lại nhưng đã có cờ)

  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','full','ongoing','completed','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rides_route ON rides USING GIST (route);          -- bắt buộc cho ST_DWithin
CREATE INDEX idx_rides_open  ON rides(departure_time) WHERE status = 'open';  -- partial index

-- =====================================================================
-- BOOKINGS — đặt chỗ của hành khách.
-- Lưu sẵn fp/fd (vị trí đón/trả dọc tuyến) để nâng lên ghép-theo-đoạn ở v1.5.
-- =====================================================================
CREATE TABLE bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id       uuid NOT NULL REFERENCES rides(id),
  passenger_id  uuid NOT NULL REFERENCES users(id),

  pickup        geometry(Point, 4326) NOT NULL,
  dropoff       geometry(Point, 4326) NOT NULL,
  fp            double precision,   -- ST_LineLocatePoint(route, pickup)  ∈ [0,1]
  fd            double precision,   -- ST_LineLocatePoint(route, dropoff) ∈ [0,1]

  seats         int NOT NULL DEFAULT 1 CHECK (seats > 0),
  fare          numeric(12,0),      -- giá đoạn này (VND)

  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','matched','confirmed','ongoing',
                                  'completed','cancelled','no_match')),
  matched_by    text CHECK (matched_by IN ('auto','dispatcher')),  -- máy ghép hay người ghép

  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (fp IS NULL OR fd IS NULL OR fp < fd)   -- cùng chiều: điểm đón trước điểm trả
);
CREATE INDEX idx_bookings_ride      ON bookings(ride_id);
CREATE INDEX idx_bookings_passenger ON bookings(passenger_id);
-- phục vụ vòng quét reactive "15 phút" và bàn điều phối:
CREATE INDEX idx_bookings_pending   ON bookings(created_at)
  WHERE status IN ('pending','no_match');

-- =====================================================================
-- REFERRALS — tài xế giới thiệu khách. Hiệu lực 3 năm.
-- "Ai thuộc ai, hết hạn khi nào." Mỗi khách chỉ thuộc 1 người giới thiệu.
-- =====================================================================
CREATE TABLE referrals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id         uuid NOT NULL REFERENCES users(id),  -- người được hưởng hoa hồng
  referred_user_id  uuid NOT NULL REFERENCES users(id),  -- khách được giới thiệu
  pct               numeric(4,3) NOT NULL DEFAULT 0.050, -- 5%
  started_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '3 years',
  UNIQUE (referred_user_id)
);

-- AFFILIATE_EARNINGS — SỔ CÁI. Mỗi chuyến đủ điều kiện sinh 1 dòng.
-- "Nợ ẩn" cần có từ ngày đầu, dù giai đoạn đầu trả thưởng thủ công.
CREATE TABLE affiliate_earnings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id   uuid NOT NULL REFERENCES referrals(id),
  booking_id    uuid NOT NULL REFERENCES bookings(id),
  base_amount   numeric(12,0) NOT NULL,    -- chi tiêu của khách trong chuyến
  pct           numeric(4,3)  NOT NULL,
  earned        numeric(12,0) NOT NULL,    -- base_amount * pct
  payout_status text NOT NULL DEFAULT 'pending'
                CHECK (payout_status IN ('pending','paid')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_earnings_referral ON affiliate_earnings(referral_id);

-- =====================================================================
-- TRANSACTIONS — ghi nhận tài chính mỗi chuyến (MVP: tiền mặt).
-- KHÔNG phải cổng thanh toán. Để đối soát 10% và làm base cho affiliate.
-- =====================================================================
CREATE TABLE transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES bookings(id),
  gross        numeric(12,0) NOT NULL,    -- khách trả
  platform_fee numeric(12,0) NOT NULL,    -- 10% phí dịch vụ thu của tài xế
  driver_net   numeric(12,0) NOT NULL,
  method       text NOT NULL DEFAULT 'cash'
               CHECK (method IN ('cash','wallet','gateway')),
  settled      boolean NOT NULL DEFAULT false,   -- đã đối soát với tài xế chưa
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_booking ON transactions(booking_id);

-- =====================================================================
-- RATINGS — đánh giá sau chuyến (hai chiều: khách <-> tài xế)
-- =====================================================================
CREATE TABLE ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id),
  rater_id    uuid NOT NULL REFERENCES users(id),
  ratee_id    uuid NOT NULL REFERENCES users(id),
  score       int  NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ratings_ratee ON ratings(ratee_id);

-- =====================================================================
-- SUPPORT_TICKETS — khiếu nại & hỗ trợ (bàn điều phối xử lý)
-- =====================================================================
CREATE TABLE support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id),
  booking_id  uuid REFERENCES bookings(id),
  category    text CHECK (category IN ('complaint','support','dispute','safety')),
  status      text NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','in_progress','resolved','closed')),
  assignee_id uuid REFERENCES users(id),   -- điều phối viên phụ trách
  body        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_open ON support_tickets(created_at) WHERE status = 'open';

-- =====================================================================
-- LƯU Ý KIẾN TRÚC: Vị trí GPS thời gian thực KHÔNG nằm ở đây.
-- Ping tài xế (mỗi 5–10s) -> Redis (key theo ride_id, TTL ngắn) -> WebSocket.
-- Ghi từng ping vào Postgres sẽ giết DB. Chỉ flush định kỳ vào bảng lịch sử
-- (ví dụ trip_tracks) nếu thực sự cần phục vụ tra cứu/khiếu nại.
-- =====================================================================
