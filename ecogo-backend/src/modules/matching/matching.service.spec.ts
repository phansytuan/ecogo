import { MatchingService } from './matching.service';
import { MatchRequestDto } from './matching.dto';
import { DetourEvaluation } from './detour.service';

const REQ: MatchRequestDto = {
  pickup: { lat: 19.0, lng: 105.7 },
  dropoff: { lat: 20.0, lng: 105.78 },
  windowStart: '2030-01-01T06:00:00Z',
  windowEnd: '2030-01-01T18:00:00Z',
  seats: 1,
};

function rideRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ride-1',
    driver_id: 'd1',
    vehicle_id: 'v1',
    origin_label: 'Vinh',
    dest_label: 'Hà Nội',
    departure_time: '2030-01-01T08:00:00.000Z',
    created_at: '2029-12-01T00:00:00.000Z',
    available_seats: 4,
    total_seats: 4,
    price_per_seat: '250000',
    duration_s: 14400,
    distance_m: '300000',
    driver_name: 'Anh Tài',
    driver_rating: '4.9',
    fp: 0.3,
    fd: 0.6,
    pickup_off_m: 400,
    dropoff_off_m: 500,
    shared_m: 90000,
    ...over,
  };
}

function okEval(detourM: number, originalM = 300_000, eligible?: boolean): DetourEvaluation {
  return {
    ok: true,
    eligible: eligible ?? detourM <= originalM * 0.2,
    maxDetourRatio: 0.2,
    metrics: {
      originalRemainingM: originalM,
      matchedRouteM: originalM + detourM,
      detourM,
      detourPct: detourM / originalM,
      pickupInsertIdx: 0,
      dropoffInsertIdx: 0,
      extraDurationS: 600,
      materialNegative: false,
    },
  };
}

function makeService(
  rows: ReturnType<typeof rideRow>[],
  evals: Record<string, DetourEvaluation>,
  bookingSegs: { ride_id: string; fp: string; fd: string; seats: number }[] = [],
) {
  const db = {
    query: jest
      .fn()
      // 1st query: candidate prefilter; 2nd: active bookings for seat capacity
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(bookingSegs),
  };
  const detour = {
    maxDetourRatio: 0.2,
    maxRoutedCandidates: 8,
    passengerRoute: jest.fn().mockResolvedValue({ distanceM: 100_000, durationS: 7200 }),
    stopContext: jest.fn(async (rideId: string) => ({
      rideId, origin: { lat: 0, lng: 0 }, dest: { lat: 1, lng: 1 },
      intermediates: [], activeBookingIds: [],
    })),
    evaluate: jest.fn(async (ctx: { rideId: string }) => evals[ctx.rideId]),
  };
  return { svc: new MatchingService(db as any, detour as any), db, detour };
}

