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
