import { Injectable } from '@nestjs/common';
import { GeocodingProvider, PlaceDetail, PlaceSuggestion } from './geocoding.provider';

/** Corridor towns the MVP operates between — mirrors the app's kStops list. */
const TOWNS: { name: string; province: string; lat: number; lng: number }[] = [
  { name: 'Hà Tĩnh', province: 'tỉnh Hà Tĩnh', lat: 18.3559, lng: 105.8877 },
  { name: 'Vinh', province: 'tỉnh Nghệ An', lat: 18.679, lng: 105.681 },
  { name: 'Thanh Hóa', province: 'tỉnh Thanh Hóa', lat: 19.8067, lng: 105.7772 },
  { name: 'Ninh Bình', province: 'tỉnh Ninh Bình', lat: 20.2506, lng: 105.9745 },
  { name: 'Hà Nội', province: 'TP Hà Nội', lat: 21.0278, lng: 105.8342 },
  { name: 'Bắc Ninh', province: 'tỉnh Bắc Ninh', lat: 21.1861, lng: 106.0763 },
  { name: 'Bắc Giang', province: 'tỉnh Bắc Giang', lat: 21.2731, lng: 106.1946 },
];

/**
 * Offline provider for dev/tests. Deterministic: autocomplete synthesizes one
 * street-level address per corridor town for whatever was typed, and place ids
 * round-trip losslessly by encoding the coordinates.
 */
@Injectable()
export class FakeGeocodingService implements GeocodingProvider {
  static placeId(lat: number, lng: number, address: string): string {
    return `fake:${lat.toFixed(6)},${lng.toFixed(6)}:${Buffer.from(address).toString('base64url')}`;
  }

  async autocomplete(
    input: string,
    near?: { lat: number; lng: number },
  ): Promise<PlaceSuggestion[]> {
    const q = input.trim();
    if (!q) return [];
    // Towns matching the query text come first; otherwise treat the query as a
    // street address and offer it in every town (nearest town first).
    const norm = (s: string) => s.toLowerCase().normalize('NFC');
    const matches = TOWNS.filter(
      (t) => norm(t.name).includes(norm(q)) || norm(q).includes(norm(t.name)),
    );
    const towns = matches.length > 0 ? matches : [...TOWNS];
    if (near) {
      towns.sort(
        (a, b) =>
          (a.lat - near.lat) ** 2 + (a.lng - near.lng) ** 2
          - ((b.lat - near.lat) ** 2 + (b.lng - near.lng) ** 2),
      );
    }
    return towns.slice(0, 5).map((t) => {
      const address =
        matches.length > 0 ? `${t.name}, ${t.province}` : `${q}, ${t.name}, ${t.province}`;
      // Non-town queries land ~500 m from the town centre so tests can tell
      // a street-level pick from the bare town coordinates.
      const off = matches.length > 0 ? 0 : 0.005;
      return {
        placeId: FakeGeocodingService.placeId(t.lat + off, t.lng + off, address),
        description: address,
      };
    });
  }

  async detail(placeId: string): Promise<PlaceDetail | null> {
    const m = /^fake:(-?[\d.]+),(-?[\d.]+):(.+)$/.exec(placeId);
    if (!m) return null;
    return {
      placeId,
      address: Buffer.from(m[3], 'base64url').toString(),
      lat: Number(m[1]),
      lng: Number(m[2]),
    };
  }

  async reverse(lat: number, lng: number): Promise<PlaceDetail | null> {
    let best = TOWNS[0];
    let bestD = Infinity;
    for (const t of TOWNS) {
      const d = (t.lat - lat) ** 2 + (t.lng - lng) ** 2;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    const address = `Gần ${best.name}, ${best.province} (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    return { placeId: FakeGeocodingService.placeId(lat, lng, address), address, lat, lng };
  }
}
