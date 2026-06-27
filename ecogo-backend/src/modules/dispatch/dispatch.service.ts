import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MatchingService } from '../matching/matching.service';
import { AssignmentService } from '../matching/assignment.service';
import { MatchRequestDto } from '../matching/matching.dto';

@Injectable()
export class DispatchService {
  constructor(
    private readonly db: DatabaseService,
    private readonly matching: MatchingService,
    private readonly assignment: AssignmentService,
  ) {}

  /** The dispatch queue: requests waiting or escalated, oldest first. */
  queue() {
    return this.db.query(
      `SELECT b.id, b.passenger_id, u.full_name AS passenger_name,
              b.pickup_label, b.dropoff_label, b.seats, b.status,
              ST_Y(b.pickup) AS p_lat, ST_X(b.pickup) AS p_lng,
              ST_Y(b.dropoff) AS d_lat, ST_X(b.dropoff) AS d_lng,
              b.req_window_start, b.req_window_end, b.claimed_by, b.created_at,
              EXTRACT(EPOCH FROM (now() - b.created_at))::int AS waiting_s
       FROM bookings b
       JOIN users u ON u.id = b.passenger_id
       WHERE b.status IN ('pending','no_match')
       ORDER BY b.created_at ASC`,
    );
  }

  /** Candidate rides for a request, using the relaxed profile (wider, no ceiling). */
  async candidates(bookingId: string) {
    const row = await this.db.one<any>(
      `SELECT ST_Y(pickup) AS p_lat, ST_X(pickup) AS p_lng,
              ST_Y(dropoff) AS d_lat, ST_X(dropoff) AS d_lng,
              seats, req_window_start, req_window_end, req_desired_pickup
       FROM bookings WHERE id = $1 AND status IN ('pending','no_match')`,
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

  /** Atomic claim — prevents two dispatchers grabbing the same request. */
  async claim(bookingId: string, dispatcherId: string) {
    const claimed = await this.db.one(
      `UPDATE bookings SET claimed_by = $2, claimed_at = now()
       WHERE id = $1 AND claimed_by IS NULL AND status IN ('pending','no_match')
       RETURNING id, claimed_by, claimed_at`,
      [bookingId, dispatcherId],
    );
    if (!claimed) throw new ConflictException('Request already claimed or handled');
    return claimed;
  }

  /** Manual assignment by a dispatcher. */
  assign(bookingId: string, rideId: string, dispatcherId: string) {
    return this.assignment.assign(bookingId, rideId, 'dispatcher', dispatcherId);
  }
}
