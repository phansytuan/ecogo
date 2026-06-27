import { Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MatchingModule } from '../matching/matching.module';
import { REDIS_CONN, RedisConn } from '../../redis/redis.module';
import { MATCHING_QUEUE, QUEUE_NAME, MatchingQueueProducer } from './matching.queue';
import { MatchingProcessor } from './matching.processor';

@Module({
  imports: [MatchingModule],
  providers: [
    {
      provide: MATCHING_QUEUE,
      inject: [REDIS_CONN],
      useFactory: (conn: RedisConn) => new Queue(QUEUE_NAME, { connection: conn }),
    },
    MatchingQueueProducer,
    MatchingProcessor,
  ],
  exports: [MatchingQueueProducer],
})
export class MatchingQueueModule {}
