export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** GeoJSON LineString coordinates: [lng, lat][] */
  coordinates: [number, number][];
  /** Total drive time in seconds. */
  durationS: number;
  /**
   * Drive time of each leg in seconds. With no waypoints this is [durationS].
   * With N waypoints there are N+1 legs: origin->w1, w1->w2, ..., wN->dest.
   */
  legDurationsS?: number[];
}

export interface DirectionsProvider {
  /**
   * @param waypoints Intermediate stops, in the order they must be visited.
   *                  Used to re-route a ride through its passengers' pickups.
   */
  route(origin: LatLng, dest: LatLng, waypoints?: LatLng[]): Promise<RouteResult>;
}

export const DIRECTIONS_PROVIDER = 'DIRECTIONS_PROVIDER';
