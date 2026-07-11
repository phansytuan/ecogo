import { canAcceptCharter, isCharterAvailable } from './charter';

describe('isCharterAvailable', () => {
  it('is on by default when nothing is booked', () => {
    expect(isCharterAvailable([])).toBe(true);
    expect(isCharterAvailable(['cancelled', 'no_match'])).toBe(true);
  });
  it('turns off once a seat is held', () => {
    expect(isCharterAvailable(['matched'])).toBe(false);
    expect(isCharterAvailable(['confirmed'])).toBe(false);
    expect(isCharterAvailable(['ongoing'])).toBe(false);
  });
  it('a pending request does not yet commit the vehicle', () => {
    expect(isCharterAvailable(['pending'])).toBe(true);
  });
  it('respects the driver opting out', () => {
    expect(isCharterAvailable([], true)).toBe(false);
  });
  it('is off when the ride is no longer open', () => {
    expect(isCharterAvailable([], false, 'cancelled')).toBe(false);
    expect(isCharterAvailable([], false, 'completed')).toBe(false);
  });
});

describe('canAcceptCharter', () => {
  const now = new Date('2026-07-01T08:00:00Z');

  it('is free when no pickup is committed', () => {
    const r = canAcceptCharter({ now, nextPickupAt: null, etaToPickupS: 99999 });
    expect(r.feasible).toBe(true);
  });

  it('accepts when the driver arrives before the deadline', () => {
    // pickup 10:00, needs 1h, 15min buffer -> arrive 09:00 <= 09:45
    const r = canAcceptCharter({
      now,
      nextPickupAt: new Date('2026-07-01T10:00:00Z'),
      etaToPickupS: 3600,
    });
    expect(r.feasible).toBe(true);
    expect(r.slackS).toBe(45 * 60);
  });

  it('rejects when the driver would arrive late', () => {
    // pickup 09:00, needs 2h -> arrives 10:00, far past deadline
    const r = canAcceptCharter({
      now,
      nextPickupAt: new Date('2026-07-01T09:00:00Z'),
      etaToPickupS: 7200,
    });
    expect(r.feasible).toBe(false);
    expect(r.slackS).toBeLessThan(0);
    expect(r.reason).toMatch(/deadline/);
  });

  it('the buffer is what makes a marginal case fail', () => {
    const args = {
      now,
      nextPickupAt: new Date('2026-07-01T09:00:00Z'),
      etaToPickupS: 3300, // arrives 08:55, 5 min before pickup
    };
    expect(canAcceptCharter({ ...args, bufferS: 0 }).feasible).toBe(true);
    expect(canAcceptCharter({ ...args, bufferS: 900 }).feasible).toBe(false);
  });

  it('reports the latest departure time that still works', () => {
    const r = canAcceptCharter({
      now,
      nextPickupAt: new Date('2026-07-01T10:00:00Z'),
      etaToPickupS: 3600,
      bufferS: 0,
    });
    expect(r.mustLeaveBy!.toISOString()).toBe('2026-07-01T09:00:00.000Z');
  });
});
