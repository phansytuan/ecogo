export type RequestStatus = 'pending' | 'no_match' | 'processing';

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
    pickupEta: string;
    dropoffEta: string;
  };
}

export interface Candidate {
  rideId: string;
  driverName: string | null;
  driverRating: number;
  originLabel: string | null;
  destLabel: string | null;
  departureTime: string;
  etaPickup: string;
  availableSeats: number;
  pricePerSeat: number | null;
  pickupOffsetM: number;
  dropoffOffsetM: number;
  sharedKm: number;
  score: number;
}

export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  at: number;
}
