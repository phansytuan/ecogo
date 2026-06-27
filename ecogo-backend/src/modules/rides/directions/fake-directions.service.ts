import { Injectable } from '@nestjs/common';
import { DirectionsProvider, LatLng, RouteResult } from './directions.provider';

/**
 * Offline provider for dev/tests. Builds a straight 2-point line and estimates
 * duration from great-circle distance at ~50 km/h. Good enough to exercise the
 * matching engine without hitting an external API.
 */
@Injectable()
export class FakeDirectionsService implements DirectionsProvider {
  async route(origin: LatLng, dest: LatLng): Promise<RouteResult> {
    const km = haversineKm(origin, dest);
    const durationS = Math.round((km / 50) * 3600);
    return {
      coordinates: [
        [origin.lng, origin.lat],
        [dest.lng, dest.lat],
      ],
      durationS,
    };
  }
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const toRad = (d: number) => (d * Math.PI) / 180;
