import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { TransactionsService } from './transactions.service';
import { ReferralsService } from './referrals.service';
import { TransactionsController } from './transactions.controller';

@Module({
  imports: [RealtimeModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, ReferralsService],
})
export class TransactionsModule {}
