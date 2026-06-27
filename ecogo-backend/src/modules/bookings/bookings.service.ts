import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateBookingDto } from './bookings.dto';

@Injectable()
export class BookingsService {
  constructor(private readonly db: DatabaseService) {}

  async create(passengerId: string, dto: CreateBookingDto) {
    const seats = dto.seats ?? 1;
    const { pickup, dropoff } = dto;

    return this.db.tx(async (client) => {
      // Lock the ride and compute fp/fd against its route in one go.
      const rideRes = await client.query(
        `SELECT id, status, available_seats, price_per_seat,
                ST_LineLocatePoint(route, ST_SetSRID(ST_MakePoint($2,$3),4326)) AS fp,
                ST_LineLocatePoint(route, ST_SetSRID(ST_MakePoint($4,$5),4326)) AS fd
         FROM rides WHERE id = $1 FOR UPDATE`,
        [dto.rideId, pickup.lng, pickup.lat, dropoff.lng, dropoff.lat],
      );
      const ride = rideRes.rows[0];
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.status !== 'open') throw new ConflictException('Ride is not open');
      if (ride.available_seats < seats) throw new ConflictException('Not enough seats');
      if (!(ride.fp < ride.fd)) {
        throw new BadRequestException('Pickup must be before dropoff along the route');
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

      const remaining = ride.available_seats - seats;
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
}
