import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DirectionsProvider, LatLng, RouteResult } from './directions.provider';

const MAX_TRIES = 3;
const BACKOFF_MS = [300, 900];
const BREAKER_THRESHOLD = 10;
const BREAKER_OPEN_MS = 30_000;

/**
 * Goong Directions. Returns an encoded polyline we decode into [lng,lat] pairs.
 * Docs: https://docs.goong.io/rest/direction/
 *
 * Goong's Direction endpoint has no reliable multi-stop support (a `waypoints`
 * parameter is silently ignored), so multi-stop routes are built by chaining
 * one Direction call per leg and concatenating the results. Leg count is
 * bounded by the callers (itinerary size / detour-evaluation budget).
 */
@Injectable()
export class GoongDirectionsService implements DirectionsProvider {
  private readonly logger = new Logger(GoongDirectionsService.name);
  private consecutiveFailures = 0;
  private openUntil = 0;

  constructor(private readonly config: ConfigService) {}

  async route(origin: LatLng, dest: LatLng, waypoints: LatLng[] = []): Promise<RouteResult> {
    const points = [origin, ...waypoints, dest];
    const coordinates: [number, number][] = [];
    const legDurationsS: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const leg = await this.leg(points[i - 1], points[i]);
      // Drop the duplicated joint vertex between consecutive legs.
      coordinates.push(...(coordinates.length > 0 ? leg.coordinates.slice(1) : leg.coordinates));
      legDurationsS.push(leg.durationS);
    }
    return {
      coordinates,
      durationS: legDurationsS.reduce((a, b) => a + b, 0),
      legDurationsS,
    };
  }

  private async fetchDirection(params: Record<string, string>): Promise<any> {
    if (Date.now() < this.openUntil) {
      throw new Error('Goong circuit open — routing temporarily unavailable');
    }

    let lastError: unknown = new Error('Goong direction request failed');

    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      try {
        const { data } = await axios.get(
          'https://rsapi.goong.io/Direction',
          { params, timeout: 10_000 },
        );
        this.consecutiveFailures = 0;
        return data;
      } catch (error) {
        lastError = error;

        const retryable =
          axios.isAxiosError(error) &&
          (!error.response ||
            error.response.status >= 500 ||
            error.response.status === 429);
        const hasNextAttempt = attempt + 1 < MAX_TRIES;

        if (!retryable || !hasNextAttempt) {
          break;
        }

        const statusOrCode =
          error.response?.status ??
          error.code ??
          'network error';
        this.logger.warn(
          `Retrying Goong request after attempt ${attempt + 1} (${statusOrCode})`,
        );
        await this.sleep(BACKOFF_MS[attempt]);
      }
    }

    this.recordFailure();
    throw lastError;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures < BREAKER_THRESHOLD) return;

    this.openUntil = Date.now() + BREAKER_OPEN_MS;
    this.consecutiveFailures = 0;
    this.logger.warn(
      `Goong circuit opened for ${BREAKER_OPEN_MS}ms after consecutive failures`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async leg(
    from: LatLng,
    to: LatLng,
  ): Promise<{ coordinates: [number, number][]; durationS: number }> {
    const key = this.config.get<string>('directions.goongApiKey');
    const data = await this.fetchDirection({
      origin: `${from.lat},${from.lng}`,
      destination: `${to.lat},${to.lng}`,
      vehicle: 'car',
      api_key: key ?? '',
    });
    const route = data?.routes?.[0];
    if (!route) throw new Error('Goong returned no route');
    const legs: { duration?: { value?: number } }[] = route.legs ?? [];
    return {
      coordinates: decodePolyline(route.overview_polyline.points),
      durationS: legs.reduce((a, l) => a + (l.duration?.value ?? 0), 0),
    };
  }
}

/** Decode a Google/Goong encoded polyline into [lng, lat] pairs. */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lng / 1e5, lat / 1e5]);
  }
  return points;
}
