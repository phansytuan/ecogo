export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** GeoJSON LineString coordinates: [lng, lat][] */
  coordinates: [number, number][];
  /** Total drive time in seconds. */
  durationS: number;
}

export interface DirectionsProvider {
  route(origin: LatLng, dest: LatLng): Promise<RouteResult>;
}

export const DIRECTIONS_PROVIDER = 'DIRECTIONS_PROVIDER';
