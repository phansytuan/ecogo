import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { REDIS_CONN, RedisConn } from '../../redis/redis.module';
import { AssignmentService } from '../matching/assignment.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MatchingQueueProducer } from './matching.queue';
import { QUEUE_NAME } from './matching.queue';

@Injectable()
export class MatchingProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchingProcessor.name);
  private worker?: Worker;

  constructor(
    @Inject(REDIS_CONN) private readonly conn: RedisConn,
    private readonly assignment: AssignmentService,
    private readonly queue: MatchingQueueProducer,
    private readonly realtime: RealtimeGateway,
  ) {}

  async process(job: Job): Promise<void> {
    if (job.name !== 'first-match' && job.name !== 'reattempt') return;
    const { bookingId } = job.data as { bookingId: string };

    try {
      const matched = await this.assignment.tryAutoMatch(bookingId);
      if (!matched) {
        if (job.name === 'first-match') {
          await this.scheduleReattempt(bookingId);
        } else {
          await this.assignment.markNoMatch(bookingId);
        }
      }
    } catch (error) {
      this.logger.error(
        `Re-match for booking ${bookingId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      const isFinalAttempt =
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await this.escalateAfterFinalFailure(job.name, bookingId);
      }

      throw error;
    }
  }

  private async scheduleReattempt(bookingId: string): Promise<void> {
    await this.queue.scheduleReattempt(bookingId);
    this.realtime.emitToDispatch('request.pending', { id: bookingId });
  }

  private async escalateAfterFinalFailure(jobName: string, bookingId: string): Promise<void> {
    try {
      if (jobName === 'first-match') {
        await this.scheduleReattempt(bookingId);
      } else {
        await this.assignment.markNoMatch(bookingId);
      }
    } catch (escalationError) {
      this.logger.error(
        `Failed to escalate booking ${bookingId} after ${jobName}: ${
          escalationError instanceof Error
            ? escalationError.message
            : String(escalationError)
        }`,
      );
    }
  }

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAME,
      this.process.bind(this),
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
