import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchingService } from './matching.service';
import { MatchPreviewDto, MatchRequestDto } from './matching.dto';

@Controller('matching')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  /** Passenger-facing search: automatic (strict) matching. */
  @Post('search')
  @UseGuards(JwtAuthGuard)
  search(@Body() dto: MatchRequestDto) {
    return this.matching.search(dto, 'strict');
  }

  /** Detour + fare preview for one specific ride, before booking. */
  @Post('preview')
  @UseGuards(JwtAuthGuard)
  preview(@Body() dto: MatchPreviewDto) {
    return this.matching.preview(dto);
  }
}
