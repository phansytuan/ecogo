/**
 * Minimum rest gap between a driver's consecutive trips.
 *
 *   actual completion known:  gap = (120/325) * km  minutes   (~2h for 325 km)
 *   estimated completion:     gap = (240/325) * km  minutes   (~4h for 325 km)
 *
 * The estimated buffer is larger because the previous trip's finish is uncertain.
 */
export const actualGapMinutes = (km: number) => (120 / 325) * km;
export const estimatedGapMinutes = (km: number) => (240 / 325) * km;

export interface PriorTrip {
  departure: Date;
  durationS: number;
  completedAt: Date | null;
  km: number;
}

/** The earliest a driver may depart on a new trip, given a prior trip. */
export function earliestNextDeparture(prev: PriorTrip): Date {
  if (prev.completedAt) {
    return new Date(prev.completedAt.getTime() + actualGapMinutes(prev.km) * 60_000);
  }
  const estCompletion = prev.departure.getTime() + prev.durationS * 1000;
  return new Date(estCompletion + estimatedGapMinutes(prev.km) * 60_000);
}
