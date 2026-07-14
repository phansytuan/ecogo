import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { REDIS_CONN, RedisConn } from '../../redis/redis.module';
import { AssignmentService } from '../matching/assignment.service';
import { QUEUE_NAME } from './matching.queue';

@Injectable()
export class MatchingProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchingProcessor.name);
  private worker?: Worker;

  constructor(
    @Inject(REDIS_CONN) private readonly conn: RedisConn,
    private readonly assignment: AssignmentService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name !== 'reattempt') return;
        const { bookingId } = job.data as { bookingId: string };
        const matched = await this.assignment.tryAutoMatch(bookingId);
        if (!matched) {
          await this.assignment.markNoMatch(bookingId);
        }
      },
      { connection: this.conn },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.id} failed: ${err.message}`),
    );
    this.worker.on('error', (error) =>
      this.logger.error(`Worker connection error: ${error.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
