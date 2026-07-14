import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './bookings.dto';
import { DetourEvaluation, RideStopContext } from '../matching/detour.service';

const DTO: CreateBookingDto = {
  rideId: 'ride-1',
  pickup: { lat: 19.0, lng: 105.7, label: 'Thanh Hóa', placeId: 'p-1' },
  dropoff: { lat: 20.0, lng: 105.78, label: 'Ninh Bình', placeId: 'p-2' },
  pickupAddress: '15 Võ Thị Sáu, phường Trường Vinh, tỉnh Nghệ An',
  dropoffAddress: '17 Duy Tân, phường Cầu Giấy, TP Hà Nội',
  seats: 1,
};

function okEval(detourM = 10_000, eligible = true): DetourEvaluation {
  return {
    ok: true,
    eligible,
    maxDetourRatio: 0.2,
    metrics: {
      originalRemainingM: 300_000,
      matchedRouteM: 300_000 + detourM,
      detourM,
      detourPct: detourM / 300_000,
      pickupInsertIdx: 0,
      dropoffInsertIdx: 0,
      extraDurationS: 900,
      materialNegative: false,
    },
  };
}

function ctx(activeBookingIds: string[] = []): RideStopContext {
  return {
    rideId: 'ride-1',
    origin: { lat: 18.679, lng: 105.681 },
    dest: { lat: 21.0278, lng: 105.8342 },
    intermediates: [],
    activeBookingIds,
  };
}

interface TxWorld {
  ride?: Partial<Record<string, unknown>>;
  activeBookings?: { id: string; fp: string; fd: string; seats: number }[];
}

