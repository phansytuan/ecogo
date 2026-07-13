import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateRatingDto } from './ratings.dto';

@Injectable()
export class RatingsService {
  constructor(private readonly db: DatabaseService) {}

  async create(raterId: string, dto: CreateRatingDto) {
    const b = await this.db.one<{ passenger_id: string; driver_id: string | null }>(
      `SELECT b.passenger_id, r.driver_id
       FROM bookings b LEFT JOIN rides r ON r.id = b.ride_id
       WHERE b.id = $1`,
      [dto.bookingId],
    );
    if (!b) throw new NotFoundException('Booking not found');

    const isPassenger = b.passenger_id === raterId;
    const isDriver = b.driver_id === raterId;
    if (!isPassenger && !isDriver) throw new ForbiddenException('Not a participant');

    const rateeId = isPassenger ? b.driver_id : b.passenger_id;
    if (!rateeId) throw new BadRequestException('No counterpart to rate yet');

    let rating;
    try {
      rating = await this.db.one(
        `INSERT INTO ratings (booking_id, rater_id, ratee_id, score, comment)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, booking_id, ratee_id, score, comment, created_at`,
        [dto.bookingId, raterId, rateeId, dto.score, dto.comment ?? null],
      );
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === '23505') {
        throw new ConflictException('You have already rated this trip');
      }
      throw e;
    }

    // Recompute the ratee's average so it stays in sync.
    await this.db.query(
      `UPDATE users
       SET rating = (SELECT ROUND(AVG(score)::numeric, 2) FROM ratings WHERE ratee_id = $1)
       WHERE id = $1`,
      [rateeId],
    );

    return rating;
  }
}
