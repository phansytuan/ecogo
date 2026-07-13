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
    departureTime: new Date(now + 3600e3).toISOString(),
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

  const search = await call('POST', '/matching/search', pax.token, {
    pickup: PICK, dropoff: DROP, ...win,
  });
  ok(search.status < 300 && Array.isArray(search.json), 'matching search runs');
  ok(search.json.some((c) => c.rideId === rideId), 'corridor match finds our ride');

  const book = await call('POST', '/bookings', pax.token, { rideId, pickup: PICK, dropoff: DROP });
  ok(book.status < 300 && book.json.id, 'book a seat');
  ok(book.json.status === 'matched', 'booking is matched');
  const bookingId = book.json.id;

  console.log('--- Confirm & complete ---');
  const confirm = await call('POST', `/bookings/${bookingId}/confirm`, drv.token);
  ok(confirm.status < 300 && confirm.json.status === 'confirmed', 'driver confirms passenger');

  const list = await call('GET', `/rides/${rideId}/bookings`, drv.token);
  ok(list.status < 300 && list.json.some((b) => b.id === bookingId), 'driver sees booking on ride');

  const done = await call('POST', '/transactions/complete', drv.token, { bookingId });
  ok(done.status < 300 && done.json.transaction, 'complete records transaction');
  const tx = done.json.transaction;
  const gross = Number(tx.gross);
  // Fare is the distance-bracket price for the sub-segment the passenger travels
  // (pricing.ts), not the ride's flat price_per_seat — so assert the 10% split
  // relationship against the actual gross rather than a hard-coded amount.
  ok(Number(tx.platform_fee) === Math.round(gross * 0.1), '10% platform fee of gross');
  ok(Number(tx.driver_net) === gross - Number(tx.platform_fee), 'driver net = gross - fee');

  const rate = await call('POST', '/ratings', pax.token, { bookingId, score: 5, comment: 'Tot' });
  ok(rate.status < 300 && rate.json.id, 'passenger rates the trip');

  console.log('--- Reactive request (auto-match) ---');
  const req = await call('POST', '/requests', pax.token, { pickup: PICK, dropoff: DROP, ...win });
  ok(req.status < 300 && req.json.id, 'create ride request');
  ok(req.json.status === 'matched', 'request auto-matched to the open ride');

  console.log(`\nAll ${passed} checks passed.`);
}

main().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
