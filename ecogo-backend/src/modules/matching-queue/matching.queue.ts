import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export const MATCHING_QUEUE = 'MATCHING_QUEUE';
export const QUEUE_NAME = 'matching';
export const REATTEMPT_DELAY_MS = 15 * 60 * 1000; // the brief's 15-minute SLA

@Injectable()
export class MatchingQueueProducer {
  constructor(@Inject(MATCHING_QUEUE) private readonly queue: Queue) {}

  /** Schedule a single delayed re-match. If still unmatched then, it escalates. */
  async scheduleReattempt(bookingId: string): Promise<void> {
    await this.queue.add(
      'reattempt',
      { bookingId },
      {
        delay: REATTEMPT_DELAY_MS,
        jobId: `reattempt:${bookingId}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
