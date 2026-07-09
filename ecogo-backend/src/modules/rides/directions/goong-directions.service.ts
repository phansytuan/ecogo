import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DirectionsProvider, LatLng, RouteResult } from './directions.provider';

/**
 * Goong Directions. Returns an encoded polyline we decode into [lng,lat] pairs.
 * Docs: https://docs.goong.io/rest/direction/
 */
@Injectable()
export class GoongDirectionsService implements DirectionsProvider {
  private readonly logger = new Logger(GoongDirectionsService.name);

  constructor(private readonly config: ConfigService) {}

  async route(origin: LatLng, dest: LatLng, waypoints: LatLng[] = []): Promise<RouteResult> {
    const key = this.config.get<string>('directions.goongApiKey');
    const url = 'https://rsapi.goong.io/Direction';
    const params: Record<string, string | undefined> = {
      origin: `${origin.lat},${origin.lng}`,
      destination: `${dest.lat},${dest.lng}`,
      vehicle: 'car',
      api_key: key,
    };
    // Goong takes intermediate stops as a semicolon-separated waypoints list.
    if (waypoints.length > 0) {
      params.waypoints = waypoints.map((w) => `${w.lat},${w.lng}`).join(';');
    }
    const { data } = await axios.get(url, { params });
    const route = data?.routes?.[0];
    if (!route) throw new Error('Goong returned no route');
    const coordinates = decodePolyline(route.overview_polyline.points);
    const legs: { duration?: { value?: number } }[] = route.legs ?? [];
    const legDurationsS = legs.map((l) => l.duration?.value ?? 0);
    const durationS = legDurationsS.reduce((a, b) => a + b, 0);
    return { coordinates, durationS, legDurationsS };
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
