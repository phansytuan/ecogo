import { MatchingProcessor } from './matching.processor';

describe('MatchingProcessor', () => {
  const connStub = {};
  let assignmentMock: { tryAutoMatch: jest.Mock; markNoMatch: jest.Mock };
  let queueMock: { scheduleReattempt: jest.Mock };
  let realtimeMock: { emitToDispatch: jest.Mock };
  let processor: MatchingProcessor;

  const makeJob = (
    name: string,
    attemptsMade = 0,
  ) =>
    ({
      name,
      data: { bookingId: 'booking-1' },
      attemptsMade,
      opts: { attempts: 3 },
    }) as any;

  beforeEach(() => {
    assignmentMock = {
      tryAutoMatch: jest.fn(),
      markNoMatch: jest.fn(),
    };
    queueMock = { scheduleReattempt: jest.fn() };
    realtimeMock = { emitToDispatch: jest.fn() };
    processor = new MatchingProcessor(
      connStub as any,
      assignmentMock as any,
      queueMock as any,
      realtimeMock as any,
    );
    jest.spyOn((processor as any).logger, 'error').mockImplementation(() => undefined);
  });

  it('ignores jobs that are not reattempt jobs', async () => {
    await processor.process(makeJob('other'));
    expect(assignmentMock.tryAutoMatch).not.toHaveBeenCalled();
    expect(assignmentMock.markNoMatch).not.toHaveBeenCalled();
  });

  it('does not escalate when auto-match succeeds', async () => {
    assignmentMock.tryAutoMatch.mockResolvedValue(true);
    await processor.process(makeJob('reattempt'));
    expect(assignmentMock.tryAutoMatch).toHaveBeenCalledWith('booking-1');
    expect(assignmentMock.markNoMatch).not.toHaveBeenCalled();
  });

  it('schedules a delayed reattempt when first-match finds no match', async () => {
    assignmentMock.tryAutoMatch.mockResolvedValue(false);

    await processor.process(makeJob('first-match'));

    expect(queueMock.scheduleReattempt).toHaveBeenCalledWith('booking-1');
    expect(realtimeMock.emitToDispatch).toHaveBeenCalledWith('request.pending', {
      id: 'booking-1',
    });
    expect(assignmentMock.markNoMatch).not.toHaveBeenCalled();
  });

  it('escalates when auto-match finds no match', async () => {
    assignmentMock.tryAutoMatch.mockResolvedValue(false);
    await processor.process(makeJob('reattempt'));
    expect(assignmentMock.markNoMatch).toHaveBeenCalledTimes(1);
    expect(assignmentMock.markNoMatch).toHaveBeenCalledWith('booking-1');
  });

  it('rethrows an early-attempt failure without escalating', async () => {
    const error = new Error('routing unavailable');
    assignmentMock.tryAutoMatch.mockRejectedValue(error);

    await expect(processor.process(makeJob('reattempt', 0))).rejects.toBe(error);
    expect(assignmentMock.markNoMatch).not.toHaveBeenCalled();
  });

  it('escalates and rethrows on the final failed attempt', async () => {
    const error = new Error('routing unavailable');
    assignmentMock.tryAutoMatch.mockRejectedValue(error);

    await expect(processor.process(makeJob('reattempt', 2))).rejects.toBe(error);
    expect(assignmentMock.markNoMatch).toHaveBeenCalledTimes(1);
    expect(assignmentMock.markNoMatch).toHaveBeenCalledWith('booking-1');
  });

  it('schedules a delayed reattempt after the final first-match failure', async () => {
    const error = new Error('routing unavailable');
    assignmentMock.tryAutoMatch.mockRejectedValue(error);

    await expect(processor.process(makeJob('first-match', 2))).rejects.toBe(error);
    expect(queueMock.scheduleReattempt).toHaveBeenCalledWith('booking-1');
    expect(realtimeMock.emitToDispatch).toHaveBeenCalledWith('request.pending', {
      id: 'booking-1',
    });
    expect(assignmentMock.markNoMatch).not.toHaveBeenCalled();
  });

  it('preserves the original error when final escalation also fails', async () => {
    const originalError = new Error('routing unavailable');
    const escalationError = new Error('database unavailable');
    assignmentMock.tryAutoMatch.mockRejectedValue(originalError);
    assignmentMock.markNoMatch.mockRejectedValue(escalationError);

    await expect(processor.process(makeJob('reattempt', 2))).rejects.toBe(originalError);
    expect(assignmentMock.markNoMatch).toHaveBeenCalledTimes(1);
  });
});
