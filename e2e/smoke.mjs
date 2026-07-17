// End-to-end smoke test — drives the full marketplace flow through the API.
// Run the stack first (docker compose up --build), then:  node e2e/smoke.mjs
// Uses Node 18+ global fetch.

const BASE = process.env.BASE || 'http://localhost:3000/api';
let passed = 0;

// Keep every run isolated so the smoke test is repeatable against a persistent
// local/staging database. Fixed users eventually collide with driver scheduling
// rules and make an otherwise healthy stack fail on the second run.
const runId = String(Date.now()).slice(-8);
const driverPhone = '091' + runId.slice(-7);
const passengerPhone = '092' + runId.slice(-7);
const vehiclePlate = 'SMK-' + runId;

function ok(cond, msg) {
  if (!cond) {
    console.error('\u2717 ' + msg);
    process.exit(1);
  }
  console.log('\u2713 ' + msg);
  passed++;
}

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function waitForRequest(bookingId, token, expectedStatus, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const mine = await call('GET', '/requests/mine', token);
    const request = Array.isArray(mine.json)
      ? mine.json.find((item) => item.id === bookingId)
      : null;
    if (request?.status === expectedStatus) return request;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

async function login(phone) {
  const r1 = await call('POST', '/auth/request-otp', null, { phone });
  ok(r1.status < 300, `request-otp ${phone}`);
  const code = r1.json.devCode;
  ok(!!code, 'received dev OTP code');
  const r2 = await call('POST', '/auth/verify-otp', null, { phone, code });
  ok(r2.status < 300 && r2.json.accessToken, 'verify-otp returns token');
  return { token: r2.json.accessToken, id: r2.json.user.id };
}

const VINH = { lat: 18.679, lng: 105.681, label: 'Vinh' };
const HANOI = { lat: 21.0278, lng: 105.8342, label: 'Ha Noi' };

// A pickup/dropoff that lies ON the posted ride's route, at fraction `t` of its
// length. Derived from the ride's actual geometry so corridor matching works
// with any directions provider — the straight-line 'fake' line OR goong's real
// road (whose curve leaves the straight chord off-route beyond tolerance).
function routePoint(route, t, label) {
  const coords = (typeof route === 'string' ? JSON.parse(route) : route).coordinates;
  const seg = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let target = t * total;
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    if (acc + seg[i - 1] >= target) {
      const f = seg[i - 1] === 0 ? 0 : (target - acc) / seg[i - 1];
      return {
        lat: coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f,
        lng: coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f,
        label,
      };
    }
    acc += seg[i - 1];
  }
  const last = coords[coords.length - 1];
  return { lat: last[1], lng: last[0], label };
}

