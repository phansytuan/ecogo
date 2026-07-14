import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlacesService } from './places.service';
import { AutocompleteQueryDto, DetailQueryDto, ReverseQueryDto } from './places.dto';

/**
 * Address search proxied through the backend: apps never talk to the map
 * provider directly, and every response carries the coordinates the backend
 * will actually route/match with (address text alone is never trusted).
 */
@Controller('places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get('autocomplete')
  autocomplete(@Query() q: AutocompleteQueryDto) {
    const near = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined;
    return this.places.autocomplete(q.input, near);
  }

  @Get('detail')
  async detail(@Query() q: DetailQueryDto) {
    const place = await this.places.detail(q.placeId);
    if (!place) throw new NotFoundException('Place not found');
    return place;
  }

  @Get('reverse')
  async reverse(@Query() q: ReverseQueryDto) {
    const place = await this.places.reverse(q.lat, q.lng);
    if (!place) throw new NotFoundException('No address found at this location');
    return place;
  }
}
