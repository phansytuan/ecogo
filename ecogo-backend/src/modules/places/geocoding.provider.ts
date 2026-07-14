export interface PlaceSuggestion {
  /** Provider reference (Goong place_id). Stable enough to fetch details. */
  placeId: string;
  /** Full formatted address, e.g. "15 Võ Thị Sáu, phường Trường Vinh, tỉnh Nghệ An". */
  description: string;
}

export interface PlaceDetail {
  placeId: string | null;
  address: string;
  lat: number;
  lng: number;
}

/**
 * Swappable geocoding provider (PLACES_PROVIDER=fake|goong), mirroring the
 * DirectionsProvider pattern. All client address lookups are proxied through
 * the backend so the map API key never ships in an app binary.
 */
export interface GeocodingProvider {
  /** Address autocomplete; `near` biases results towards the user's location. */
  autocomplete(input: string, near?: { lat: number; lng: number }): Promise<PlaceSuggestion[]>;
  /** Resolve a suggestion to coordinates + formatted address. */
  detail(placeId: string): Promise<PlaceDetail | null>;
  /** Reverse geocode a GPS fix to the nearest address. */
  reverse(lat: number, lng: number): Promise<PlaceDetail | null>;
}

export const GEOCODING_PROVIDER = 'GEOCODING_PROVIDER';
