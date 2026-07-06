import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MatchingService } from './matching.service';
import { canFit, tightestFreeSeats } from './segment-capacity';
import { MatchRequestDto } from './matching.dto';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly matching: MatchingService,
    private readonly realtime: RealtimeGateway,
    private readonly events: EventEmitter2,
  ) {}

  /** Build a match request from a stored pending booking ("ride request"). */
  private async loadRequest(bookingId: string): Promise<MatchRequestDto | null> {
    const row = await this.db.one<any>(
      `SELECT ST_Y(pickup) AS p_lat, ST_X(pickup) AS p_lng,
              ST_Y(dropoff) AS d_lat, ST_X(dropoff) AS d_lng,
              seats, req_window_start, req_window_end, req_desired_pickup, status
       FROM bookings WHERE id = $1`,
      [bookingId],
    );
    if (!row || row.status !== 'pending') return null;
    return {
      pickup: { lat: row.p_lat, lng: row.p_lng },
      dropoff: { lat: row.d_lat, lng: row.d_lng },
      windowStart: new Date(row.req_window_start).toISOString(),
      windowEnd: new Date(row.req_window_end).toISOString(),
      desiredPickup: row.req_desired_pickup
        ? new Date(row.req_desired_pickup).toISOString()
        : undefined,
      seats: row.seats,
    };
  }

  /** Attempt automatic (strict) matching for a pending request. Returns true if assigned. */
  async tryAutoMatch(bookingId: string): Promise<boolean> {
    const req = await this.loadRequest(bookingId);
    if (!req) return false; // already matched/cancelled/no_match
    const candidates = await this.matching.search(req, 'strict');
    if (candidates.length === 0) return false;
    await this.assign(bookingId, candidates[0].rideId, 'auto');
    return true;
  }

  /** Assign a request to a specific ride (manual dispatch or auto best-pick). */
  async assign(
    bookingId: string,
    rideId: string,
    by: 'auto' | 'dispatcher',
    dispatcherId?: string,
  ) {
    let driverId: string | undefined;
    const result = await this.db.tx(async (client) => {
      const rideRes = await client.query(
        `SELECT id, status, available_seats, total_seats, driver_id FROM rides WHERE id = $1 FOR UPDATE`,
        [rideId],
      );
      const ride = rideRes.rows[0];
      driverId = ride?.driver_id;
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.status !== 'open') throw new ConflictException('Ride is not open');

      const locRes = await client.query(
        `SELECT b.seats,
                ST_LineLocatePoint(r.route, b.pickup)  AS fp,
                ST_LineLocatePoint(r.route, b.dropoff) AS fd,
                r.price_per_seat
         FROM rides r, bookings b WHERE r.id = $1 AND b.id = $2`,
        [rideId, bookingId],
      );
      const loc = locRes.rows[0];
      if (!loc) throw new NotFoundException('Booking or ride missing');
      if (!(loc.fp < loc.fd)) {
        throw new BadRequestException('Pickup must be before dropoff along the route');
      }

      // Per-segment capacity check against other active bookings on this ride.
      const existing = (
        await client.query(
          `SELECT fp, fd, seats FROM bookings
           WHERE ride_id = $1 AND status IN ('matched','confirmed')`,
          [rideId],
        )
      ).rows.map((b: { fp: string; fd: string; seats: number }) => ({
        fp: Number(b.fp),
        fd: Number(b.fd),
        seats: b.seats,
      }));
      const newSeg = { fp: Number(loc.fp), fd: Number(loc.fd), seats: loc.seats };
      if (!canFit(existing, ride.total_seats, newSeg.fp, newSeg.fd, loc.seats)) {
        throw new ConflictException('Not enough seats on this segment');
      }

      const fare = loc.price_per_seat != null ? Number(loc.price_per_seat) * loc.seats : null;
      const bookingRes = await client.query(
        `UPDATE bookings
         SET ride_id = $2, fp = $3, fd = $4, fare = $5,
             status = 'matched', matched_by = $6, dispatched_by = $7
         WHERE id = $1 AND status IN ('pending','no_match')
         RETURNING id, ride_id, passenger_id, seats, fare, status, matched_by`,
        [bookingId, rideId, loc.fp, loc.fd, fare, by, dispatcherId ?? null],
      );
      if (bookingRes.rows.length === 0) {
        throw new ConflictException('Request is no longer pending');
      }

      const remaining = tightestFreeSeats([...existing, newSeg], ride.total_seats);
      await client.query(
        `UPDATE rides SET available_seats = $2,
                          status = CASE WHEN $2 = 0 THEN 'full' ELSE status END
         WHERE id = $1`,
        [rideId, remaining],
      );
      return bookingRes.rows[0];
    });

    this.realtime.emitToRide(rideId, 'booking.matched', result);
    this.realtime.emitToDispatch('booking.matched', result);
    this.events.emit('booking.matched', {
      bookingId,
      rideId,
      passengerId: result.passenger_id,
      driverId,
      by,
    });
    return result;
  }

  /** Mark a request unmatchable and surface it to dispatch (only if still pending). */
  async markNoMatch(bookingId: string) {
    const updated = await this.db.one(
      `UPDATE bookings SET status = 'no_match'
       WHERE id = $1 AND status = 'pending'
       RETURNING id, passenger_id, seats, created_at`,
      [bookingId],
    );
    if (updated) {
      this.logger.warn(`Request ${bookingId} escalated to dispatch (no_match)`);
      this.realtime.emitToDispatch('request.no_match', updated);
    }
    return updated;
  }
}
