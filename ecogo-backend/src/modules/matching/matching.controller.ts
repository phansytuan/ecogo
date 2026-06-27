import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchingService } from './matching.service';
import { MatchRequestDto } from './matching.dto';

@Controller('matching')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  /** Passenger-facing search: automatic (strict) matching. */
  @Post('search')
  @UseGuards(JwtAuthGuard)
  search(@Body() dto: MatchRequestDto) {
    return this.matching.search(dto, 'strict');
  }
}