function fakeClient(world: TxWorld) {
  const ride = {
    id: 'ride-1',
    driver_id: 'driver-1',
    status: 'open',
    available_seats: 4,
    total_seats: 4,
    price_per_seat: '250000',
    distance_m: '300000',
    departure_time: new Date(Date.now() + 3600_000).toISOString(),
    duration_s: 14400,
    fp: 0.3,
    fd: 0.6,
    ...world.ride,
  };
  const insertedRows: unknown[][] = [];
  const client = {
    insertedRows,
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (/FROM rides WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [ride] };
      if (/SELECT id, fp, fd, seats FROM bookings/.test(sql)) {
        return { rows: world.activeBookings ?? [] };
      }
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT 1\s+?FROM bookings/s.test(sql)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO bookings/.test(sql)) {
        insertedRows.push(params!);
        return {
          rows: [{ id: 'booking-new', ride_id: 'ride-1', status: 'matched', fare: params![15] }],
        };
      }
      if (/SELECT 1 FROM ride_seats/.test(sql)) return { rows: [], rowCount: 0 };
      if (/UPDATE rides SET available_seats/.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unstubbed query: ${sql}`);
    }),
  };
  return client;
}

function makeService(opts: {
  world?: TxWorld;
  evaluation?: DetourEvaluation | null;
  stopCtx?: RideStopContext;
  paxRoute?: { distanceM: number; durationS: number } | null;
}) {
  const client = fakeClient(opts.world ?? {});
  const db = { tx: jest.fn(async (cb: (c: unknown) => unknown) => cb(client)) };
  const detour = {
    passengerRoute: jest.fn().mockResolvedValue(
      opts.paxRoute === undefined ? { distanceM: 120_000, durationS: 8640 } : opts.paxRoute,
    ),
    evaluateForRide: jest.fn().mockResolvedValue(
      opts.evaluation === null
        ? null
        : { ctx: opts.stopCtx ?? ctx(), result: opts.evaluation ?? okEval() },
    ),
  };
  const realtime = { emitToRide: jest.fn(), emitToDispatch: jest.fn() };
  const events = { emit: jest.fn() };
  const svc = new BookingsService(db as any, realtime as any, events as any, detour as any);
  return { svc, db, client, detour, realtime, events };
}

describe('BookingsService.quote', () => {
  it('quotes from the passenger road distance with integer VND math', async () => {
    const { svc } = makeService({});
    const q = await svc.quote({ pickup: DTO.pickup, dropoff: DTO.dropoff, seats: 2 });
    expect(q).toEqual({
      routeDistanceM: 120_000,
      routeDistanceKm: 120,
      durationS: 8640,
      ratePerKm: 1400,
      farePerSeat: 168_000, // 120 km x 1400đ/km
      seats: 2,
      totalFare: 336_000,
    });
  });

  it('rejects unroutable pairs with a retryable 400', async () => {
    const { svc } = makeService({ paxRoute: null });
    await expect(
      svc.quote({ pickup: DTO.pickup, dropoff: DTO.dropoff }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('BookingsService.create (detour revalidation + fare snapshot)', () => {
  it('books an eligible match and snapshots fare + detour metrics', async () => {
    const { svc, client, events } = makeService({});
    const booking = await svc.create('pax-1', DTO);
    expect(booking.id).toBe('booking-new');

    const params = client.insertedRows[0];
    // fare = farePerSeat x seats = 168,000 x 1
    expect(params[15]).toBe(168_000);
    expect(params[16]).toBe(120_000); // route_distance_m — passenger's own distance
    expect(params[17]).toBe(168_000); // fare_per_seat
    expect(params[18]).toBe(1400); // fare_rate_per_km
    expect(params[19]).toBe(300_000); // original_route_m
    expect(params[20]).toBe(310_000); // matched_route_m
    expect(params[21]).toBe(10_000); // detour_m
    expect(params[10]).toBe('p-1'); // pickup_place_id
    expect(params[11]).toBe('p-2'); // dropoff_place_id
    expect(events.emit).toHaveBeenCalledWith('booking.matched', expect.objectContaining({
      bookingId: 'booking-new',
    }));
  });

  it('rejects a booking whose detour exceeds the limit before touching the ride', async () => {
    const { svc, db } = makeService({ evaluation: okEval(90_000, false) });
    await expect(svc.create('pax-1', DTO)).rejects.toThrow(ConflictException);
    await expect(svc.create('pax-1', DTO)).rejects.toThrow(/exceeds the 20% limit/);
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('rejects when the ride cannot be routed with the new stops', async () => {
    const { svc } = makeService({ evaluation: { ok: false, reason: 'routing-failed' } });
    await expect(svc.create('pax-1', DTO)).rejects.toThrow(/routing-failed/);
  });

  it('rejects when the passenger pickup/dropoff cannot be routed', async () => {
    const { svc } = makeService({ paxRoute: null });
    await expect(svc.create('pax-1', DTO)).rejects.toThrow(BadRequestException);
  });

  it('aborts with 409 when the stop set changed between evaluation and the tx', async () => {
    // Evaluation saw no other bookings, but by commit time one exists.
    const { svc } = makeService({
      stopCtx: ctx([]),
      world: { activeBookings: [{ id: 'b-race', fp: '0.1', fd: '0.9', seats: 1 }] },
    });
    await expect(svc.create('pax-1', DTO)).rejects.toThrow(/changed while booking/);
  });

  it('rejects the last-seat race via segment capacity inside the tx', async () => {
    // Stop set matches the evaluation, but the surviving booking holds the
    // only remaining seats on an overlapping segment.
    const { svc } = makeService({
      stopCtx: ctx(['b-1']),
      world: {
        ride: { total_seats: 1 },
        activeBookings: [{ id: 'b-1', fp: '0.1', fd: '0.9', seats: 1 }],
      },
    });
    await expect(svc.create('pax-1', DTO)).rejects.toThrow(/Not enough seats/);
  });

  it('rejects when pickup is not before dropoff along the route', async () => {
    const { svc } = makeService({ world: { ride: { fp: 0.7, fd: 0.2 } } });
    await expect(svc.create('pax-1', DTO)).rejects.toThrow(/before dropoff/);
  });
});
