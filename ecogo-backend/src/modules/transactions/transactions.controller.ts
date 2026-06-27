import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { ReferralsService } from './referrals.service';
import { CompleteBookingDto, CreateReferralDto } from './transactions.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly referrals: ReferralsService,
  ) {}

  @Post('transactions/complete')
  complete(@CurrentUser() user: AuthUser, @Body() dto: CompleteBookingDto) {
    return this.transactions.complete(user.id, dto.bookingId, dto.gross);
  }

  @Post('referrals')
  refer(@CurrentUser() user: AuthUser, @Body() dto: CreateReferralDto) {
    return this.referrals.create(user.id, dto.referredUserId);
  }
}
