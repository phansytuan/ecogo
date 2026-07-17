import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

export const MATCHING_QUEUE = 'MATCHING_QUEUE';
export const QUEUE_NAME = 'matching';
export const FIRST_MATCH_ATTEMPTS = 3;
export const FIRST_MATCH_BACKOFF_MS = 30_000;
export const REATTEMPT_DELAY_MS = 15 * 60 * 1000; // the brief's 15-minute SLA
export const REATTEMPT_ATTEMPTS = 3;
export const REATTEMPT_BACKOFF_MS = 30_000;

@Injectable()
export class MatchingQueueProducer implements OnModuleDestroy {
  constructor(@Inject(MATCHING_QUEUE) private readonly queue: Queue) {}

  /** Run the first match asynchronously so request creation returns immediately. */
  async scheduleFirstMatch(bookingId: string): Promise<void> {
    await this.queue.add(
      'first-match',
      { bookingId },
      {
        delay: 0,
        jobId: `first-match-${bookingId}`,
        attempts: FIRST_MATCH_ATTEMPTS,
        backoff: { type: 'exponential', delay: FIRST_MATCH_BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    );
  }

  /** Schedule a single delayed re-match. If still unmatched then, it escalates. */
  async scheduleReattempt(bookingId: string): Promise<void> {
    await this.queue.add(
      'reattempt',
      { bookingId },
      {
        delay: REATTEMPT_DELAY_MS,
        jobId: `reattempt-${bookingId}`,
        attempts: REATTEMPT_ATTEMPTS,
        backoff: { type: 'exponential', delay: REATTEMPT_BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
