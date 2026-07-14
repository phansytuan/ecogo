/** Raw row returned by the PostGIS candidate query. */
export interface MatchCandidateRow {
  id: string;
  driver_id: string;
  vehicle_id: string;
  origin_label: string | null;
  dest_label: string | null;
  departure_time: string; // ISO
  created_at: string; // ISO — ranking tie-break
  available_seats: number;
  total_seats: number;
  price_per_seat: string | null;
  duration_s: number;
  distance_m: string | null;
  driver_name: string | null;
  driver_rating: string | null; // numeric comes back as string from pg
  fp: number;
  fd: number;
  pickup_off_m: number;
  dropoff_off_m: number;
  shared_m: number;
}

/** Driver-side matching metrics (road distances from the routing provider). */
export interface CandidateDetour {
  originalRemainingM: number;
  matchedRouteM: number;
  detourM: number;
  detourPct: number;
  pickupInsertIdx: number;
  dropoffInsertIdx: number;
  extraDurationS: number | null;
}

/** Passenger-side fare quote — based on the PASSENGER's route, never the detour. */
export interface CandidateFare {
  routeDistanceM: number;
  farePerSeat: number;
  ratePerKm: number;
  seats: number;
  totalFare: number;
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
  createdAt: string;
  etaPickup: string; // ISO — when the driver is expected at the pickup point
  availableSeats: number;
  pricePerSeat: number | null;
  pickupOffsetM: number;
  dropoffOffsetM: number;
  sharedKm: number;
  score: number;
  /** Detour eligibility: false candidates only appear in the relaxed profile. */
  eligible: boolean;
  /** Why an ineligible/unevaluated candidate was excluded (relaxed profile). */
  exclusionReason: string | null;
  /** Why this candidate ranked where it did (eligible candidates). */
  rankingReason: string | null;
  detour: CandidateDetour | null;
  fareQuote: CandidateFare | null;
}

export type MatchProfile = 'strict' | 'relaxed';
