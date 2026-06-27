# ECOGO — Pilot & Go-Live Checklist

What stands between the current build and a real pilot on the Vinh–Hà Nội corridor.
Ordered by what can stop the project, not by what's most fun to build.

## 1. Legal & compliance (do this before code matters)
- [ ] Decide the operating model: **connection platform** (like Grab) vs. self-operated.
      This shapes liability, contracts, and tax. It is not a technical choice.
- [ ] Transport-business compliance — Nghị định 10/2020/NĐ-CP and amendments. Confirm
      whether drivers must be registered businesses/households and what the platform's
      obligations are. **Consult a transport lawyer.** (This document is not legal advice.)
- [ ] Driver KYC: ID, driving licence, vehicle registration, inspection, insurance.
      The `kyc_status` / `kyc_documents` fields exist; wire a real review workflow.
- [ ] Passenger T&Cs, privacy policy, data-retention policy (PDPD compliance).

## 2. Security hardening
- [ ] Replace `JWT_SECRET` with a strong managed secret; rotate. Shorten token TTL + refresh.
- [ ] Move the app token from `shared_preferences` / `localStorage` to secure storage
      (`flutter_secure_storage`; httpOnly cookie or short-lived token for the console).
- [ ] Rate-limit auth (OTP request/verify) and matching endpoints.
- [ ] Real OTP provider (Firebase Auth phone or eSMS/FPT) — set `OTP_PROVIDER`.
- [ ] HTTPS/TLS everywhere; lock CORS to known origins (currently `*` on the socket).
- [ ] Input hardening already uses `ValidationPipe` (whitelist + forbidNonWhitelisted) — keep it.

## 3. Infrastructure
- [ ] Managed PostgreSQL **with PostGIS** + managed Redis (Viettel/FPT Cloud or AWS/GCP).
- [ ] Replace the single-stage Docker image with a multi-stage prod build (no devDeps);
      run migrations as a separate job, not on every boot.
- [ ] Automated DB backups + restore drill. PITR if possible.
- [ ] CI/CD (GitHub Actions): typecheck, test, build, deploy.

## 4. Observability
- [ ] Error tracking (Sentry) on backend + both apps + console.
- [ ] Structured logs + request tracing; dashboards for match rate, time-to-match,
      queue depth, SLA breaches.
- [ ] Health/readiness endpoints; uptime monitoring + alerting.

## 5. Cost control (the one that surprises people)
- [ ] Switch `DIRECTIONS_PROVIDER=goong` and add an API key. **Cache route geometries** —
      directions calls are the biggest variable cost. Simplify polylines (`ST_Simplify`).
- [ ] Budget + alerts on Goong, SMS/OTP, and push spend. Re-run the cost model at 100 /
      1,000 / 10,000 trips/month.

## 6. Known MVP shortcuts to close
- [ ] **Background GPS**: driver app shares location only in the foreground. Move to a
      foreground service / `flutter_background_geolocation`.
- [ ] **Per-segment seats**: MVP counts a seat against the whole ride. The `fp/fd` data is
      already stored — implement interval-overlap seat accounting (v1.5).
- [ ] **Shared Flutter code**: extract `ecogo_core` (api client, auth, socket, models)
      used by both apps instead of duplicating.
- [ ] **Direct-booking event**: `POST /bookings` doesn't emit `booking.matched`; the
      request→match path and dispatcher assignment do. Add one `events.emit(...)`.
- [ ] **Masked calling** (Stringee) and richer ETA.
- [ ] **Affiliate payouts**: earnings are recorded to the ledger; build the payout job.

## 7. Pilot plan — Vinh ↔ Hà Nội
- [ ] Recruit 10–20 drivers who already run the corridor (the affiliate 5%/3yr is the hook).
- [ ] Staff 1–2 dispatchers for the cockpit during operating hours.
- [ ] Seed demand: students, workers, the Việt Kiều / expat segments from the brief.
- [ ] Run free-for-passengers + 10% driver fee; settle cash manually (record-keeping exists).
- [ ] Success metrics to watch: **auto-match rate**, **time-to-match**, **seat fill rate**,
      cancellation rate, dispatcher interventions per 100 requests, NPS.
- [ ] Weekly review; only expand to a second corridor once fill rate and match time are healthy.

## 8. Pre-launch smoke
- [ ] `docker compose up --build` → `node e2e/smoke.mjs` passes against staging.
- [ ] `flutter analyze` clean on both apps; manual run of the full journey on a device.
- [ ] Dispatcher dry-run: create a request that won't auto-match → it surfaces in the
      console → claim → assign → both clients update live.