describe('MatchingService.search (detour pipeline)', () => {
  it('strict profile drops rides whose detour exceeds the limit', async () => {
    const { svc } = makeService(
      [rideRow({ id: 'good' }), rideRow({ id: 'bad' })],
      { good: okEval(20_000), bad: okEval(90_000) }, // 90 km > 20% of 300 km
    );
    const out = await svc.search(REQ, 'strict');
    expect(out.map((c) => c.rideId)).toEqual(['good']);
    expect(out[0].eligible).toBe(true);
    expect(out[0].detour!.detourM).toBe(20_000);
    expect(out[0].rankingReason).toContain('smallest detour');
  });

  it('accepts a detour exactly at the 120% boundary', async () => {
    const { svc } = makeService([rideRow()], { 'ride-1': okEval(60_000) }); // 300 -> 360 km
    const out = await svc.search(REQ, 'strict');
    expect(out).toHaveLength(1);
    expect(out[0].eligible).toBe(true);
  });

  it('ranks by detour distance, not by spatial proximity', async () => {
    const { svc } = makeService(
      [rideRow({ id: 'near-but-detoury' }), rideRow({ id: 'far-but-direct' })],
      { 'near-but-detoury': okEval(30_000), 'far-but-direct': okEval(5_000) },
    );
    const out = await svc.search(REQ, 'strict');
    expect(out.map((c) => c.rideId)).toEqual(['far-but-direct', 'near-but-detoury']);
  });

  it('breaks detour ties by seats, then earlier ride creation', async () => {
    const { svc } = makeService(
      [
        rideRow({ id: 'later', total_seats: 2, created_at: '2029-12-05T00:00:00.000Z' }),
        rideRow({ id: 'roomier', total_seats: 4 }),
        rideRow({ id: 'earlier', total_seats: 2, created_at: '2029-12-01T00:00:00.000Z' }),
      ],
      { later: okEval(10_000), roomier: okEval(10_000), earlier: okEval(10_000) },
    );
    const out = await svc.search(REQ, 'strict');
    expect(out.map((c) => c.rideId)).toEqual(['roomier', 'earlier', 'later']);
  });

  it('relaxed profile keeps ineligible rides annotated for the dispatcher', async () => {
    const { svc } = makeService(
      [rideRow({ id: 'good' }), rideRow({ id: 'bad' })],
      { good: okEval(20_000), bad: okEval(90_000) },
    );
    const out = await svc.search(REQ, 'relaxed');
    expect(out.map((c) => c.rideId)).toEqual(['good', 'bad']);
    expect(out[1].eligible).toBe(false);
    expect(out[1].exclusionReason).toContain('exceeds');
    expect(out[1].detour!.detourM).toBe(90_000);
  });

  it('drops unroutable rides in strict but explains them in relaxed', async () => {
    const evals: Record<string, DetourEvaluation> = {
      ok: okEval(1_000),
      broken: { ok: false, reason: 'routing-failed' },
    };
    const strict = makeService([rideRow({ id: 'ok' }), rideRow({ id: 'broken' })], evals);
    const relaxed = makeService([rideRow({ id: 'ok' }), rideRow({ id: 'broken' })], evals);
    expect((await strict.svc.search(REQ, 'strict')).map((c) => c.rideId)).toEqual(['ok']);
    const rel = await relaxed.svc.search(REQ, 'relaxed');
    expect(rel.map((c) => c.rideId)).toEqual(['ok', 'broken']);
    expect(rel[1].exclusionReason).toContain('routing-failed');
  });

  it('filters rides without enough free seats on the searched segment', async () => {
    const { svc, detour } = makeService(
      [rideRow({ id: 'full-segment', total_seats: 2 })],
      { 'full-segment': okEval(1_000) },
      [{ ride_id: 'full-segment', fp: '0.2', fd: '0.7', seats: 2 }],
    );
    const out = await svc.search({ ...REQ, seats: 1 }, 'strict');
    expect(out).toEqual([]);
    expect(detour.evaluate).not.toHaveBeenCalled(); // no routing budget wasted
  });

  it('attaches the passenger fare quote (their own route, not the detour)', async () => {
    const { svc, detour } = makeService([rideRow()], { 'ride-1': okEval(60_000) });
    const out = await svc.search({ ...REQ, seats: 2 }, 'strict');
    expect(detour.passengerRoute).toHaveBeenCalledTimes(1);
    expect(out[0].fareQuote).toEqual({
      routeDistanceM: 100_000,
      farePerSeat: 140_000, // 100 km x 1400đ/km
      ratePerKm: 1400,
      seats: 2,
      totalFare: 280_000,
    });
  });

  it('routes at most maxRoutedCandidates rides per search', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => rideRow({ id: `r${i}` }));
    const evals = Object.fromEntries(rows.map((r) => [r.id, okEval(1_000)]));
    const { svc, detour } = makeService(rows, evals);
    (detour as any).maxRoutedCandidates = 5;
    const out = await svc.search(REQ, 'strict');
    expect(detour.evaluate).toHaveBeenCalledTimes(5);
    expect(out).toHaveLength(5);
  });
});
