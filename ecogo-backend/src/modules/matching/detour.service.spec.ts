import { DetourService, RideStopContext } from './detour.service';
import { FakeDirectionsService } from '../rides/directions/fake-directions.service';
import { LatLng } from '../rides/directions/directions.provider';

const VINH: LatLng = { lat: 18.679, lng: 105.681 };
const HANOI: LatLng = { lat: 21.0278, lng: 105.8342 };
/** Roughly on the straight Vinh -> Hà Nội chord. */
const ON_ROUTE_A: LatLng = { lat: 19.3836, lng: 105.727 };
const ON_ROUTE_B: LatLng = { lat: 20.0885, lng: 105.7729 };
/** ~90 km east of the corridor — guaranteed to blow the 20% budget. */
const FAR_EAST: LatLng = { lat: 19.5, lng: 106.6 };

function makeConfig(over: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'matching.maxDetourRatio': 0.2,
    'matching.maxRoutedCandidates': 8,
    'matching.maxRoutedCombos': 6,
    'matching.routingTimeoutMs': 200,
    ...over,
  };
  return { get: (k: string) => values[k] } as any;
}

function ctx(intermediates: LatLng[] = [], ids: string[] = []): RideStopContext {
  return { rideId: 'ride-1', origin: VINH, dest: HANOI, intermediates, activeBookingIds: ids };
}

describe('DetourService.evaluate (mocked/fake routing provider)', () => {
  it('accepts on-corridor stops with a near-zero detour', async () => {
    const svc = new DetourService(new FakeDirectionsService(), makeConfig(), {} as any);
    const res = await svc.evaluate(ctx(), ON_ROUTE_A, ON_ROUTE_B);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.eligible).toBe(true);
      expect(res.metrics.detourM).toBeLessThan(5000);
      expect(res.metrics.originalRemainingM).toBeGreaterThan(200_000);
    }
  });

  it('rejects stops whose detour exceeds the 20% budget', async () => {
    const svc = new DetourService(new FakeDirectionsService(), makeConfig(), {} as any);
    const res = await svc.evaluate(ctx(), FAR_EAST, ON_ROUTE_B);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.eligible).toBe(false);
      expect(res.metrics.detourM).toBeGreaterThan(
        res.metrics.originalRemainingM * 0.2,
      );
    }
  });

  it('honours a configurable detour ratio', async () => {
    // A ~15%-detour pickup: ineligible at 5%, eligible at 50%.
    const midOff: LatLng = { lat: 19.5, lng: 106.3 };
    const tight = new DetourService(
      new FakeDirectionsService(), makeConfig({ 'matching.maxDetourRatio': 0.05 }), {} as any,
    );
    const loose = new DetourService(
      new FakeDirectionsService(), makeConfig({ 'matching.maxDetourRatio': 0.5 }), {} as any,
    );
    const tightRes = await tight.evaluate(ctx(), midOff, ON_ROUTE_B);
    const looseRes = await loose.evaluate(ctx(), midOff, ON_ROUTE_B);
    expect(tightRes.ok && tightRes.eligible).toBe(false);
    expect(looseRes.ok && looseRes.eligible).toBe(true);
  });

  it('evaluates insertion combinations and picks the cheapest matched route', async () => {
    const provider = new FakeDirectionsService();
    const routeSpy = jest.spyOn(provider, 'route');
    const svc = new DetourService(provider, makeConfig(), {} as any);
    // Existing stops split the corridor; the new pair belongs between them.
    const res = await svc.evaluate(
      ctx([ON_ROUTE_A, ON_ROUTE_B]),
      { lat: 19.6, lng: 105.74 },
      { lat: 19.9, lng: 105.76 },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.eligible).toBe(true);
      // Best insertion is between the two existing stops (gap 1).
      expect(res.metrics.pickupInsertIdx).toBe(1);
      expect(res.metrics.dropoffInsertIdx).toBe(1);
    }
    // Distances are built from single legs only — existing stop order can
    // never be shuffled because plans only splice into gaps (see detour.spec).
    for (const call of routeSpy.mock.calls) {
      expect((call[2] ?? []) as LatLng[]).toHaveLength(0);
    }
  });

  it('bounds provider calls by the routing budget (legs are memoized)', async () => {
    const provider = new FakeDirectionsService();
    const routeSpy = jest.spyOn(provider, 'route');
    const svc = new DetourService(
      provider, makeConfig({ 'matching.maxRoutedCombos': 3 }), {} as any,
    );
    // 3 intermediates -> 10 possible plans, but only 3 are routed. Each plan
    // adds at most 4 unique legs on top of the 4 base legs.
    await svc.evaluate(
      ctx([ON_ROUTE_A, { lat: 19.7, lng: 105.75 }, ON_ROUTE_B]),
      { lat: 19.5, lng: 105.73 },
      { lat: 20.3, lng: 105.79 },
    );
    expect(routeSpy.mock.calls.length).toBeLessThanOrEqual(4 + 3 * 4);
  });

  it('fails safe on missing/invalid coordinates without calling the provider', async () => {
    const provider = { route: jest.fn() };
    const svc = new DetourService(provider as any, makeConfig(), {} as any);
    const res1 = await svc.evaluate(ctx(), { lat: NaN, lng: 105.7 }, ON_ROUTE_B);
    const res2 = await svc.evaluate(ctx(), { lat: 200, lng: 105.7 }, ON_ROUTE_B);
    const res3 = await svc.evaluate(ctx(), null as any, ON_ROUTE_B);
    for (const r of [res1, res2, res3]) {
      expect(r).toEqual({ ok: false, reason: 'missing-coordinates' });
    }
    expect(provider.route).not.toHaveBeenCalled();
  });

  it('reports routing-failed when the provider errors', async () => {
    const provider = { route: jest.fn().mockRejectedValue(new Error('boom')) };
    const svc = new DetourService(provider as any, makeConfig(), {} as any);
    const res = await svc.evaluate(ctx(), ON_ROUTE_A, ON_ROUTE_B);
    expect(res).toEqual({ ok: false, reason: 'routing-failed' });
  });

  it('reports routing-failed when the provider times out', async () => {
    const provider = {
      route: () => new Promise((resolve) => setTimeout(resolve, 300)),
    };
    const svc = new DetourService(
      provider as any, makeConfig({ 'matching.routingTimeoutMs': 50 }), {} as any,
    );
    const res = await svc.evaluate(ctx(), ON_ROUTE_A, ON_ROUTE_B);
    expect(res).toEqual({ ok: false, reason: 'routing-failed' });
  });

  it('reports invalid-route for a zero-length original route', async () => {
    const provider = {
      route: jest.fn().mockResolvedValue({
        coordinates: [
          [105.681, 18.679],
          [105.681, 18.679],
        ],
        durationS: 0,
      }),
    };
    const svc = new DetourService(provider as any, makeConfig(), {} as any);
    const res = await svc.evaluate(ctx(), ON_ROUTE_A, ON_ROUTE_B);
    expect(res).toEqual({ ok: false, reason: 'invalid-route' });
  });
});

