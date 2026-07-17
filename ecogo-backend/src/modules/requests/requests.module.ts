import { Module } from '@nestjs/common';
import { MatchingQueueModule } from '../matching-queue/matching-queue.module';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';

@Module({
  imports: [MatchingQueueModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
