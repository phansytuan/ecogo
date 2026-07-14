/**
 * Distance-bracket fare model. A passenger pays for the distance THEY travel
 * (pickup -> dropoff), at the per-km rate of the bracket that distance falls in.
 * Longer trips are cheaper per km. Rates are placeholders — tune per corridor.
 */
export interface PriceBracket {
  maxKm: number; // upper bound (inclusive) of this bracket
  ratePerKm: number; // VND per km
}

export const DEFAULT_BRACKETS: PriceBracket[] = [
  { maxKm: 50, ratePerKm: 1800 },
  { maxKm: 150, ratePerKm: 1400 },
  { maxKm: 300, ratePerKm: 1150 },
  { maxKm: Infinity, ratePerKm: 1000 },
];

export function ratePerKm(km: number, brackets: PriceBracket[] = DEFAULT_BRACKETS): number {
  for (const b of brackets) if (km <= b.maxKm) return b.ratePerKm;
  return brackets[brackets.length - 1].ratePerKm;
}

/** Fare for a trip of `km`, rounded to the nearest 1,000đ. */
export function quoteFare(km: number, brackets: PriceBracket[] = DEFAULT_BRACKETS): number {
  if (km <= 0) return 0;
  const raw = km * ratePerKm(km, brackets);
  return Math.round(raw / 1000) * 1000;
}

export interface SeatFare {
  /** Integer VND per seat, rounded to the nearest 1,000đ. */
  farePerSeat: number;
  /** The bracket rate the fare was computed with — snapshot on the booking. */
  ratePerKm: number;
  /** Road distance the fare is based on (the PASSENGER's own route). */
  distanceM: number;
}

/**
 * Per-seat fare from an integer road distance in meters:
 *   fare = distance_m x rate_per_km / 1000, rounded to the nearest 1,000đ.
 * All inputs and outputs are integers — meters and VND — so repeated
 * quotes/bookings never drift through floating-point error.
 */
export function fareForDistanceM(
  distanceM: number,
  brackets: PriceBracket[] = DEFAULT_BRACKETS,
): SeatFare {
  const m = Math.max(0, Math.round(distanceM));
  const rate = ratePerKm(m / 1000, brackets);
  // m * rate is exact integer arithmetic (both are integers well below 2^53).
  const farePerSeat = m === 0 ? 0 : Math.round((m * rate) / 1_000_000) * 1000;
  return { farePerSeat, ratePerKm: rate, distanceM: m };
}