describe('DetourService.passengerRoute', () => {
  it('returns the provider road distance and duration', async () => {
    const svc = new DetourService(new FakeDirectionsService(), makeConfig(), {} as any);
    const r = await svc.passengerRoute(VINH, HANOI);
    expect(r).not.toBeNull();
    expect(r!.distanceM).toBeGreaterThan(200_000);
    expect(r!.durationS).toBeGreaterThan(0);
  });

  it('returns null on provider failure or invalid points', async () => {
    const failing = { route: jest.fn().mockRejectedValue(new Error('down')) };
    const svc = new DetourService(failing as any, makeConfig(), {} as any);
    expect(await svc.passengerRoute(VINH, HANOI)).toBeNull();
    expect(await svc.passengerRoute({ lat: NaN, lng: 1 }, HANOI)).toBeNull();
  });
});

describe('DetourService.stopContext', () => {
  it('orders committed stops by corridor fraction and reports the active set', async () => {
    const db = {
      one: jest.fn().mockResolvedValue({
        route: JSON.stringify({
          type: 'LineString',
          coordinates: [
            [105.681, 18.679],
            [105.8342, 21.0278],
          ],
        }),
      }),
      query: jest.fn().mockResolvedValue([
        {
          id: 'b2', fp: '0.6', fd: '0.9',
          pickup_lat: 20.0, pickup_lng: 105.77, dropoff_lat: 20.9, dropoff_lng: 105.83,
        },
        {
          id: 'b1', fp: '0.1', fd: '0.4',
          pickup_lat: 18.9, pickup_lng: 105.7, dropoff_lat: 19.6, dropoff_lng: 105.74,
        },
      ]),
    };
    const svc = new DetourService(new FakeDirectionsService(), makeConfig(), db as any);
    const c = await svc.stopContext('ride-1');
    expect(c).not.toBeNull();
    expect(c!.activeBookingIds).toEqual(['b1', 'b2']);
    // Sorted by fraction: b1 pickup (0.1), b1 dropoff (0.4), b2 pickup (0.6), b2 dropoff (0.9)
    expect(c!.intermediates.map((p) => p.lat)).toEqual([18.9, 19.6, 20.0, 20.9]);
  });
});
