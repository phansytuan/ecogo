import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './ratings.dto';

@Controller('ratings')
@UseGuards(JwtAuthGuard)
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRatingDto) {
    return this.ratings.create(user.id, dto);
  }
}
