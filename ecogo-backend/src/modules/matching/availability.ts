import type { PoolClient } from 'pg';
import { tightestFreeSeats } from './segment-capacity';

export async function lockedSeatCount(
  client: PoolClient,
  rideId: string,
): Promise<number> {
  const result = await client.query<{ locked: number }>(
    `SELECT count(*)::int AS locked
     FROM ride_seats WHERE ride_id = $1 AND status = 'locked'`,
    [rideId],
  );
  return Number(result.rows[0]?.locked ?? 0);
}

export function effectiveCapacity(totalSeats: number, locked: number): number {
  return Math.max(0, totalSeats - locked);
}

/**
 * Single source of truth for ride availability: segment capacity minus seats
 * locked by the driver. Only open/full statuses are allowed to flip.
 */
export async function recomputeRideAvailability(
  client: PoolClient,
  rideId: string,
): Promise<number> {
  const ride = (
    await client.query<{ total_seats: number }>(
      `SELECT total_seats FROM rides WHERE id = $1`,
      [rideId],
    )
  ).rows[0];
  if (!ride) return 0;

  const locked = await lockedSeatCount(client, rideId);
  const segments = (
    await client.query<{ fp: number; fd: number; seats: number }>(
      `SELECT fp, fd, seats FROM bookings
       WHERE ride_id = $1
         AND status IN ('matched','confirmed','ongoing')`,
      [rideId],
    )
  ).rows.map((row) => ({
    fp: Number(row.fp),
    fd: Number(row.fd),
    seats: Number(row.seats),
  }));
  const free = tightestFreeSeats(
    segments,
    effectiveCapacity(Number(ride.total_seats), locked),
  );

  await client.query(
    `UPDATE rides
     SET available_seats = $2,
         status = CASE
           WHEN $2 = 0 AND status = 'open' THEN 'full'
           WHEN $2 > 0 AND status = 'full' THEN 'open'
           ELSE status
         END
     WHERE id = $1`,
    [rideId, free],
  );
  return free;
}
