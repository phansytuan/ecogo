import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchingModule } from '../matching/matching.module';
import { DispatchService } from './dispatch.service';
import { DispatchController } from './dispatch.controller';
import { ReviewController } from './review.controller';
import { DispatchReviewService } from './review.service';

@Module({
  imports: [MatchingModule, RealtimeModule],
  controllers: [DispatchController, ReviewController],
  providers: [DispatchService, DispatchReviewService],
})
export class DispatchModule {}
