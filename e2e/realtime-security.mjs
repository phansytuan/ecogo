// Live Socket.IO authorization smoke test. Requires the Docker stack and e2e/seed.sql.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../ecogo-dispatch/package.json', import.meta.url));
const { io } = require('socket.io-client');
const API = process.env.BASE || 'http://localhost:3000/api';
const WS = API.replace(/\/api\/?$/, '');
const runId = String(Date.now()).slice(-8);
let passed = 0;

function ok(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
  passed++;
}

async function call(method, path, token, body) {
  const response = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, json };
}

async function login(phone) {
  const requested = await call('POST', '/auth/request-otp', null, { phone });
  ok(requested.status < 300 && requested.json.devCode, `request OTP for ${phone}`);
  const verified = await call('POST', '/auth/verify-otp', null, {
    phone,
    code: requested.json.devCode,
  });
  ok(verified.status < 300 && verified.json.accessToken, `verify OTP for ${phone}`);
  return verified.json.accessToken;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(WS, { transports: ['websocket'], auth: { token }, forceNew: true });
    const timer = setTimeout(() => reject(new Error('socket connection timed out')), 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', reject);
  });
}

function emit(socket, event, body) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), 5000);
    socket.emit(event, body, (reply) => {
      clearTimeout(timer);
      resolve(reply);
    });
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const driverToken = await login(`093${runId.slice(-7)}`);
  const passengerToken = await login(`094${runId.slice(-7)}`);
  const dispatcherToken = await login('0900000009');
  const vehicle = await call('POST', '/vehicles', driverToken, {
    type: 'car_7', plate: `RT-${runId}`, seats: 6,
  });
  ok(vehicle.status < 300 && vehicle.json.id, 'create isolated driver vehicle');
  const ride = await call('POST', '/rides', driverToken, {
    vehicleId: vehicle.json.id,
    origin: { lat: 18.679, lng: 105.681, label: 'Vinh' },
    dest: { lat: 21.0278, lng: 105.8342, label: 'Ha Noi' },
    departureTime: new Date(Date.now() + 3600e3).toISOString(),
    totalSeats: 6,
    pricePerSeat: 250000,
  });
  ok(ride.status < 300 && ride.json.id, 'create isolated open ride');

  const [driver, passenger, dispatcher] = await Promise.all([
    connect(driverToken), connect(passengerToken), connect(dispatcherToken),
  ]);
  try {
    ok((await emit(driver, 'ride:join', { rideId: ride.json.id })).ok, 'driver joins own ride room');
    ok(!(await emit(passenger, 'ride:join', { rideId: ride.json.id })).ok,
      'unmatched passenger cannot join ride room');
    ok(!(await emit(passenger, 'chat:join', {
      bookingId: '33333333-3333-4333-8333-333333333333',
    })).ok, 'non-member cannot join chat room');
    ok(!(await emit(driver, 'driver:location', {
      rideId: ride.json.id, lat: 91, lng: 105.84,
    })).ok, 'out-of-range coordinates are rejected');

    let dispatchEvents = 0;
    let lastLocation;
    dispatcher.on('driver:location', (location) => {
      dispatchEvents++;
      lastLocation = location;
    });
    ok(!(await emit(passenger, 'driver:location', {
      rideId: ride.json.id, lat: 21.02, lng: 105.84,
    })).ok, 'passenger cannot spoof driver location');
    await delay(150);
    ok(dispatchEvents === 0, 'rejected spoof is not broadcast');

    ok((await emit(driver, 'driver:location', {
      rideId: ride.json.id, lat: 21.02, lng: 105.84, heading: 90,
    })).ok, 'owning driver can publish valid location');
    await delay(150);
    ok(dispatchEvents === 1 && lastLocation?.lat === 21.02,
      'authorized location reaches dispatcher room once');
    ok((await emit(driver, 'ride:leave', { rideId: ride.json.id })).ok,
      'driver can leave ride room');
  } finally {
    driver.disconnect();
    passenger.disconnect();
    dispatcher.disconnect();
  }
  console.log(`\nAll ${passed} realtime security checks passed.`);
}

main().catch((error) => {
  console.error('Realtime security smoke failed:', error);
  process.exit(1);
});
