export interface QueueItem {
  id: string;
  passenger_id: string;
  passenger_name: string | null;
  pickup_label: string | null;
  dropoff_label: string | null;
  p_lat: number;
  p_lng: number;
  d_lat: number;
  d_lng: number;
  seats: number;
  status: 'pending' | 'no_match';
  claimed_by: string | null;
  waiting_s: number;
  created_at: string;
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
