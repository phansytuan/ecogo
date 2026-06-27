import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ReferralsService } from './referrals.service';
import { TransactionsController } from './transactions.controller';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, ReferralsService],
})
export class TransactionsModule {}
