import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { MatchingQueueModule } from '../matching-queue/matching-queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';

@Module({
  imports: [MatchingModule, MatchingQueueModule, RealtimeModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
