import { ConflictException } from '@nestjs/common';
import { PoolClient } from 'pg';

/** Serialize assignments for one passenger across otherwise independent rides. */
export async function assertPassengerAvailable(
  client: PoolClient,
  passengerId: string,
  rideId: string,
  departureTime: Date | string,
  durationS: number,
  fp: number,
  fd: number,
  excludeBookingId?: string,
): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [passengerId]);

  const duplicate = await client.query(
    `SELECT 1 FROM bookings
     WHERE passenger_id = $1 AND ride_id = $2
       AND status IN ('matched','confirmed','ongoing')
       AND ($3::uuid IS NULL OR id <> $3)
     LIMIT 1`,
    [passengerId, rideId, excludeBookingId ?? null],
  );
  if (duplicate.rowCount) {
    throw new ConflictException('You already have an active booking on this ride');
  }

  const start = new Date(departureTime).getTime() / 1000 + fp * durationS;
  const end = new Date(departureTime).getTime() / 1000 + fd * durationS;
  const overlap = await client.query(
    `SELECT 1
     FROM bookings b JOIN rides r ON r.id = b.ride_id
     WHERE b.passenger_id = $1
       AND b.status IN ('matched','confirmed','ongoing')
       AND ($2::uuid IS NULL OR b.id <> $2)
       AND extract(epoch FROM r.departure_time) + b.fp * r.duration_s < $4
       AND $3 < extract(epoch FROM r.departure_time) + b.fd * r.duration_s
     LIMIT 1`,
    [passengerId, excludeBookingId ?? null, start, end],
  );
  if (overlap.rowCount) {
    throw new ConflictException('This trip overlaps another active booking');
  }
}
