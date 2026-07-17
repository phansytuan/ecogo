import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { TransactionsService } from './transactions.service';
import { ReferralsService } from './referrals.service';
import {
  AdjustGrossDto,
  CompleteBookingDto,
  CreateReferralDto,
  RequestAdjustmentDto,
} from './transactions.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly referrals: ReferralsService,
  ) {}

  @Post('transactions/complete')
  complete(@CurrentUser() user: AuthUser, @Body() dto: CompleteBookingDto) {
    return this.transactions.complete(user.id, dto.bookingId);
  }

  @Post('transactions/adjust')
  @UseGuards(RolesGuard)
  @Roles('dispatcher', 'admin')
  adjust(@CurrentUser() user: AuthUser, @Body() dto: AdjustGrossDto) {
    return this.transactions.adjustGross(
      user.id,
      dto.bookingId,
      dto.gross,
      dto.reason,
    );
  }

  @Post('transactions/adjustment-request')
  requestAdjustment(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestAdjustmentDto,
  ) {
    return this.transactions.requestAdjustment(
      user.id,
      dto.bookingId,
      dto.proposedGross,
      dto.reason,
    );
  }

  @Post('referrals')
  refer(@CurrentUser() user: AuthUser, @Body() dto: CreateReferralDto) {
    return this.referrals.create(user.id, dto.referredUserId);
  }
}
