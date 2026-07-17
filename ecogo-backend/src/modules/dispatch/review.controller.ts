import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString, Length } from 'class-validator';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DispatchReviewService } from './review.service';

class ResolveRideDto {
  @IsIn(['completed', 'cancelled'])
  outcome!: 'completed' | 'cancelled';

  @IsString()
  @Length(3, 500)
  reason!: string;
}

@Controller('dispatch')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dispatcher', 'admin')
export class ReviewController {
  constructor(private readonly reviews: DispatchReviewService) {}

  @Get('reviews')
  listReviews() {
    return this.reviews.listReviews();
  }

  @Post('rides/:id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ResolveRideDto,
  ) {
    return this.reviews.resolve(id, user.id, dto.outcome, dto.reason);
  }
}
