/**
 * Builds the driver's pickup/dropoff itinerary from the confirmed passenger
 * list, ordered along the route. ETA offset (seconds from departure) is the
 * route fraction * total duration — i.e. when the vehicle reaches each point.
 */
export interface ItinBooking {
  id: string;
  fp: number;
  fd: number;
  pickupLabel: string | null;
  dropoffLabel: string | null;
  passengerName: string | null;
}

export type StopKind = 'origin' | 'pickup' | 'dropoff' | 'dest';

export interface ItinStop {
  kind: StopKind;
  fraction: number;
  etaOffsetS: number;
  label: string | null;
  bookingId?: string;
  passengerName?: string | null;
}

const rank: Record<StopKind, number> = { origin: 0, pickup: 1, dropoff: 2, dest: 3 };

export function buildItinerary(
  bookings: ItinBooking[],
  durationS: number,
  originLabel: string | null,
  destLabel: string | null,
): ItinStop[] {
  const stops: ItinStop[] = [
    { kind: 'origin', fraction: 0, etaOffsetS: 0, label: originLabel },
    { kind: 'dest', fraction: 1, etaOffsetS: durationS, label: destLabel },
  ];
  for (const b of bookings) {
    stops.push({
      kind: 'pickup',
      fraction: b.fp,
      etaOffsetS: Math.round(b.fp * durationS),
      label: b.pickupLabel,
      bookingId: b.id,
      passengerName: b.passengerName,
    });
    stops.push({
      kind: 'dropoff',
      fraction: b.fd,
      etaOffsetS: Math.round(b.fd * durationS),
      label: b.dropoffLabel,
      bookingId: b.id,
      passengerName: b.passengerName,
    });
  }
  stops.sort((a, b) => a.fraction - b.fraction || rank[a.kind] - rank[b.kind]);
  return stops;
}

/**
 * Waypoint-accurate ETAs. Given the ordered intermediate stops and the real
 * per-leg durations from the routing provider (origin->s1, s1->s2, ..., sN->dest),
 * returns the cumulative seconds-from-departure at which each stop is reached.
 *
 * Falls back to proportional (fraction * total) estimates when the provider
 * gives no leg breakdown — the straight-line case.
 */
export function etaOffsetsFromLegs(
  stopCount: number,
  legDurationsS: number[] | undefined,
  totalDurationS: number,
  fractions: number[],
): number[] {
  const expectedLegs = stopCount + 1; // origin -> ...stops... -> dest
  if (!legDurationsS || legDurationsS.length !== expectedLegs) {
    return fractions.map((f) => Math.round(f * totalDurationS));
  }
  const offsets: number[] = [];
  let acc = 0;
  for (let i = 0; i < stopCount; i++) {
    acc += legDurationsS[i];
    offsets.push(acc);
  }
  return offsets;
}
