# ECOGO Dispatch Console — Step 4

The dispatcher cockpit: a React + Vite app wired to the backend's `/dispatch/*`
endpoints and the socket.io feed. It is the human-in-the-loop side of the matching
system — where requests that auto-matching couldn't place (or that breached the
15-minute SLA) get handled by a person.

## What it does
- **KPI bar** — waiting count, escalated (`no_match`) count, SLA breaches (> 15 min).
- **Queue** (left) — live list of `pending` / `no_match` requests, oldest first, with
  a colour-coded wait pill. Refreshes on `request.pending`, `request.no_match`, and
  `booking.matched` socket events.
- **Map** (centre, Leaflet/OSM) — the selected request's pickup (green) and dropoff
  (red), plus live driver positions streamed via `driver:location`.
- **Candidates** (right) — relaxed-profile matches for the selected request (ETA, off-route
  distance, seats, price, rating). **Claim** the request (atomic, prevents double-grab),
  then **Assign** a driver.

## Run
The backend (Steps 1–3) must be running first.

```bash
cp .env.example .env     # point VITE_API_URL / VITE_WS_URL at the backend
npm install
npm run dev              # http://localhost:5173
```

Log in with a phone number that has the **`dispatcher`** (or `admin`) role in the
backend DB. In dev the OTP is shown on screen. To grant the role:

```sql
UPDATE users SET roles = array_append(roles,'dispatcher') WHERE phone = '0900000009';
```

## Build
```bash
npm run build            # tsc --noEmit && vite build -> dist/
```

## Notes
- Auth token is kept in `localStorage` (fine for a real app; the Claude-artifact
  storage restriction does not apply here).
- The map plots the selected request and live drivers. Drawing each candidate's full
  route polyline is a later enhancement (the backend can expose `ST_AsGeoJSON(route)`
  per candidate).
