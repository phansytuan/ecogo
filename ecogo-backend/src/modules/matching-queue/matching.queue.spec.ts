import {
  MatchingQueueProducer,
  REATTEMPT_ATTEMPTS,
  REATTEMPT_BACKOFF_MS,
  REATTEMPT_DELAY_MS,
} from './matching.queue';

describe('MatchingQueueProducer', () => {
  it('schedules a retried reattempt job with retained failures', async () => {
    const queue = { add: jest.fn() };
    const producer = new MatchingQueueProducer(queue as any);

    await producer.scheduleReattempt('booking-1');

    expect(REATTEMPT_ATTEMPTS).toBe(3);
    expect(REATTEMPT_BACKOFF_MS).toBe(30_000);
    expect(queue.add).toHaveBeenCalledWith(
      'reattempt',
      { bookingId: 'booking-1' },
      {
        delay: REATTEMPT_DELAY_MS,
        jobId: 'reattempt-booking-1',
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    );
  });
});
