import { Injectable } from '@nestjs/common';
import { DirectionsProvider, LatLng, RouteResult } from './directions.provider';

/**
 * Offline provider for dev/tests. Builds a straight polyline through any
 * waypoints and estimates duration from great-circle distance at ~50 km/h.
 * Good enough to exercise matching and itineraries without an external API.
 */
@Injectable()
export class FakeDirectionsService implements DirectionsProvider {
  async route(origin: LatLng, dest: LatLng, waypoints: LatLng[] = []): Promise<RouteResult> {
    const points = [origin, ...waypoints, dest];
    const legDurationsS: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const km = haversineKm(points[i - 1], points[i]);
      legDurationsS.push(Math.round((km / 50) * 3600));
    }
    return {
      coordinates: points.map((p) => [p.lng, p.lat] as [number, number]),
      durationS: legDurationsS.reduce((a, b) => a + b, 0),
      legDurationsS,
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
