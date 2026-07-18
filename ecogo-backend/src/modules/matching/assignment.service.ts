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
import {
  effectiveCapacity,
  lockedSeatCount,
  recomputeRideAvailability,
} from './availability';
import { canFit } from './segment-capacity';
import { MatchRequestDto } from './matching.dto';
import { assertPassengerAvailable } from '../bookings/passenger-availability';
import { DetourService } from './detour.service';
import { fareForDistanceM } from '../pricing/pricing';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly matching: MatchingService,
    private readonly realtime: RealtimeGateway,
    private readonly events: EventEmitter2,
    private readonly detour: DetourService,
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
    for (const candidate of candidates) {
      try {
        await this.assign(bookingId, candidate.rideId, 'auto');
        return true;
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    return false;
  }

  /**
   * Assign a request to a specific ride (manual dispatch or auto best-pick).
   *
   * Road-distance work (routing-provider calls for the passenger fare and the
   * detour revalidation) runs BEFORE the ride lock so no HTTP happens inside
   * the transaction; the transaction then verifies the ride's active stop set
   * is unchanged since evaluation and aborts with 409 if another booking
   * landed in between — callers (auto-match loop, dispatcher) simply retry.
   */
  async assign(
    bookingId: string,
    rideId: string,
    by: 'auto' | 'dispatcher',
    dispatcherId?: string,
  ) {
    const pts = await this.db.one<{
      p_lat: number;
      p_lng: number;
      d_lat: number;
      d_lng: number;
    }>(
      `SELECT ST_Y(pickup) AS p_lat, ST_X(pickup) AS p_lng,
              ST_Y(dropoff) AS d_lat, ST_X(dropoff) AS d_lng
       FROM bookings WHERE id = $1`,
      [bookingId],
    );
    if (!pts) throw new NotFoundException('Booking not found');
    const pickup = { lat: pts.p_lat, lng: pts.p_lng };
    const dropoff = { lat: pts.d_lat, lng: pts.d_lng };

    const paxRoute = await this.detour.passengerRoute(pickup, dropoff);
    if (!paxRoute) {
      throw new ConflictException('Could not route the passenger pickup to dropoff');
    }
    const seatFare = fareForDistanceM(paxRoute.distanceM);

    const evalRes = await this.detour.evaluateForRide(rideId, pickup, dropoff);
    if (!evalRes) throw new NotFoundException('Ride not found');
    const { ctx, result } = evalRes;
    if (!result.ok) {
      throw new ConflictException(`Ride cannot be routed with this passenger (${result.reason})`);
    }
    // Auto-matching must respect the max-detour rule; a dispatcher may
    // knowingly override it (the relaxed search already showed them why).
    if (!result.eligible && by === 'auto') {
      throw new ConflictException(
        `Detour ${(result.metrics.detourM / 1000).toFixed(1)} km exceeds the ` +
          `${Math.round(result.maxDetourRatio * 100)}% limit`,
      );
    }
    if (!result.eligible && by === 'dispatcher') {
      this.logger.warn(
        `Dispatcher override: booking ${bookingId} on ride ${rideId} with detour ` +
          `${result.metrics.detourM}m (> ${Math.round(result.maxDetourRatio * 100)}%)`,
      );
    }
    const metrics = result.metrics;

    let driverId: string | undefined;
    const outcome = await this.db.tx(async (client) => {
      const rideRes = await client.query(
        `SELECT id, status, available_seats, total_seats, driver_id,
                departure_time, duration_s
         FROM rides WHERE id = $1 FOR UPDATE`,
        [rideId],
      );
      const ride = rideRes.rows[0];
      driverId = ride?.driver_id;
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.status !== 'open') throw new ConflictException('Ride is not open');
      if (new Date(ride.departure_time) <= new Date()) {
        throw new ConflictException('Ride has already departed');
      }

      const locRes = await client.query(
        `SELECT b.seats, b.passenger_id, b.status,
                ST_LineLocatePoint(r.route, b.pickup)  AS fp,
                ST_LineLocatePoint(r.route, b.dropoff) AS fd,
                r.price_per_seat
         FROM rides r, bookings b WHERE r.id = $1 AND b.id = $2
         FOR UPDATE OF b`,
        [rideId, bookingId],
      );
      const loc = locRes.rows[0];
      if (!loc) throw new NotFoundException('Booking or ride missing');
      if (!['pending', 'no_match', 'processing'].includes(loc.status)) {
        throw new ConflictException('Request is no longer awaiting assignment');
      }
      if (!(loc.fp < loc.fd)) {
        throw new BadRequestException('Pickup must be before dropoff along the route');
      }

      // Per-segment capacity check against other active bookings on this ride.
      const existing = (
        await client.query(
          `SELECT id, fp, fd, seats FROM bookings
           WHERE ride_id = $1 AND status IN ('matched','confirmed','ongoing')`,
          [rideId],
        )
      ).rows as { id: string; fp: string; fd: string; seats: number }[];

      // Revalidate the detour evaluation: if the stop set changed since we
      // routed it (a concurrent booking), the metrics are stale — abort.
      const activeNow = existing.map((b) => b.id).sort();
      if (JSON.stringify(activeNow) !== JSON.stringify(ctx.activeBookingIds)) {
        throw new ConflictException('Ride stops changed during matching — please retry');
      }

      const segs = existing.map((b) => ({ fp: Number(b.fp), fd: Number(b.fd), seats: b.seats }));
      const newSeg = { fp: Number(loc.fp), fd: Number(loc.fd), seats: loc.seats };
      await assertPassengerAvailable(
        client, loc.passenger_id, rideId, ride.departure_time,
        ride.duration_s, newSeg.fp, newSeg.fd, bookingId,
      );
      const lockedSeats = await lockedSeatCount(client, rideId);
      if (
        !canFit(
          segs,
          effectiveCapacity(ride.total_seats, lockedSeats),
          newSeg.fp,
          newSeg.fd,
          loc.seats,
        )
      ) {
        throw new ConflictException('Not enough seats on this segment');
      }

      // Fare basis: the passenger's own road distance x bracket rate — never
      // the driver's detour. Snapshot every input so later pricing changes
      // don't rewrite history.
      const fare = seatFare.farePerSeat * loc.seats;
      const bookingRes = await client.query(
        `UPDATE bookings
         SET ride_id = $2, fp = $3, fd = $4, fare = $5,
             status = 'matched', matched_by = $6, dispatched_by = $7,
             route_distance_m = $8, fare_per_seat = $9, fare_rate_per_km = $10,
             original_route_m = $11, matched_route_m = $12, detour_m = $13,
             detour_pct = $14, pickup_insert_idx = $15, dropoff_insert_idx = $16,
             extra_duration_s = $17
         WHERE id = $1 AND status IN ('pending','no_match','processing')
         RETURNING id, ride_id, passenger_id, seats, fare, status, matched_by,
                   route_distance_m, detour_m, detour_pct`,
        [
          bookingId,
          rideId,
          loc.fp,
          loc.fd,
          fare,
          by,
          dispatcherId ?? null,
          seatFare.distanceM,
          seatFare.farePerSeat,
          seatFare.ratePerKm,
          metrics.originalRemainingM,
          metrics.matchedRouteM,
          metrics.detourM,
          metrics.detourPct,
          metrics.pickupInsertIdx,
          metrics.dropoffInsertIdx,
          metrics.extraDurationS,
        ],
      );
      if (bookingRes.rows.length === 0) {
        throw new ConflictException('Request is no longer awaiting assignment');
      }

      await recomputeRideAvailability(client, rideId);
      return bookingRes.rows[0];
    });

    this.realtime.emitToRide(rideId, 'booking.matched', outcome);
    this.realtime.emitToDispatch('booking.matched', outcome);
    this.events.emit('booking.matched', {
      bookingId,
      rideId,
      passengerId: outcome.passenger_id,
      driverId,
      by,
    });
    return outcome;
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
