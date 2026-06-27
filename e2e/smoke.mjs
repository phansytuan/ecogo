// End-to-end smoke test — drives the full marketplace flow through the API.
// Run the stack first (docker compose up --build), then:  node e2e/smoke.mjs
// Uses Node 18+ global fetch.

const BASE = process.env.BASE || 'http://localhost:3000/api';
let passed = 0;

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

// Two points that lie exactly on the Vinh -> Ha Noi straight line, so they match
// reliably even with the offline 'fake' directions provider.
const VINH = { lat: 18.679, lng: 105.681, label: 'Vinh' };
const HANOI = { lat: 21.0278, lng: 105.8342, label: 'Ha Noi' };
const lerp = (a, b, t) => ({
  lat: a.lat + (b.lat - a.lat) * t,
  lng: a.lng + (b.lng - a.lng) * t,
  label: `pt-${t}`,
});
const PICK = lerp(VINH, HANOI, 0.3);
const DROP = lerp(VINH, HANOI, 0.6);

async function main() {
  const now = Date.now();
  const win = {
    windowStart: new Date(now - 3600e3).toISOString(),
    windowEnd: new Date(now + 5 * 3600e3).toISOString(),
  };

  console.log('--- Driver ---');
  const drv = await login('0911000001');
  const veh = await call('POST', '/vehicles', drv.token, {
    type: 'car_7', plate: '37A-123.45', seats: 6,
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

  console.log('--- Passenger ---');
  const pax = await login('0911000002');

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
  ok(Number(done.json.transaction.platform_fee) === 25000, '10% platform fee = 25,000');
  ok(Number(done.json.transaction.driver_net) === 225000, 'driver net = 225,000');

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
