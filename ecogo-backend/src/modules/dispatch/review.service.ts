import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

type ReviewOutcome = 'completed' | 'cancelled';

interface RideRow {
  id: string;
  driver_id: string;
  status: string;
}

interface BookingRow {
  id: string;
  passenger_id: string;
}

@Injectable()
export class DispatchReviewService {
  constructor(
    private readonly db: DatabaseService,
    private readonly realtime: RealtimeGateway,
    private readonly events: EventEmitter2,
  ) {}

  listReviews() {
    // DatabaseService.query resolves to the row array itself.
    return this.db.query(
      `SELECT
         r.id,
         r.driver_id,
         u.full_name AS driver_name,
         u.phone AS driver_phone,
         r.origin_label,
         r.dest_label,
         r.departure_time,
         r.duration_s,
         (SELECT COUNT(*)
            FROM bookings b
           WHERE b.ride_id = r.id
             AND b.status IN ('matched','confirmed','ongoing'))::int AS active_bookings,
         (SELECT COALESCE(SUM(b.seats), 0)
            FROM bookings b
           WHERE b.ride_id = r.id
             AND b.status IN ('matched','confirmed','ongoing'))::int AS total_seats,
         (SELECT COALESCE(SUM(b.fare), 0)
            FROM bookings b
           WHERE b.ride_id = r.id
             AND b.status IN ('matched','confirmed','ongoing'))::float8 AS total_fare
       FROM rides r
       JOIN users u ON u.id = r.driver_id
       WHERE r.status = 'requires_review'
       ORDER BY r.departure_time ASC`,
    );
  }

  async resolve(
    rideId: string,
    dispatcherId: string,
    outcome: ReviewOutcome,
    reason: string,
  ) {
    const payload = await this.db.tx(async (client) => {
      const rideResult = await client.query<RideRow>(
        `SELECT id, driver_id, status FROM rides WHERE id = $1 FOR UPDATE`,
        [rideId],
      );
      const ride = rideResult.rows[0];
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.status !== 'requires_review') {
        throw new ConflictException('Ride is not awaiting review');
      }

      const bookingsResult = await client.query<BookingRow>(
        `UPDATE bookings SET status = $2
         WHERE ride_id = $1
           AND status IN ('matched','confirmed','ongoing')
         RETURNING id, passenger_id`,
        [rideId, outcome],
      );

      if (outcome === 'completed') {
        await client.query(
          `UPDATE rides SET status = 'completed', completed_at = now()
           WHERE id = $1`,
          [rideId],
        );
      } else {
        await client.query(
          `UPDATE rides SET status = 'cancelled', available_seats = 0
           WHERE id = $1`,
          [rideId],
        );
      }

      const bookings = bookingsResult.rows.map((booking) => ({
        id: booking.id,
        passengerId: booking.passenger_id,
      }));
      const bookingIds = bookings.map((booking) => booking.id);
      await client.query(
        `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'ride', $3, $4::jsonb)`,
        [
          dispatcherId,
          'ride.review.resolved',
          rideId,
          JSON.stringify({ outcome, reason, bookingIds }),
        ],
      );

      return {
        rideId,
        driverId: ride.driver_id,
        status: outcome,
        bookings,
      };
    });

    const event = outcome === 'completed' ? 'ride.completed' : 'ride.cancelled';
    this.realtime.emitToRide(rideId, event, payload);
    this.realtime.emitToDispatch(event, payload);
    this.realtime.emitToDispatch('ride.review.resolved', { rideId, outcome });
    this.events.emit(event, payload);
    return payload;
  }
}
