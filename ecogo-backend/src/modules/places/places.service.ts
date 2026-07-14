import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import {
  GEOCODING_PROVIDER,
  GeocodingProvider,
  PlaceDetail,
  PlaceSuggestion,
} from './geocoding.provider';

/**
 * Geocoding proxy with a Redis cache, mirroring CachedDirectionsService.
 * Autocomplete keys are normalized query text (+ coarse location bias);
 * reverse keys are coordinates rounded to ~10 m. Cache failures fall through
 * to the live provider; provider failures surface as 502 so clients can show
 * a retry state instead of a silent empty list.
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly ttl: number;

  constructor(
    @Inject(GEOCODING_PROVIDER) private readonly provider: GeocodingProvider,
    @Inject(REDIS) private readonly redis: IORedis,
    config: ConfigService,
  ) {
    this.ttl = config.get<number>('places.cacheTtlS') ?? 86_400;
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      // cache read failed — fall through to the live provider
    }
    let result: T;
    try {
      result = await load();
    } catch (error) {
      this.logger.warn(`Geocoding provider failed for ${key}: ${error}`);
      throw new BadGatewayException('Address lookup is temporarily unavailable');
    }
    try {
      await this.redis.set(key, JSON.stringify(result), 'EX', this.ttl);
    } catch {
      // cache write failed — non-fatal
    }
    return result;
  }

  autocomplete(
    input: string,
    near?: { lat: number; lng: number },
  ): Promise<PlaceSuggestion[]> {
    const q = input.trim().toLowerCase().normalize('NFC');
    // Bias bucket ~11 km so nearby users share cache entries.
    const bias = near ? `:${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : '';
    return this.cached(`geo:ac:${q}${bias}`, () => this.provider.autocomplete(input, near));
  }

  detail(placeId: string): Promise<PlaceDetail | null> {
    return this.cached(`geo:pd:${placeId}`, () => this.provider.detail(placeId));
  }

  reverse(lat: number, lng: number): Promise<PlaceDetail | null> {
    return this.cached(`geo:rev:${lat.toFixed(4)},${lng.toFixed(4)}`, () =>
      this.provider.reverse(lat, lng),
    );
  }
}
