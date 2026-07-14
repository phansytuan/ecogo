import { BadGatewayException } from '@nestjs/common';
import { PlacesService } from './places.service';
import { FakeGeocodingService } from './fake-geocoding.service';

function makeConfig() {
  return { get: (k: string) => ({ 'places.cacheTtlS': 60 }[k]) } as any;
}

/** Minimal in-memory stand-in for Redis. */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
  };
}

describe('FakeGeocodingService (offline provider)', () => {
  const geo = new FakeGeocodingService();

  it('suggests street-level addresses for a free-text query', async () => {
    const got = await geo.autocomplete('15 Võ Thị Sáu', { lat: 18.68, lng: 105.68 });
    expect(got.length).toBeGreaterThan(0);
    expect(got[0].description).toContain('15 Võ Thị Sáu');
    // Location bias: nearest town (Vinh / Nghệ An) first.
    expect(got[0].description).toContain('Nghệ An');
  });

  it('round-trips a suggestion through detail() to coordinates', async () => {
    const [first] = await geo.autocomplete('17 Duy Tân', { lat: 21.0, lng: 105.8 });
    const detail = await geo.detail(first.placeId);
    expect(detail).not.toBeNull();
    expect(detail!.address).toBe(first.description);
    expect(detail!.lat).toBeGreaterThan(8);
    expect(detail!.lng).toBeGreaterThan(100);
  });

  it('returns null for an unknown place id', async () => {
    expect(await geo.detail('garbage')).toBeNull();
  });

  it('reverse geocodes a GPS fix to the nearest town', async () => {
    const r = await geo.reverse(18.70, 105.69);
    expect(r).not.toBeNull();
    expect(r!.address).toContain('Vinh');
    expect(r!.lat).toBeCloseTo(18.70);
  });
});

describe('PlacesService (cache + failure handling)', () => {
  it('serves repeated autocomplete queries from cache', async () => {
    const provider = new FakeGeocodingService();
    const spy = jest.spyOn(provider, 'autocomplete');
    const redis = fakeRedis();
    const svc = new PlacesService(provider, redis as any, makeConfig());

    const a = await svc.autocomplete('Vinh');
    const b = await svc.autocomplete('vinh '); // normalized to the same key
    expect(b).toEqual(a);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('caches reverse lookups by rounded coordinates', async () => {
    const provider = new FakeGeocodingService();
    const spy = jest.spyOn(provider, 'reverse');
    const redis = fakeRedis();
    const svc = new PlacesService(provider, redis as any, makeConfig());

    await svc.reverse(18.700004, 105.690001);
    await svc.reverse(18.700001, 105.690004); // same 1e-4 bucket
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('falls through to the provider when the cache is down', async () => {
    const provider = new FakeGeocodingService();
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('redis down')),
      set: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const svc = new PlacesService(provider, redis as any, makeConfig());
    const got = await svc.autocomplete('Hà Nội');
    expect(got.length).toBeGreaterThan(0);
  });

  it('surfaces provider failures as 502 so clients can show a retry state', async () => {
    const provider = {
      autocomplete: jest.fn().mockRejectedValue(new Error('goong 500')),
      detail: jest.fn(),
      reverse: jest.fn().mockRejectedValue(new Error('goong timeout')),
    };
    const svc = new PlacesService(provider as any, fakeRedis() as any, makeConfig());
    await expect(svc.autocomplete('Vinh')).rejects.toThrow(BadGatewayException);
    await expect(svc.reverse(18.7, 105.69)).rejects.toThrow(BadGatewayException);
  });
});
