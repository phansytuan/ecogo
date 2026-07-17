import { Logger, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MatchingModule } from '../matching/matching.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { REDIS_CONN, RedisConn } from '../../redis/redis.module';
import { MATCHING_QUEUE, QUEUE_NAME, MatchingQueueProducer } from './matching.queue';
import { MatchingProcessor } from './matching.processor';

@Module({
  imports: [MatchingModule, RealtimeModule],
  providers: [
    {
      provide: MATCHING_QUEUE,
      inject: [REDIS_CONN],
      useFactory: (conn: RedisConn) => {
        const queue = new Queue(QUEUE_NAME, { connection: conn });
        const logger = new Logger('MatchingQueue');
        queue.on('error', (error) => logger.error(`connection error: ${error.message}`));
        return queue;
      },
    },
    MatchingQueueProducer,
    MatchingProcessor,
  ],
  exports: [MatchingQueueProducer],
})
export class MatchingQueueModule {}
