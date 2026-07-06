/**
 * Per-segment seat accounting for corridor pooling.
 *
 * A booking only occupies a seat on the sub-interval [fp, fd) of the ride's
 * route (fractions in [0,1]). Two bookings only compete for a seat where their
 * intervals overlap. Endpoints are half-open: a passenger alighting at 0.4 and
 * another boarding at 0.4 do NOT conflict.
 *
 * Pure and deterministic so it can be unit-tested without a database.
 */
export interface Seg {
  fp: number;
  fd: number;
  seats: number;
}

/**
 * Maximum number of seats simultaneously occupied at any point within [a, b).
 * Occupancy is piecewise-constant and only changes at interval start points,
 * so the maximum over [a, b) is attained at `a` or at some segment's `fp`
 * that falls in [a, b). We sample those breakpoints.
 */
export function maxOverlapSeats(segs: Seg[], a: number, b: number): number {
  if (b <= a) return 0;
  const points = [a];
  for (const s of segs) {
    if (s.fp > a && s.fp < b) points.push(s.fp);
  }
  let max = 0;
  for (const x of points) {
    let sum = 0;
    for (const s of segs) {
      if (s.fp <= x && x < s.fd) sum += s.seats;
    }
    if (sum > max) max = sum;
  }
  return max;
}

/** Seats free on segment [a, b) given existing bookings and the vehicle's total. */
export function freeSeatsOnSegment(segs: Seg[], totalSeats: number, a: number, b: number): number {
  return Math.max(0, totalSeats - maxOverlapSeats(segs, a, b));
}

/** Can a new booking of `need` seats fit on [a, b) alongside the existing ones? */
export function canFit(segs: Seg[], totalSeats: number, a: number, b: number, need: number): boolean {
  return maxOverlapSeats(segs, a, b) + need <= totalSeats;
}

/** Seats free at the tightest point across the whole route — the denormalised
 *  `available_seats` value (0 means full somewhere). */
export function tightestFreeSeats(segs: Seg[], totalSeats: number): number {
  return freeSeatsOnSegment(segs, totalSeats, 0, 1);
}
