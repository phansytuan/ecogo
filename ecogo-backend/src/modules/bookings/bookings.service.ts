import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { canFit, tightestFreeSeats } from '../matching/segment-capacity';
import { CreateBookingDto } from './bookings.dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly realtime: RealtimeGateway,
    private readonly events: EventEmitter2,
  ) {}

  async create(passengerId: string, dto: CreateBookingDto) {
    const seats = dto.seats ?? 1;
    const { pickup, dropoff } = dto;

    return this.db.tx(async (client) => {
      // Lock the ride and compute fp/fd against its route in one go.
      const rideRes = await client.query(
        `SELECT id, status, available_seats, total_seats, price_per_seat,
                ST_LineLocatePoint(route, ST_SetSRID(ST_MakePoint($2,$3),4326)) AS fp,
                ST_LineLocatePoint(route, ST_SetSRID(ST_MakePoint($4,$5),4326)) AS fd
         FROM rides WHERE id = $1 FOR UPDATE`,
        [dto.rideId, pickup.lng, pickup.lat, dropoff.lng, dropoff.lat],
      );
      const ride = rideRes.rows[0];
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.status !== 'open') throw new ConflictException('Ride is not open');
      if (!(ride.fp < ride.fd)) {
        throw new BadRequestException('Pickup must be before dropoff along the route');
      }

      // Per-segment capacity: a seat is only occupied on the sub-interval [fp, fd).
      const existing = (
        await client.query(
          `SELECT fp, fd, seats FROM bookings
           WHERE ride_id = $1 AND status IN ('matched','confirmed')`,
          [dto.rideId],
        )
      ).rows.map((b: { fp: string; fd: string; seats: number }) => ({
        fp: Number(b.fp),
        fd: Number(b.fd),
        seats: b.seats,
      }));
      const newSeg = { fp: Number(ride.fp), fd: Number(ride.fd), seats };
      if (!canFit(existing, ride.total_seats, newSeg.fp, newSeg.fd, seats)) {
        throw new ConflictException('Not enough seats on this segment');
      }

      const fare = ride.price_per_seat != null ? Number(ride.price_per_seat) * seats : null;

      const bookingRes = await client.query(
        `INSERT INTO bookings
           (ride_id, passenger_id, pickup, dropoff, pickup_label, dropoff_label,
            fp, fd, seats, fare, status, matched_by)
         VALUES ($1,$2,
                 ST_SetSRID(ST_MakePoint($3,$4),4326),
                 ST_SetSRID(ST_MakePoint($5,$6),4326),
                 $7,$8,$9,$10,$11,$12,'matched','auto')
         RETURNING id, ride_id, passenger_id, fp, fd, seats, fare, status, created_at`,
        [
          dto.rideId,
          passengerId,
          pickup.lng,
          pickup.lat,
          dropoff.lng,
          dropoff.lat,
          pickup.label ?? null,
          dropoff.label ?? null,
          ride.fp,
          ride.fd,
          seats,
          fare,
        ],
      );

      const remaining = tightestFreeSeats([...existing, newSeg], ride.total_seats);
      await client.query(
        `UPDATE rides SET available_seats = $2,
                          status = CASE WHEN $2 = 0 THEN 'full' ELSE status END
         WHERE id = $1`,
        [dto.rideId, remaining],
      );

      return bookingRes.rows[0];
    });
  }

  listForPassenger(passengerId: string) {
    return this.db.query(
      `SELECT id, ride_id, seats, fare, status, created_at
       FROM bookings WHERE passenger_id = $1 ORDER BY created_at DESC`,
      [passengerId],
    );
  }

  async confirm(bookingId: string, driverId: string) {
    const row = await this.db.one(
      `UPDATE bookings b SET status = 'confirmed'
       FROM rides r
       WHERE b.id = $1 AND b.ride_id = r.id AND r.driver_id = $2 AND b.status = 'matched'
       RETURNING b.id, b.status`,
      [bookingId, driverId],
    );
    if (!row) {
      throw new NotFoundException('Booking not found, not your ride, or not in matched state');
    }
    return row;
  }

  /**
   * Cancel a booking and return its seat to the segment. Either the passenger
   * (their own booking) or the driver (a booking on their ride) may cancel.
   * Pending ride-requests can be withdrawn by the passenger.
   */
  async cancel(bookingId: string, userId: string) {
    const result = await this.db.tx(async (client) => {
      const res = await client.query(
        `SELECT b.id, b.ride_id, b.passenger_id, b.status, b.fp, b.fd, b.seats,
                r.driver_id, r.total_seats
         FROM bookings b LEFT JOIN rides r ON r.id = b.ride_id
         WHERE b.id = $1 FOR UPDATE`,
        [bookingId],
      );
      const row = res.rows[0];
      if (!row) throw new NotFoundException('Booking not found');

      const isPassenger = row.passenger_id === userId;
      const isDriver = row.driver_id != null && row.driver_id === userId;
      if (!isPassenger && !isDriver) {
        throw new ForbiddenException('Not allowed to cancel this booking');
      }

      const base = {
        id: bookingId,
        status: 'cancelled',
        rideId: row.ride_id as string | null,
        passengerId: row.passenger_id as string,
        driverId: row.driver_id as string | null,
        by: isDriver ? 'driver' : 'passenger',
      };

      // A still-pending ride request: only the passenger withdraws it.
      if (row.status === 'pending' || row.status === 'no_match') {
        if (!isPassenger) throw new ForbiddenException('Only the passenger can withdraw a request');
        await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [bookingId]);
        return base;
      }

      if (row.status !== 'matched' && row.status !== 'confirmed') {
        throw new ConflictException('Booking cannot be cancelled in its current state');
      }

      await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [bookingId]);

      // Recompute availability from the remaining active bookings and reopen if needed.
      const remaining = (
        await client.query(
          `SELECT fp, fd, seats FROM bookings
           WHERE ride_id = $1 AND status IN ('matched','confirmed')`,
          [row.ride_id],
        )
      ).rows.map((b: { fp: string; fd: string; seats: number }) => ({
        fp: Number(b.fp),
        fd: Number(b.fd),
        seats: b.seats,
      }));
      const free = tightestFreeSeats(remaining, row.total_seats);
      await client.query(
        `UPDATE rides SET available_seats = $2,
                          status = CASE WHEN status = 'full' AND $2 > 0 THEN 'open' ELSE status END
         WHERE id = $1`,
        [row.ride_id, free],
      );
      return base;
    });

    if (result.rideId) {
      this.realtime.emitToRide(result.rideId, 'booking.cancelled', result);
    }
    this.realtime.emitToDispatch('booking.cancelled', result);
    this.events.emit('booking.cancelled', result);
    return result;
  }
}
