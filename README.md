# ECOGO — Carpooling platform (MVP)

Inter-provincial / inter-district ride-sharing for Vietnam (rides ≥ 35 km), digitising
the demand currently handled over Facebook/Zalo/phone. Differentiator: **corridor
matching** — a driver going A→B picks up passengers along sub-segments of the route.

## Repository

| Project | Stack | What it is |
|---|---|---|
| `ecogo-backend/`   | NestJS + PostgreSQL/PostGIS + Redis | API: auth, rides, corridor matching, real-time, dispatch, chat, money, ratings |
| `ecogo-dispatch/`  | React + Vite + Leaflet | Dispatcher cockpit (the human-in-the-loop) |
| `ecogo-passenger/` | Flutter | Passenger app: search, book, track, chat |
| `ecogo-driver/`    | Flutter | Driver app: post rides, confirm, broadcast GPS, chat |

Each project has its own README with details.

## Run the whole backend (one command)

```bash
docker compose up --build           # starts Postgres+PostGIS, Redis, and the API on :3000
```

The API applies the schema on boot (idempotent). When it's up:

```bash
# End-to-end smoke test — exercises the full flow through the API
node e2e/smoke.mjs

# Promote a phone to dispatcher so it can use the console
docker compose exec -T db psql -U ecogo -d ecogo < e2e/seed.sql
```

## Run the clients

```bash
# Dispatch console
cd ecogo-dispatch && cp .env.example .env && npm install && npm run dev   # :5173

# Passenger / driver apps (generate platform folders once, then run)
cd ecogo-passenger && flutter create --platforms=android,ios . && flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:3000/api --dart-define=WS_BASE=http://10.0.2.2:3000
```

## The flow it implements

A driver posts a ride and shares GPS → a passenger searches the corridor, books, and
watches the car move live → demand that can't be auto-matched escalates to the dispatch
console after 15 minutes, where a dispatcher claims and assigns → both sides chat and
confirm → on completion the 10% fee and any 3-year affiliate earning are recorded.

## What's verified vs. authored-for-local-build

- **Machine-verified here:** backend (`tsc` + `nest build` + unit tests) and the dispatch
  console (`tsc` + `vite build`). The e2e smoke test is syntax-checked; run it against the
  live stack to verify behaviour.
- **Authored-for-local-build:** the two Flutter apps (no SDK/pub access in the build
  environment). First `flutter pub get && flutter analyze` is the real gate.

See `PILOT_CHECKLIST.md` before going live.
