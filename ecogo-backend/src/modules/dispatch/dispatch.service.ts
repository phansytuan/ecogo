import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MatchingService } from '../matching/matching.service';
import { AssignmentService } from '../matching/assignment.service';
import { MatchRequestDto } from '../matching/matching.dto';

@Injectable()
export class DispatchService {
  constructor(
    private readonly db: DatabaseService,
    private readonly realtime: RealtimeGateway,
    private readonly matching: MatchingService,
    private readonly assignment: AssignmentService,
  ) {}

  /**
   * The dispatch queue. Includes requests that are received (pending / escalated)
   * AND those a dispatcher has claimed and is actively working ('processing'),
   * so the console can render Received and In-Progress side by side.
   */
  queue() {
    return this.db.query(
      `SELECT b.id, b.passenger_id, u.full_name AS passenger_name,
              u.phone AS passenger_phone,
              b.pickup_label, b.dropoff_label, b.seats, b.status,
              ST_Y(b.pickup) AS p_lat, ST_X(b.pickup) AS p_lng,
              ST_Y(b.dropoff) AS d_lat, ST_X(b.dropoff) AS d_lng,
              b.req_window_start, b.req_window_end, b.claimed_by, b.claimed_at,
              d.full_name AS claimed_by_name, b.created_at,
              EXTRACT(EPOCH FROM (now() - b.created_at))::int AS waiting_s
       FROM bookings b
       JOIN users u ON u.id = b.passenger_id
       LEFT JOIN users d ON d.id = b.claimed_by
       WHERE b.status IN ('pending','no_match','processing')
       ORDER BY b.created_at ASC`,
    );
  }

  /** Candidate rides for a request, using the relaxed profile (wider, no ceiling). */
  async candidates(bookingId: string) {
    const row = await this.db.one<any>(
      `SELECT ST_Y(pickup) AS p_lat, ST_X(pickup) AS p_lng,
              ST_Y(dropoff) AS d_lat, ST_X(dropoff) AS d_lng,
              seats, req_window_start, req_window_end, req_desired_pickup
       FROM bookings WHERE id = $1 AND status IN ('pending','no_match','processing')`,
      [bookingId],
    );
    if (!row) throw new NotFoundException('Request not found or already handled');
    const req: MatchRequestDto = {
      pickup: { lat: row.p_lat, lng: row.p_lng },
      dropoff: { lat: row.d_lat, lng: row.d_lng },
      windowStart: new Date(row.req_window_start).toISOString(),
      windowEnd: new Date(row.req_window_end).toISOString(),
      desiredPickup: row.req_desired_pickup
        ? new Date(row.req_desired_pickup).toISOString()
        : undefined,
      seats: row.seats,
    };
    return this.matching.search(req, 'relaxed');
  }

  /**
   * Atomic claim — prevents two dispatchers grabbing the same request, and moves
   * it to 'processing' so the queue reflects that someone is on it. The
   * auto-matcher only escalates rows still in 'pending', so claiming also stops
   * it from racing the dispatcher.
   */
  async claim(bookingId: string, dispatcherId: string) {
    const claimed = await this.db.one(
      `UPDATE bookings SET claimed_by = $2, claimed_at = now(), status = 'processing'
       WHERE id = $1 AND claimed_by IS NULL AND status IN ('pending','no_match')
       RETURNING id, claimed_by, claimed_at, status`,
      [bookingId, dispatcherId],
    );
    if (!claimed) throw new ConflictException('Request already claimed or handled');
    this.realtime.emitToDispatch('request.processing', claimed);
    return claimed;
  }

  /** Put a claimed request back on the board (dispatcher steps away). */
  async release(bookingId: string, dispatcherId: string) {
    const released = await this.db.one(
      `UPDATE bookings SET claimed_by = NULL, claimed_at = NULL, status = 'pending'
       WHERE id = $1 AND claimed_by = $2 AND status = 'processing'
       RETURNING id, status`,
      [bookingId, dispatcherId],
    );
    if (!released) throw new ConflictException('Not your claim, or already handled');
    this.realtime.emitToDispatch('request.released', released);
    return released;
  }

  /** Manual assignment by a dispatcher. */
  assign(bookingId: string, rideId: string, dispatcherId: string) {
    return this.assignment.assign(bookingId, rideId, 'dispatcher', dispatcherId);
  }

  /**
   * The canonical trip a processed request was assigned to — read from the very
   * same `rides` row the driver's app reads, so what dispatch shows and what the
   * driver was given cannot drift apart. Includes the passenger's own segment
   * (their pickup/dropoff and ETA on that trip), the vehicle, and the driver.
   */
  async tripInfo(bookingId: string) {
    const row = await this.db.one<any>(
      `SELECT b.id AS booking_id, b.status, b.seats, b.fare, b.fp, b.fd,
              b.pickup_label, b.dropoff_label, b.pickup_address, b.dropoff_address,
              b.matched_by, b.dispatched_by,
              COALESCE(
                (SELECT json_agg(json_build_object(
                    'fullName', bp.full_name, 'phone', bp.phone, 'email', bp.email)
                  ORDER BY bp.created_at)
                 FROM booking_passengers bp WHERE bp.booking_id = b.id),
                '[]'::json
              ) AS companions,
              r.id AS ride_id, r.departure_time, r.duration_s, r.distance_m,
              r.origin_label, r.dest_label, r.total_seats, r.available_seats,
              r.status AS ride_status,
              dr.id AS driver_id, dr.full_name AS driver_name, dr.phone AS driver_phone,
              v.plate, v.type AS vehicle_type, v.seats AS vehicle_seats
       FROM bookings b
       JOIN rides r  ON r.id = b.ride_id
       JOIN users dr ON dr.id = r.driver_id
       JOIN vehicles v ON v.id = r.vehicle_id
       WHERE b.id = $1`,
      [bookingId],
    );
    if (!row) throw new NotFoundException('Request has not been assigned to a trip');

    const dep = new Date(row.departure_time).getTime();
    const etaAt = (fraction: number) =>
      new Date(dep + Number(fraction) * row.duration_s * 1000).toISOString();

    return {
      bookingId: row.booking_id,
      status: row.status,
      assignedBy: row.matched_by,
      dispatcherId: row.dispatched_by,
      trip: {
        rideId: row.ride_id,
        status: row.ride_status,
        departureTime: row.departure_time,
        origin: row.origin_label,
        dest: row.dest_label,
        distanceKm: row.distance_m == null ? null : Number(row.distance_m) / 1000,
        totalSeats: row.total_seats,
        availableSeats: row.available_seats,
      },
      driver: {
        id: row.driver_id,
        name: row.driver_name,
        phone: row.driver_phone,
      },
      vehicle: {
        plate: row.plate,
        type: row.vehicle_type,
        seats: row.vehicle_seats,
      },
      segment: {
        pickupLabel: row.pickup_label,
        dropoffLabel: row.dropoff_label,
        pickupAddress: row.pickup_address,
        dropoffAddress: row.dropoff_address,
        companions: row.companions ?? [],
        seats: row.seats,
        fare: row.fare == null ? null : Number(row.fare),
        pickupEta: etaAt(row.fp),
        dropoffEta: etaAt(row.fd),
      },
    };
  }
}
