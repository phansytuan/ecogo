import { checkDeparture } from './departure';

const now = new Date('2026-07-01T12:00:00Z');
const window = { maxBackdateMin: 60, maxAheadDays: 30 };

describe('checkDeparture', () => {
  it('accepts a departure right now', () => {
    expect(checkDeparture(now, now, window).ok).toBe(true);
  });

  it('accepts a departure inside the backdate window (driver logging late)', () => {
    const late = new Date('2026-07-01T11:30:00Z'); // 30 min ago
    expect(checkDeparture(late, now, window).ok).toBe(true);
  });

  it('accepts exactly at the backdate boundary', () => {
    const edge = new Date('2026-07-01T11:00:00Z'); // exactly 60 min ago
    expect(checkDeparture(edge, now, window).ok).toBe(true);
  });

  it('rejects a departure past the backdate window', () => {
    const stale = new Date('2026-07-01T10:59:00Z'); // 61 min ago
    const r = checkDeparture(stale, now, window);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too_far_past');
  });

  it('rejects a ride posted days into the past', () => {
    const r = checkDeparture(new Date('2026-06-28T12:00:00Z'), now, window);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too_far_past');
  });

  it('accepts a normal future departure', () => {
    expect(checkDeparture(new Date('2026-07-03T08:00:00Z'), now, window).ok).toBe(true);
  });

  it('rejects a departure beyond the scheduling horizon', () => {
    const r = checkDeparture(new Date('2026-08-15T12:00:00Z'), now, window);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too_far_future');
  });

  it('rejects an invalid date', () => {
    expect(checkDeparture(new Date('nonsense'), now, window).ok).toBe(false);
  });

  it('a zero backdate window means no lateness is tolerated', () => {
    const strict = { maxBackdateMin: 0, maxAheadDays: 30 };
    expect(checkDeparture(new Date('2026-07-01T11:59:00Z'), now, strict).ok).toBe(false);
    expect(checkDeparture(now, now, strict).ok).toBe(true);
  });
});
