import { MatchCandidateRow, RankedCandidate } from './matching.types';

export interface RankWeights {
  /** Weight on total off-route distance (km). */
  offset: number;
  /** Weight on pickup-time mismatch (per 30 min). */
  time: number;
  /** Weight on driver rating shortfall (per missing star). */
  rating: number;
}

export const DEFAULT_WEIGHTS: RankWeights = { offset: 0.5, time: 0.3, rating: 0.2 };

export interface RankOptions {
  /** When the passenger ideally wants to be picked up. */
  desiredPickup?: Date;
  weights?: RankWeights;
}

/**
 * Estimated time the driver reaches the pickup point:
 * departure + (fraction along route) * (total drive duration).
 */
export function etaPickupMs(row: MatchCandidateRow): number {
  return new Date(row.departure_time).getTime() + row.fp * row.duration_s * 1000;
}

/**
 * Score a candidate. Lower is better. Pure and deterministic so it can be
 * unit-tested and tuned without a database.
 */
export function scoreCandidate(row: MatchCandidateRow, opts: RankOptions = {}): number {
  const w = opts.weights ?? DEFAULT_WEIGHTS;
  const offsetKm = (row.pickup_off_m + row.dropoff_off_m) / 1000;
  const rating = row.driver_rating != null ? Number(row.driver_rating) : 5;
  const ratingGap = Math.max(0, 5 - rating);

  let timeGap = 0;
  if (opts.desiredPickup) {
    const diffMin = Math.abs(etaPickupMs(row) - opts.desiredPickup.getTime()) / 60000;
    timeGap = diffMin / 30;
  }

  return w.offset * offsetKm + w.time * timeGap + w.rating * ratingGap;
}

export function toRanked(row: MatchCandidateRow, score: number): RankedCandidate {
  return {
    rideId: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    driverRating: row.driver_rating != null ? Number(row.driver_rating) : 5,
    originLabel: row.origin_label,
    destLabel: row.dest_label,
    departureTime: row.departure_time,
    etaPickup: new Date(etaPickupMs(row)).toISOString(),
    availableSeats: row.available_seats,
    pricePerSeat: row.price_per_seat != null ? Number(row.price_per_seat) : null,
    pickupOffsetM: Math.round(row.pickup_off_m),
    dropoffOffsetM: Math.round(row.dropoff_off_m),
    sharedKm: Math.round((row.shared_m / 1000) * 10) / 10,
    score: Math.round(score * 1000) / 1000,
  };
}

export function rankCandidates(
  rows: MatchCandidateRow[],
  opts: RankOptions = {},
): RankedCandidate[] {
  return rows
    .map((row) => ({ row, score: scoreCandidate(row, opts) }))
    .sort((a, b) => a.score - b.score)
    .map(({ row, score }) => toRanked(row, score));
}
