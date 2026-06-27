# ECOGO Backend — Step 1

NestJS + PostgreSQL/PostGIS backend. This step delivers a **runnable API spine**:
phone-OTP auth, vehicle registration, posting rides with real route geometry,
the **corridor matching engine**, and booking a seat.

Raw `pg` is used instead of an ORM — for a PostGIS-centric service, hand-written
SQL is clearer and avoids ORM geometry friction.

## Stack
- NestJS 10 (REST), `pg` (Pool), PostGIS for geospatial matching
- JWT auth via phone OTP (dev OTP is returned in the response)
- Directions provider: `fake` (offline straight line) or `goong`

## Run

```bash
# 1. Start Postgres+PostGIS and Redis
docker compose up -d

# 2. Install deps
npm install

# 3. Apply the schema
cp .env.example .env
npm run db:init

# 4. Start the API
npm run start:dev    # http://localhost:3000/api
```

Tests (pure ranking logic, no DB needed):
```bash
npm test
```

## API walkthrough (the core flow)

```bash
BASE=http://localhost:3000/api

# Driver logs in
curl -s $BASE/auth/request-otp -H 'Content-Type: application/json' \
  -d '{"phone":"0900000001"}'                       # -> { devCode: "123456" }
curl -s $BASE/auth/verify-otp -H 'Content-Type: application/json' \
  -d '{"phone":"0900000001","code":"123456"}'       # -> { accessToken }

# Register a vehicle (Bearer = driver token)
curl -s $BASE/vehicles -H "Authorization: Bearer $DRV" -H 'Content-Type: application/json' \
  -d '{"type":"car_7","plate":"37A-123.45","seats":6}'

# Post a ride Vinh -> Ha Noi
curl -s $BASE/rides -H "Authorization: Bearer $DRV" -H 'Content-Type: application/json' -d '{
  "vehicleId":"<vehicleId>",
  "origin":{"lat":18.6790,"lng":105.6810,"label":"Vinh"},
  "dest":{"lat":21.0278,"lng":105.8342,"label":"Ha Noi"},
  "departureTime":"2026-07-01T06:00:00.000Z",
  "totalSeats":6,
  "pricePerSeat":250000
}'

# Passenger searches (corridor match) for a sub-segment along that route
curl -s $BASE/matching/search -H "Authorization: Bearer $PAX" -H 'Content-Type: application/json' -d '{
  "pickup":{"lat":19.8067,"lng":105.7852,"label":"Thanh Hoa"},
  "dropoff":{"lat":20.2506,"lng":105.9745,"label":"Ninh Binh"},
  "windowStart":"2026-07-01T05:00:00.000Z",
  "windowEnd":"2026-07-01T08:00:00.000Z"
}'

# Passenger books a seat on the matched ride
curl -s $BASE/bookings -H "Authorization: Bearer $PAX" -H 'Content-Type: application/json' -d '{
  "rideId":"<rideId>",
  "pickup":{"lat":19.8067,"lng":105.7852},
  "dropoff":{"lat":20.2506,"lng":105.9745}
}'
```

## What's in this step
- `auth` — phone OTP → JWT
- `users`, `vehicles` — accounts and driver cars
- `rides` — post a trip; route fetched via directions provider, stored as `geometry(LineString,4326)`
- `matching` — PostGIS corridor query (proximity + `fp < fd` direction), TS ranking (unit-tested)
- `bookings` — reserve a seat; `fp/fd` computed at insert, seats decremented transactionally

## Step 2 — real-time, reactive matching, dispatch

- `realtime` — socket.io gateway with JWT handshake. Drivers emit `driver:location`
  → stored in Redis (`PresenceService`, TTL 30s) → fanned out to the ride room and
  the dispatch room. Rooms: `ride:<id>` and `dispatch`.
- `requests` — passenger states demand (`POST /requests` with pickup/dropoff/window).
  The system tries strict auto-match once; if nothing fits it schedules a **15-minute
  BullMQ job** and shows the request to dispatch immediately.
