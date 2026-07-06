/** Raw row returned by the PostGIS candidate query. */
export interface MatchCandidateRow {
  id: string;
  driver_id: string;
  vehicle_id: string;
  origin_label: string | null;
  dest_label: string | null;
  departure_time: string; // ISO
  available_seats: number;
  total_seats: number;
  price_per_seat: string | null;
  duration_s: number;
  driver_name: string | null;
  driver_rating: string | null; // numeric comes back as string from pg
  fp: number;
  fd: number;
  pickup_off_m: number;
  dropoff_off_m: number;
  shared_m: number;
}

/** Candidate enriched with derived values and a rank score (lower = better). */
export interface RankedCandidate {
  rideId: string;
  driverId: string;
  driverName: string | null;
  driverRating: number;
  originLabel: string | null;
  destLabel: string | null;
  departureTime: string;
  etaPickup: string; // ISO — when the driver is expected at the pickup point
  availableSeats: number;
  pricePerSeat: number | null;
  pickupOffsetM: number;
  dropoffOffsetM: number;
  sharedKm: number;
  score: number;
}

export type MatchProfile = 'strict' | 'relaxed';
