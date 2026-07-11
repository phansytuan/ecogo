/**
 * Departure-time plausibility.
 *
 * A hard "must be in the future" rule is wrong: a driver may post a ride that is
 * departing right now, or log one a few minutes after rolling. But a ride posted
 * days into the past is a data-entry error (or abuse) and corrupts the
 * scheduling-gap and cleanup logic downstream.
 *
 * So: allow a bounded backdate window, and cap how far ahead a ride may be
 * scheduled. Pure, so the boundaries are unit-testable.
 */
export interface DepartureWindow {
  /** How many minutes into the past a departure may be set. */
  maxBackdateMin: number;
  /** How many days ahead a ride may be scheduled. */
  maxAheadDays: number;
}

export type DepartureCheck =
  | { ok: true }
  | { ok: false; reason: 'too_far_past' | 'too_far_future'; message: string };

export function checkDeparture(
  departure: Date,
  now: Date,
  window: DepartureWindow,
): DepartureCheck {
  if (Number.isNaN(departure.getTime())) {
    return { ok: false, reason: 'too_far_past', message: 'Invalid departure time' };
  }

  const earliest = now.getTime() - window.maxBackdateMin * 60_000;
  if (departure.getTime() < earliest) {
    return {
      ok: false,
      reason: 'too_far_past',
      message: `Departure time is too far in the past (max ${window.maxBackdateMin} minutes back)`,
    };
  }

  const latest = now.getTime() + window.maxAheadDays * 86_400_000;
  if (departure.getTime() > latest) {
    return {
      ok: false,
      reason: 'too_far_future',
      message: `Departure time is more than ${window.maxAheadDays} days ahead`,
    };
  }
  return { ok: true };
}
