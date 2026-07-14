import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

const PLATFORM_FEE_PCT = 0.1; // 10% service fee charged to the driver

@Injectable()
export class TransactionsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Driver completes a booking: records the cash transaction (gross / 10% fee /
   * driver net) and, if the passenger was referred and still within 3 years,
   * writes the affiliate earning to the ledger. All in one transaction.
   */
  async complete(actorId: string, bookingId: string, grossOverride?: number) {
    return this.db.tx(async (client) => {
      const b = (
        await client.query(
          `SELECT b.id, b.passenger_id, b.fare, b.status, r.driver_id,
                  r.status AS ride_status
           FROM bookings b JOIN rides r ON r.id = b.ride_id
           WHERE b.id = $1 FOR UPDATE`,
          [bookingId],
        )
      ).rows[0];
      if (!b) throw new NotFoundException('Booking or its ride not found');
      if (b.driver_id !== actorId) throw new ForbiddenException('Only the driver can complete');
      if (b.ride_status !== 'completed' || b.status !== 'completed') {
        throw new ConflictException('Complete the ride before recording payment');
      }
      const alreadySettled = await client.query(
        `SELECT 1 FROM transactions WHERE booking_id = $1 LIMIT 1`,
        [bookingId],
      );
      if (alreadySettled.rowCount) {
        throw new ConflictException('Payment has already been recorded');
      }

      const gross = grossOverride ?? (b.fare != null ? Number(b.fare) : 0);
      const fee = Math.round(gross * PLATFORM_FEE_PCT);
      const net = gross - fee;

      const tx = (
        await client.query(
          `INSERT INTO transactions (booking_id, gross, platform_fee, driver_net, method)
           VALUES ($1,$2,$3,$4,'cash') RETURNING *`,
          [bookingId, gross, fee, net],
        )
      ).rows[0];
      let affiliate = null;
      const ref = (
        await client.query(
          `SELECT id, pct FROM referrals WHERE referred_user_id = $1 AND now() < expires_at`,
          [b.passenger_id],
        )
      ).rows[0];
      if (ref && gross > 0) {
        const earned = Math.round(gross * Number(ref.pct));
        affiliate = (
          await client.query(
            `INSERT INTO affiliate_earnings (referral_id, booking_id, base_amount, pct, earned)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [ref.id, bookingId, gross, ref.pct, earned],
          )
        ).rows[0];
      }

      return { transaction: tx, affiliate };
    });
  }
}
