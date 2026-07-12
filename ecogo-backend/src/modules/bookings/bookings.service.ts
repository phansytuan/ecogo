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
import { quoteFare } from '../pricing/pricing';
import { validateManifest } from './manifest';
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
    // Multi-seat bookings must name the additional travellers.
    const manifest = validateManifest(seats, dto.companions ?? []);
    if (!manifest.ok) throw new BadRequestException(manifest.message);

    const { pickup, dropoff } = dto;

    return this.db.tx(async (client) => {
      // Lock the ride and compute fp/fd against its route in one go.
      const rideRes = await client.query(
        `SELECT id, status, available_seats, total_seats, price_per_seat, distance_m,
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

      // Fare = bracket price for the passenger's own segment distance x seats.
      const segKm =
        (Number(ride.fd) - Number(ride.fp)) *
        (ride.distance_m != null ? Number(ride.distance_m) / 1000 : 0);
      const fare =
        ride.distance_m != null
          ? quoteFare(segKm) * seats
          : ride.price_per_seat != null
            ? Number(ride.price_per_seat) * seats
            : null;

      const bookingRes = await client.query(
        `INSERT INTO bookings
           (ride_id, passenger_id, pickup, dropoff, pickup_label, dropoff_label,
            pickup_address, dropoff_address, fp, fd, seats, fare, status, matched_by)
         VALUES ($1,$2,
                 ST_SetSRID(ST_MakePoint($3,$4),4326),
                 ST_SetSRID(ST_MakePoint($5,$6),4326),
                 $7,$8,$9,$10,$11,$12,$13,$14,'matched','auto')
         RETURNING id, ride_id, passenger_id, fp, fd, seats, fare, status,
                   pickup_address, dropoff_address, created_at`,
        [
          dto.rideId,
          passengerId,
          pickup.lng,
          pickup.lat,
          dropoff.lng,
          dropoff.lat,
          pickup.label ?? null,
          dropoff.label ?? null,
          dto.pickupAddress ?? null,
          dto.dropoffAddress ?? null,
          ride.fp,
          ride.fd,
          seats,
          fare,
        ],
      );
      const booking = bookingRes.rows[0];

      // Companion manifest — same transaction, so a booking never exists with a
      // half-written passenger list.
      const companions = dto.companions ?? [];
      for (const c of companions) {
        await client.query(
          `INSERT INTO booking_passengers (booking_id, full_name, phone, email)
           VALUES ($1,$2,$3,$4)`,
          [booking.id, c.fullName.trim(), c.phone.trim(), c.email?.trim() || null],
        );
      }

      // Specific seat selection (optional). If the passenger picked seats, they
      // must exactly match the seat count, be currently free, and get claimed.
      // Locked seats (driver's offline reservations) are never 'free', so they
      // can't be booked online.
      const seatIds = dto.seatIds ?? [];
      if (seatIds.length > 0) {
        if (seatIds.length !== seats) {
          throw new BadRequestException(
            `Select exactly ${seats} seat(s) to match the booking`,
          );
        }
        for (const seatId of seatIds) {
          const r = await client.query(
            `UPDATE ride_seats SET status = 'booked', booking_id = $3, updated_at = now()
             WHERE ride_id = $1 AND seat_id = $2 AND status = 'free'
             RETURNING seat_id`,
            [dto.rideId, seatId, booking.id],
          );
          if (r.rowCount === 0) {
            throw new ConflictException(`Seat ${seatId} is no longer available`);
          }
        }
        await client.query(`UPDATE bookings SET seat_ids = $2 WHERE id = $1`, [
          booking.id,
          seatIds,
        ]);
        booking.seat_ids = seatIds;
      }

      // available_seats reflects the seat map when a ride has one; otherwise the
      // segment-capacity remaining count.
      const hasSeatMap =
        (
          await client.query(`SELECT 1 FROM ride_seats WHERE ride_id = $1 LIMIT 1`, [
            dto.rideId,
          ])
        ).rowCount! > 0;
      if (hasSeatMap) {
        await client.query(
          `UPDATE rides SET available_seats =
             (SELECT count(*) FROM ride_seats WHERE ride_id = $1 AND status = 'free'),
             status = CASE WHEN (SELECT count(*) FROM ride_seats WHERE ride_id = $1 AND status = 'free') = 0
                           THEN 'full' ELSE status END
           WHERE id = $1`,
          [dto.rideId],
        );
      } else {
        const remaining = tightestFreeSeats([...existing, newSeg], ride.total_seats);
        await client.query(
          `UPDATE rides SET available_seats = $2,
                            status = CASE WHEN $2 = 0 THEN 'full' ELSE status END
           WHERE id = $1`,
          [dto.rideId, remaining],
        );
      }
      this.realtime.emitToRide(dto.rideId, 'seatmap.updated', { rideId: dto.rideId });

      return { ...booking, companions };
    });
  }

  listForPassenger(passengerId: string) {
    return this.db.query(
      `SELECT b.id, b.ride_id, b.seats, b.fare, b.status,
              b.pickup_label, b.dropoff_label, b.pickup_address, b.dropoff_address,
              ST_Y(b.pickup) AS pickup_lat, ST_X(b.pickup) AS pickup_lng,
              ST_Y(b.dropoff) AS dropoff_lat, ST_X(b.dropoff) AS dropoff_lng,
              b.created_at,
              r.origin_label, r.dest_label, r.departure_time, r.status AS ride_status,
              dr.full_name AS driver_name, dr.phone AS driver_phone,
              (SELECT score FROM ratings ra
                WHERE ra.booking_id = b.id AND ra.rater_id = $1) AS my_rating
       FROM bookings b
       LEFT JOIN rides r  ON r.id = b.ride_id
       LEFT JOIN users dr ON dr.id = r.driver_id
       WHERE b.passenger_id = $1
         AND b.status <> 'cancelled'
       ORDER BY b.created_at DESC`,
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

      // Release any specific seats this booking held.
      await client.query(
        `UPDATE ride_seats SET status = 'free', booking_id = NULL, updated_at = now()
         WHERE ride_id = $1 AND booking_id = $2`,
        [row.ride_id, bookingId],
      );

      // If this ride uses a seat map, availability is the free-seat count;
      // otherwise fall back to per-segment capacity.
      const hasSeatMap =
        (
          await client.query(`SELECT 1 FROM ride_seats WHERE ride_id = $1 LIMIT 1`, [
            row.ride_id,
          ])
        ).rowCount! > 0;
      if (hasSeatMap) {
        await client.query(
          `UPDATE rides SET available_seats =
             (SELECT count(*) FROM ride_seats WHERE ride_id = $1 AND status = 'free'),
             status = CASE WHEN status = 'full'
                            AND (SELECT count(*) FROM ride_seats WHERE ride_id = $1 AND status = 'free') > 0
                           THEN 'open' ELSE status END
           WHERE id = $1`,
          [row.ride_id],
        );
        this.realtime.emitToRide(row.ride_id, 'seatmap.updated', { rideId: row.ride_id });
        return base;
      }

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
