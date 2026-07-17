import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MatchingQueueProducer } from '../matching-queue/matching.queue';
import { CreateRequestDto } from './requests.dto';

@Injectable()
export class RequestsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly queue: MatchingQueueProducer,
  ) {}

  async create(passengerId: string, dto: CreateRequestDto) {
    const created = await this.db.one<{
      id: string;
      ride_id: null;
      status: 'pending';
      seats: number;
      fare: null;
      matched_by: null;
      created_at: string;
    }>(
      `INSERT INTO bookings
         (passenger_id, pickup, dropoff, pickup_label, dropoff_label,
          pickup_address, dropoff_address, pickup_place_id, dropoff_place_id,
          seats, status, req_window_start, req_window_end, req_desired_pickup)
       VALUES ($1,
               ST_SetSRID(ST_MakePoint($2,$3),4326),
               ST_SetSRID(ST_MakePoint($4,$5),4326),
               $6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,$15)
       RETURNING id, ride_id, status, seats, fare, matched_by, created_at`,
      [
        passengerId,
        dto.pickup.lng,
        dto.pickup.lat,
        dto.dropoff.lng,
        dto.dropoff.lat,
        dto.pickup.label ?? null,
        dto.dropoff.label ?? null,
        dto.pickupAddress ?? null,
        dto.dropoffAddress ?? null,
        dto.pickup.placeId ?? null,
        dto.dropoff.placeId ?? null,
        dto.seats ?? 1,
        dto.windowStart,
        dto.windowEnd,
        dto.desiredPickup ?? null,
      ],
    );
    const bookingId = created!.id;

    // Matching may require many routing-provider calls. Run the first attempt
    // outside the HTTP request; the worker schedules the delayed reattempt and
    // dispatch escalation only when this first attempt finds no ride.
    await this.queue.scheduleFirstMatch(bookingId);

    return created;
  }

  listForPassenger(passengerId: string) {
    return this.db.query(
      `SELECT id, ride_id, status, seats, fare, matched_by, created_at
       FROM bookings WHERE passenger_id = $1 ORDER BY created_at DESC`,
      [passengerId],
    );
  }
}
