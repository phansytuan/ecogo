# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ECOGO is a Vietnamese inter-provincial carpooling platform (rides ≥ 35 km). The differentiator is **corridor matching**: a driver going A→B can pick up passengers along sub-segments of the route. The system uses PostGIS for geospatial corridor queries.

## Monorepo layout

| Directory | Stack | Role |
|---|---|---|
| `ecogo-backend/` | NestJS + PostgreSQL/PostGIS + Redis | REST API + WebSocket gateway |
| `ecogo-dispatch/` | React + Vite + Leaflet | Dispatcher cockpit (human-in-the-loop web console) |
| `ecogo-core/` | Flutter (path package `ecogo_core`) | Shared API client (token refresh), auth, realtime, models, UI kit — consumed by both apps |
| `ecogo-passenger/` | Flutter | Passenger app (depends on `ecogo_core`) |
| `ecogo-driver/` | Flutter | Driver app (depends on `ecogo_core`) |
| `ecogo-backend/db/schema.sql` | SQL | Source-of-truth DB schema, plus incremental `db/migrations/*.sql` |
| `e2e/` | Node.js | End-to-end smoke test |

## Commands

### Run the full stack
```bash
docker compose up --build          # starts Postgres+PostGIS, Redis, API on :3000
node e2e/smoke.mjs                 # smoke test against the live stack
docker compose exec -T db psql -U ecogo -d ecogo < e2e/seed.sql  # seed a dispatcher user
```

### Backend (ecogo-backend/)
```bash
npm run typecheck     # tsc --noEmit
npm run build         # nest build
npm run start:dev     # watch mode
npm test              # jest (unit tests only — no DB needed)
npx jest ranking      # run a single spec by name
npm run db:init       # apply schema.sql against DATABASE_URL
```

### Dispatch console (ecogo-dispatch/)
```bash
cp .env.example .env && npm install
npm run dev           # :5173
npm run build         # tsc + vite build
```

### Flutter apps
Run from `ecogo-passenger/` or `ecogo-driver/`. Both consume `ecogo_core` as a
local path dependency, so shared API/auth/realtime/model/UI changes go there, not
in the app. Neither app has its own `flutter_test` dep — there are no widget tests.
```bash
flutter pub get && flutter analyze
flutter run --dart-define=API_BASE=http://10.0.2.2:3000/api --dart-define=WS_BASE=http://10.0.2.2:3000
```

## Backend architecture

NestJS with one module per domain under `src/modules/`. All modules use raw SQL via `DatabaseService` (no ORM) — queries go through `db.query<T>()` / `db.one<T>()` / `db.tx()`.

**Key module interactions:**

1. **Auth** — phone + OTP flow. OTP provider is swappable via `OTP_PROVIDER=fake|real`. JWT is validated on every request by `JwtAuthGuard`; roles are checked by `RolesGuard`.

2. **Rides** — driver posts a ride with a geometry. The route `LineString` is stored in PostGIS and indexed with GIST. Directions are fetched via a swappable provider (`DIRECTIONS_PROVIDER=fake|goong`), cached (`CachedDirectionsService`).
   - Domain logic lives in small **pure, unit-tested** modules under `modules/rides/` — `geo.ts` (haversine/polyline km), `pricing/pricing.ts` (distance-bracket fares), `departure.ts` (post-window validation), `scheduling.ts` (driver rest-gap between trips), `itinerary.ts` (ordered pickup/dropoff stops with ETA offsets), `charter.ts` (charter-availability rule). Each has a `.spec.ts`; keep the DB/HTTP out of these files.
   - Extra endpoints beyond CRUD: `POST /rides/quote`, `GET /rides/:id/itinerary`, `GET /rides/:id/route` (dynamic route), `GET/POST /rides/:id/charter*`, `POST /rides/:id/complete`.

3. **Corridor matching** (`modules/matching/`, `modules/matching-queue/`):
   - `MatchingService.search()` runs the PostGIS query (four `ST_DWithin`/`ST_LineLocatePoint` clauses) to find rides whose route passes within tolerance of the passenger's pickup **and** dropoff, in the right direction (`fp < fd`).
   - `ranking.ts` scores candidates in TypeScript (off-route distance, pickup-time mismatch, driver rating) — pure functions, unit-tested in `ranking.spec.ts`.
   - Two profiles: `strict` (tolerance 2 km, used for auto-matching) and `relaxed` (5 km, used by dispatcher).
   - `AssignmentService` handles the actual booking transaction with a `FOR UPDATE` lock on the ride row.
   - BullMQ queue (`matching-queue/`) drives the retry/escalation flow: if auto-match fails, the booking is marked `no_match` and surfaced to dispatchers via WebSocket.

4. **Realtime** (`modules/realtime/`) — Socket.io gateway. Two channel types:
   - `ride:<id>` — driver + passengers of a specific ride (location updates, booking events).
   - `dispatch` — dispatchers only (joined automatically on connect if role matches).
   - Driver emits `driver:location`; the gateway fans out to both `ride:<id>` and `dispatch`. Other services call `emitToRide()` / `emitToDispatch()` / `emitToChat()` directly.

5. **Notifications** — event-driven via `@nestjs/event-emitter`. `NotificationsListener` subscribes to `booking.matched` and calls `NotificationsService.pushToUser()`. The push provider is swappable (fake vs. FCM via `notification.provider.ts`).

6. **Transactions** — records the 10% platform fee split. `ReferralsService` records 3-year affiliate earnings (5% of driver net) when a booking completes.

## Database key points

- `rides.route` is a `geometry(LineString, 4326)` with a GIST index — all corridor queries hit this.
- `bookings.fp` / `bookings.fd` are fractional positions along the route (0–1), stored at assignment time.
- `users.roles` is a `text[]` array (e.g. `{passenger}`, `{driver,passenger}`, `{dispatcher}`), GIN-indexed.
- On boot `scripts/init-db.ts` applies `db/schema.sql`, then every `db/migrations/*.sql` in sorted filename order. All statements are idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`), so add schema changes as a new numbered migration file — don't only edit `schema.sql`.
- `rides` has `distance_m`, `completed_at`, and `charter_opt_out` columns (migrations 005/006) driving pricing, scheduling-gap, and charter logic.

## Environment variables

Copy `ecogo-backend/.env.example`. Key settings:
- `OTP_PROVIDER=fake` — OTP code is returned in the API response (dev only).
- `DIRECTIONS_PROVIDER=fake` — uses straight-line geometry (no Goong API key needed).
- `RIDES_MAX_BACKDATE_MIN` / `RIDES_MAX_AHEAD_DAYS` — how late a driver may log a departure and how far ahead a ride may be scheduled (see `departure.ts`).
- For production: set `DIRECTIONS_PROVIDER=goong` + `GOONG_API_KEY`, use a real `JWT_SECRET`, and set `OTP_PROVIDER` to the SMS provider.

## Known MVP shortcuts

See `PILOT_CHECKLIST.md` for the full list. The most relevant for code work:
- Seat accounting counts a seat against the whole ride; `fp/fd` data is stored but interval-overlap logic is not yet implemented.
- `POST /bookings` (direct booking) emits `booking.matched` to the `ride:<id>` channel + dispatch (for live driver/dispatch UI), but not the `booking.matched` app event that triggers a passenger push — only the request→match and dispatcher paths do that.
- Driver GPS sharing works only in the foreground.
