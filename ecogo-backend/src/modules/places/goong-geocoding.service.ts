import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GeocodingProvider, PlaceDetail, PlaceSuggestion } from './geocoding.provider';

/**
 * Goong Places / Geocode. Docs: https://docs.goong.io/rest/place/
 * Same API key as the directions provider.
 */
@Injectable()
export class GoongGeocodingService implements GeocodingProvider {
  constructor(private readonly config: ConfigService) {}

  private get key(): string {
    return this.config.get<string>('places.goongApiKey') ?? '';
  }

  async autocomplete(
    input: string,
    near?: { lat: number; lng: number },
  ): Promise<PlaceSuggestion[]> {
    const params: Record<string, string> = { input, api_key: this.key };
    if (near) params.location = `${near.lat},${near.lng}`;
    const { data } = await axios.get('https://rsapi.goong.io/Place/AutoComplete', {
      params,
      timeout: 8000,
    });
    const predictions: { place_id: string; description: string }[] = data?.predictions ?? [];
    return predictions.map((p) => ({ placeId: p.place_id, description: p.description }));
  }

  async detail(placeId: string): Promise<PlaceDetail | null> {
    const { data } = await axios.get('https://rsapi.goong.io/Place/Detail', {
      params: { place_id: placeId, api_key: this.key },
      timeout: 8000,
    });
    const r = data?.result;
    const loc = r?.geometry?.location;
    if (!r || loc?.lat == null || loc?.lng == null) return null;
    return {
      placeId,
      address: r.formatted_address ?? r.name ?? '',
      lat: Number(loc.lat),
      lng: Number(loc.lng),
    };
  }

  async reverse(lat: number, lng: number): Promise<PlaceDetail | null> {
    const { data } = await axios.get('https://rsapi.goong.io/Geocode', {
      params: { latlng: `${lat},${lng}`, api_key: this.key },
      timeout: 8000,
    });
    const r = data?.results?.[0];
    if (!r) return null;
    return {
      placeId: r.place_id ?? null,
      address: r.formatted_address ?? '',
      lat,
      lng,
    };
  }
}
