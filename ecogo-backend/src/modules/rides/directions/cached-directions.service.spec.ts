import { CachedDirectionsService } from './cached-directions.service';
import { RouteResult } from './directions.provider';

const cfg = (precision = 4) =>
  ({ get: (k: string) => (k === 'directions.cachePrecision' ? precision : 2_592_000) }) as any;

describe('CachedDirectionsService', () => {
  it('keys on coordinates rounded to the configured precision', () => {
    const key = CachedDirectionsService.key(
      { lat: 18.67901, lng: 105.68099 },
      { lat: 21.02781, lng: 105.83422 },
      4,
    );
    expect(key).toBe('dir:18.6790,105.6810:21.0278,105.8342');
  });

  it('calls the provider once, then serves from cache', async () => {
    let calls = 0;
    const inner = {
      route: async (): Promise<RouteResult> => {
        calls++;
        return { coordinates: [[0, 0], [1, 1]], durationS: 123 };
      },
    };
    const store = new Map<string, string>();
    const redis = {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => { store.set(k, v); },
    } as any;
    const svc = new CachedDirectionsService(inner as any, redis, cfg());

    const a = { lat: 1, lng: 1 };
    const b = { lat: 2, lng: 2 };
    const r1 = await svc.route(a, b);
    const r2 = await svc.route(a, b);

    expect(calls).toBe(1); // second call hit the cache
    expect(r1.durationS).toBe(123);
    expect(r2.durationS).toBe(123);
  });

  it('falls back to the provider when the cache is down', async () => {
    const inner = { route: async (): Promise<RouteResult> => ({ coordinates: [], durationS: 7 }) };
    const redis = {
      get: async () => { throw new Error('redis down'); },
      set: async () => { throw new Error('redis down'); },
    } as any;
    const svc = new CachedDirectionsService(inner as any, redis, cfg());

    const r = await svc.route({ lat: 0, lng: 0 }, { lat: 1, lng: 1 });
    expect(r.durationS).toBe(7);
  });
});

describe('CachedDirectionsService waypoints', () => {
  it('waypoints produce a different cache key than the direct route', () => {
    const a = { lat: 1, lng: 1 };
    const b = { lat: 2, lng: 2 };
    const direct = CachedDirectionsService.key(a, b, 4);
    const via = CachedDirectionsService.key(a, b, 4, [{ lat: 1.5, lng: 1.5 }]);
    expect(via).not.toBe(direct);
    expect(via).toContain('via');
  });

  it('passes waypoints through to the inner provider', async () => {
    let seen: unknown;
    const inner = {
      route: async (_o: unknown, _d: unknown, w: unknown) => {
        seen = w;
        return { coordinates: [], durationS: 5 };
      },
    };
    const redis = { get: async () => null, set: async () => {} } as any;
    const svc = new CachedDirectionsService(inner as any, redis, cfg());
    const wp = [{ lat: 1.5, lng: 1.5 }];
    await svc.route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, wp);
    expect(seen).toEqual(wp);
  });
});