async function main() {
  const now = Date.now();
  const win = {
    windowStart: new Date(now - 3600e3).toISOString(),
    windowEnd: new Date(now + 5 * 3600e3).toISOString(),
  };

  console.log('--- Driver ---');
  const drv = await login(driverPhone);
  const veh = await call('POST', '/vehicles', drv.token, {
    type: 'car_7', plate: vehiclePlate, seats: 6,
  });
  ok(veh.status < 300 && veh.json.id, 'register vehicle');

  const ride = await call('POST', '/rides', drv.token, {
    vehicleId: veh.json.id,
    origin: VINH,
    dest: HANOI,
    departureTime: new Date(now + 5000).toISOString(),
    totalSeats: 6,
    pricePerSeat: 250000,
  });
  ok(ride.status < 300 && ride.json.id, 'post ride Vinh -> Ha Noi');
  const rideId = ride.json.id;

  // Pickup/dropoff on the ride's real route, so the sub-segment matches under
  // either directions provider.
  const PICK = routePoint(ride.json.route, 0.3, 'pickup');
  const DROP = routePoint(ride.json.route, 0.6, 'dropoff');

  console.log('--- Passenger ---');
  const pax = await login(passengerPhone);

  console.log('--- Detailed addresses (places proxy) ---');
  const ac = await call(
    'GET', '/places/autocomplete?input=' + encodeURIComponent('15 Võ Thị Sáu') +
    '&lat=18.68&lng=105.68', pax.token,
  );
  ok(ac.status < 300 && Array.isArray(ac.json) && ac.json.length > 0, 'address autocomplete returns suggestions');
  ok(!!ac.json[0].placeId && !!ac.json[0].description, 'suggestions carry placeId + formatted address');
  const detail = await call(
    'GET', '/places/detail?placeId=' + encodeURIComponent(ac.json[0].placeId), pax.token,
  );
  ok(detail.status < 300 && typeof detail.json.lat === 'number' && typeof detail.json.lng === 'number',
    'place detail resolves to coordinates');
  const rev = await call('GET', `/places/reverse?lat=${PICK.lat}&lng=${PICK.lng}`, pax.token);
  ok(rev.status < 300 && !!rev.json.address, 'reverse geocoding returns an address for a GPS fix');

  console.log('--- Passenger fare quote ---');
  const quote = await call('POST', '/bookings/quote', pax.token, {
    pickup: PICK, dropoff: DROP, seats: 2,
  });
  ok(quote.status < 300 && quote.json.routeDistanceM > 0, 'quote returns the passenger road distance');
  ok(quote.json.farePerSeat > 0 && quote.json.farePerSeat % 1000 === 0,
    'fare per seat is a whole 1,000đ amount');
  ok(quote.json.totalFare === quote.json.farePerSeat * 2, 'total fare = per-seat fare x seats');
  const expectedFare =
    Math.round((quote.json.routeDistanceM * quote.json.ratePerKm) / 1e6) * 1000;
  ok(quote.json.farePerSeat === expectedFare, 'fare = distance x rate per km (integer-safe)');

  const search = await call('POST', '/matching/search', pax.token, {
    pickup: PICK, dropoff: DROP, ...win,
  });
  ok(search.status < 300 && Array.isArray(search.json), 'matching search runs');
  ok(search.json.some((c) => c.rideId === rideId), 'corridor match finds our ride');
  const cand = search.json.find((c) => c.rideId === rideId);
  ok(cand.eligible === true && cand.detour && cand.detour.detourM >= 0,
    'candidate carries detour metrics and is eligible');
  ok(cand.detour.matchedRouteM <= cand.detour.originalRemainingM * 1.2 + 1,
    'candidate respects the 120% matched-route limit');
  ok(!!cand.fareQuote && cand.fareQuote.farePerSeat > 0, 'candidate carries the passenger fare quote');
  ok(typeof cand.rankingReason === 'string' && cand.rankingReason.length > 0,
    'ranking explanation is returned');

  console.log('--- Max detour rule (20%) ---');
  // Perpendicular offsets from a mid-route point (fraction 0.45, i.e. between
  // PICK at 0.3 and DROP at 0.6, so pickup-before-dropoff ordering holds under
  // any provider). ~125 km east is certain to blow the 20% budget.
  const midRoute = routePoint(ride.json.route, 0.45, 'mid');
  const FAR = { lat: midRoute.lat, lng: midRoute.lng + 1.2, label: 'far off-corridor' };
  const farSearch = await call('POST', '/matching/search', pax.token, {
    pickup: FAR, dropoff: DROP, ...win,
  });
  ok(farSearch.status < 300 && !farSearch.json.some((c) => c.rideId === rideId),
    'far off-corridor pickup is not offered the ride');
  const farPreview = await call('POST', '/matching/preview', pax.token, {
    rideId, pickup: FAR, dropoff: DROP,
  });
  ok(farPreview.status < 300 && farPreview.json.eligible === false,
    'match preview rejects the over-limit detour');
  ok(farPreview.json.reasons.some((r) => /detour|Detour/.test(r)),
    'preview explains the detour rejection');
  const farBook = await call('POST', '/bookings', pax.token, {
    rideId, pickup: FAR, dropoff: DROP,
  });
  ok(farBook.status === 409, 'booking with an over-limit detour is rejected');

  // A moderate off-route pickup (~9 km): detour > 0 but within the 20% budget.
  const MID_OFF = { lat: midRoute.lat, lng: midRoute.lng + 0.09, label: 'moderate detour pickup' };
  const midPreview = await call('POST', '/matching/preview', pax.token, {
    rideId, pickup: MID_OFF, dropoff: DROP,
  });
  ok(midPreview.status < 300 && midPreview.json.eligible === true,
    'moderate off-corridor pickup stays eligible');
  ok(midPreview.json.detour.detourM > 0, 'moderate pickup shows a positive detour');
  ok(!!midPreview.json.fareQuote, 'preview includes the passenger fare quote');

  const book = await call('POST', '/bookings', pax.token, { rideId, pickup: PICK, dropoff: DROP });
  ok(book.status < 300 && book.json.id, 'book a seat');
  ok(book.json.status === 'matched', 'booking is matched');
  ok(Number(book.json.route_distance_m) > 0, 'booking snapshots the passenger route distance');
  ok(Number(book.json.fare) === Number(book.json.fare_per_seat) * book.json.seats,
    'booking fare = snapshotted per-seat fare x seats');
  ok(book.json.detour_m != null && Number(book.json.detour_m) >= 0,
    'booking snapshots the driver detour');
  const bookingId = book.json.id;

  const duplicate = await call('POST', '/bookings', pax.token, {
    rideId, pickup: PICK, dropoff: DROP,
  });
  ok(duplicate.status === 409, 'duplicate active booking is rejected');

  console.log('--- Confirm & complete ---');
  const confirm = await call('POST', `/bookings/${bookingId}/confirm`, drv.token);
  ok(confirm.status < 300 && confirm.json.status === 'confirmed', 'driver confirms passenger');

  const list = await call('GET', `/rides/${rideId}/bookings`, drv.token);
  ok(list.status < 300 && list.json.some((b) => b.id === bookingId), 'driver sees booking on ride');

  const earlyPayment = await call('POST', '/transactions/complete', drv.token, { bookingId });
  ok(earlyPayment.status === 409, 'payment before ride completion is rejected');

  const waitMs = Math.max(0, new Date(ride.json.departure_time).getTime() - Date.now() + 250);
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const completeRide = await call('POST', `/rides/${rideId}/complete`, drv.token);
  ok(completeRide.status < 300 && completeRide.json.status === 'completed', 'complete departed ride');

  const done = await call('POST', '/transactions/complete', drv.token, { bookingId });
  ok(done.status < 300 && done.json.transaction, 'complete records transaction');
  const tx = done.json.transaction;
  const gross = Number(tx.gross);
  // Fare is the distance-bracket price for the sub-segment the passenger travels
  // (pricing.ts), not the ride's flat price_per_seat — so assert the 10% split
  // relationship against the actual gross rather than a hard-coded amount.
  ok(Number(tx.platform_fee) === Math.round(gross * 0.1), '10% platform fee of gross');
  ok(Number(tx.driver_net) === gross - Number(tx.platform_fee), 'driver net = gross - fee');
  const duplicatePayment = await call('POST', '/transactions/complete', drv.token, { bookingId });
  ok(duplicatePayment.status === 409, 'duplicate payment is rejected');

  const rate = await call('POST', '/ratings', pax.token, { bookingId, score: 5, comment: 'Tot' });
  ok(rate.status < 300 && rate.json.id, 'passenger rates the trip');

  console.log('--- Reactive request (auto-match) ---');
  const laterDeparture = Date.now() + 12 * 3600e3;
  const ride2 = await call('POST', '/rides', drv.token, {
    vehicleId: veh.json.id,
    origin: VINH,
    dest: HANOI,
    departureTime: new Date(laterDeparture).toISOString(),
    totalSeats: 6,
  });
  ok(ride2.status < 300 && ride2.json.id, 'post second available ride');
  const reqPick = routePoint(ride2.json.route, 0.3, 'request pickup');
  const reqDrop = routePoint(ride2.json.route, 0.6, 'request dropoff');
  const req = await call('POST', '/requests', pax.token, {
    pickup: reqPick,
    dropoff: reqDrop,
    windowStart: new Date(laterDeparture - 3600e3).toISOString(),
    windowEnd: new Date(laterDeparture + 3600e3).toISOString(),
  });
  ok(req.status < 300 && req.json.id, 'create ride request');
  ok(req.json.status === 'pending' && !req.json.ride_id,
    'request returns pending before asynchronous matching');
  const matchedRequest = await waitForRequest(req.json.id, pax.token, 'matched');
  ok(!!matchedRequest?.ride_id,
    'request asynchronously auto-matches to an available future ride');

  const cancelRequest = await call('POST', `/bookings/${req.json.id}/cancel`, pax.token);
  ok(cancelRequest.status < 300 && cancelRequest.json.status === 'cancelled',
    'passenger cancels assigned request');

  const rebook = await call('POST', '/bookings', pax.token, {
    rideId: ride2.json.id, pickup: reqPick, dropoff: reqDrop,
  });
  ok(rebook.status < 300 && rebook.json.status === 'matched',
    'cancelled passenger can book another available ride');
  const cancelRide = await call('POST', `/rides/${ride2.json.id}/cancel`, drv.token);
  ok(cancelRide.status < 300 && cancelRide.json.status === 'cancelled',
    'driver cancellation terminates active passenger bookings');

  console.log(`\nAll ${passed} checks passed.`);
}

main().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
