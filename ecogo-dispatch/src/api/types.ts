export type RequestStatus = "pending" | "no_match" | "processing";

export interface QueueItem {
  id: string;
  passenger_id: string;
  passenger_name: string | null;
  passenger_phone: string | null;
  pickup_label: string | null;
  dropoff_label: string | null;
  p_lat: number;
  p_lng: number;
  d_lat: number;
  d_lng: number;
  seats: number;
  status: RequestStatus;
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  waiting_s: number;
  created_at: string;
}

export interface Companion {
  fullName: string;
  phone: string | null;
  email: string | null;
}

/** The canonical trip a processed request was assigned to. */
export interface TripInfo {
  bookingId: string;
  status: string;
  assignedBy: string | null;
  trip: {
    rideId: string;
    status: string;
    departureTime: string;
    origin: string | null;
    dest: string | null;
    originAddress: string | null;
    destinationAddress: string | null;
    originLocationSource: string | null;
    destinationLocationSource: string | null;
    waypoints: {
      position: number;
      formattedAddress: string;
      latitude: number;
      longitude: number;
      locationSource: string;
    }[];
    originalRouteDistanceMeters: number | null;
    originalRouteDurationSeconds: number | null;
    originalRouteGeometry: {
      type: "LineString";
      coordinates: [number, number][];
    } | null;
    routeCalculatedAt: string | null;
    routingProvider: string | null;
    routeValid: boolean;
    distanceKm: number | null;
    totalSeats: number;
    availableSeats: number;
  };
  driver: { id: string; name: string | null; phone: string | null };
  vehicle: { plate: string; type: string; seats: number };
  segment: {
    pickupLabel: string | null;
    dropoffLabel: string | null;
    pickupAddress: string | null;
    dropoffAddress: string | null;
    companions: Companion[];
    seats: number;
    fare: number | null;
    /** Passenger travel distance (fare basis). */
    routeDistanceKm: number | null;
    /** Driver detour (matching/eligibility basis). */
    detourKm: number | null;
    detourPct: number | null;
    extraDurationS: number | null;
    pickupEta: string;
    dropoffEta: string;
  };
}

/** Driver-side detour metrics (road distances from the routing provider). */
export interface CandidateDetour {
  originalRemainingM: number;
  matchedRouteM: number;
  detourM: number;
  detourPct: number;
  pickupInsertIdx: number;
  dropoffInsertIdx: number;
  extraDurationS: number | null;
}

/** Passenger-side fare quote (their own route, never the detour). */
export interface CandidateFare {
  routeDistanceM: number;
  farePerSeat: number;
  ratePerKm: number;
  seats: number;
  totalFare: number;
}

export interface Candidate {
  rideId: string;
  driverName: string | null;
  driverRating: number;
  originLabel: string | null;
  destLabel: string | null;
  departureTime: string;
  createdAt: string;
  etaPickup: string;
  availableSeats: number;
  pricePerSeat: number | null;
  pickupOffsetM: number;
  dropoffOffsetM: number;
  sharedKm: number;
  score: number;
  eligible: boolean;
  exclusionReason: string | null;
  rankingReason: string | null;
  detour: CandidateDetour | null;
  fareQuote: CandidateFare | null;
}

export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  at: number;
}

// Dispatcher ride-review queue model.
export interface ReviewRide {
  id: string;
  driver_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  origin_label: string | null;
  dest_label: string | null;
  departure_time: string;
  duration_s: number;
  active_bookings: number;
  total_seats: number;
  total_fare: number;
}