- `matching-queue` — BullMQ producer + worker. On the delayed job it re-matches; if
  still nothing → marks the booking `no_match` and emits `request.no_match` to dispatch.
- `dispatch` — dispatcher-only (`RolesGuard`): queue, relaxed candidates (reuses the
  `relaxed` matching profile), **atomic claim** (prevents double-grab), and manual assign
  (writes `matched_by='dispatcher'`, `dispatched_by`).
- `AssignmentService` is the shared core used by auto-match, the queue worker, and the
  dispatcher — one assignment path, three callers.

```bash
# Passenger states demand; auto-matches or escalates after 15 min
curl -s $BASE/requests -H "Authorization: Bearer $PAX" -H 'Content-Type: application/json' -d '{
  "pickup":{"lat":19.8067,"lng":105.7852},"dropoff":{"lat":20.2506,"lng":105.9745},
  "windowStart":"2026-07-01T05:00:00.000Z","windowEnd":"2026-07-01T08:00:00.000Z"
}'

# Dispatcher (needs 'dispatcher' role) works the queue
curl -s $BASE/dispatch/queue -H "Authorization: Bearer $DISP"
curl -s $BASE/dispatch/requests/<id>/candidates -H "Authorization: Bearer $DISP"
curl -s -X POST $BASE/dispatch/requests/<id>/claim  -H "Authorization: Bearer $DISP"
curl -s -X POST $BASE/dispatch/requests/<id>/assign -H "Authorization: Bearer $DISP" \
  -H 'Content-Type: application/json' -d '{"rideId":"<rideId>"}'
```

WebSocket (driver): connect with `auth: { token }`, then emit
`driver:location { rideId, lat, lng }`; passengers in `ride:<id>` receive `ride:location`.

Note: Step 2 needs Redis running (`docker compose up -d` already starts it).

## Step 3 — notifications, chat, money, ratings

- `notifications` — push via a provider interface (`fake` logs in dev, `fcm` for prod
  HTTP v1). Device tokens stored per user (`POST /notifications/token`). A
  `NotificationsListener` reacts to the **`booking.matched` domain event** (emitted by
  `AssignmentService` via `EventEmitter2`) and pushes the passenger and driver — fully
  decoupled from the matching core.
- `chat` — in-app messages scoped to a booking; only the passenger and the matched
  driver may read/post. Persisted to `messages` and pushed live to the `chat:<bookingId>`
  socket room. `POST/GET /chat/:bookingId/messages`.
- `transactions` — driver completes a booking (`POST /transactions/complete`): records
  the cash transaction (gross / **10% platform fee** / driver net) and, if the passenger
  was referred and still inside the **3-year window**, writes the affiliate earning to
  the ledger — all in one DB transaction. `POST /referrals` links a referred customer.
- `ratings` — two-way (`POST /ratings`); recomputes the ratee's average so `users.rating`
  stays current.

```bash
curl -s $BASE/notifications/token -H "Authorization: Bearer $PAX" -H 'Content-Type: application/json' -d '{"token":"<fcm-token>","platform":"android"}'
curl -s $BASE/chat/<bookingId>/messages -H "Authorization: Bearer $PAX" -H 'Content-Type: application/json' -d '{"body":"Em đang ở cổng A nhé"}'
curl -s $BASE/transactions/complete -H "Authorization: Bearer $DRV" -H 'Content-Type: application/json' -d '{"bookingId":"<id>"}'
curl -s $BASE/ratings -H "Authorization: Bearer $PAX" -H 'Content-Type: application/json' -d '{"bookingId":"<id>","score":5,"comment":"Tài xế thân thiện"}'
```

Note: Step 1's direct `POST /bookings` doesn't emit the `booking.matched` event yet — the
request→match flow (`POST /requests`) and dispatcher assignment do. Wiring it is one
`events.emit(...)` line if you keep the direct-booking path.

## Next steps (see project plan)
4. Dispatch web console (React) · 5–6. Flutter apps · 7. Hardening + pilot
