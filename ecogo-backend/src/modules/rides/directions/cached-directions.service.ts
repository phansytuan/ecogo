import { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';
import { DirectionsProvider, LatLng, RouteResult } from './directions.provider';

/**
 * Caching decorator for any DirectionsProvider. Route geometry between two fixed
 * points is effectively static, so we cache it in Redis keyed by rounded
 * coordinates. This is the single biggest lever on external map-API spend:
 * repeated identical corridors (the common case for an inter-province product)
 * are served from cache and never re-billed.
 *
 * Cache failures never break ride creation — we fall back to the live provider.
 */
export class CachedDirectionsService implements DirectionsProvider {
  private readonly precision: number;
  private readonly ttl: number;

  constructor(
    private readonly inner: DirectionsProvider,
    private readonly redis: IORedis,
    config: ConfigService,
  ) {
    this.precision = config.get<number>('directions.cachePrecision') ?? 4;
    this.ttl = config.get<number>('directions.cacheTtlS') ?? 2_592_000; // 30 days
  }

  static key(origin: LatLng, dest: LatLng, precision: number): string {
    const r = (n: number) => n.toFixed(precision);
    return `dir:${r(origin.lat)},${r(origin.lng)}:${r(dest.lat)},${r(dest.lng)}`;
  }

  async route(origin: LatLng, dest: LatLng): Promise<RouteResult> {
    const key = CachedDirectionsService.key(origin, dest, this.precision);

    try {
      const cached = await this.redis.get(key);
      if (cached) return JSON.parse(cached) as RouteResult;
    } catch {
      // cache read failed — fall through to the live provider
    }

    const result = await this.inner.route(origin, dest);

    try {
      await this.redis.set(key, JSON.stringify(result), 'EX', this.ttl);
    } catch {
      // cache write failed — non-fatal
    }
    return result;
  }
}
