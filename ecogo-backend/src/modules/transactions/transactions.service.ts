import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const PLATFORM_FEE_PCT = 0.1; // 10% service fee charged to the driver

@Injectable()
export class TransactionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Driver records payment using the booking's snapshotted fare. Any later
   * correction must go through an audited dispatcher/admin adjustment.
   */
  async complete(actorId: string, bookingId: string) {
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

      const gross = b.fare != null ? Number(b.fare) : 0;
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

  async adjustGross(
    actorId: string,
    bookingId: string,
    newGross: number,
    reason: string,
  ) {
    return this.db.tx(async (client) => {
      const existing = (
        await client.query<{ id: string; gross: string | number }>(
          `SELECT id, gross FROM transactions
           WHERE booking_id = $1 FOR UPDATE`,
          [bookingId],
        )
      ).rows[0];
      if (!existing) {
        throw new NotFoundException('No recorded payment for this booking');
      }

      const fee = Math.round(newGross * PLATFORM_FEE_PCT);
      const net = newGross - fee;
      const transaction = (
        await client.query(
          `UPDATE transactions
           SET gross = $2, platform_fee = $3, driver_net = $4
           WHERE booking_id = $1
           RETURNING *`,
          [bookingId, newGross, fee, net],
        )
      ).rows[0];

      const affiliateResult = await client.query(
        `UPDATE affiliate_earnings
         SET base_amount = $2,
             earned = ROUND(($2::numeric * pct))::numeric(12,0)
         WHERE booking_id = $1
           AND payout_status = 'pending'
         RETURNING id`,
        [bookingId, newGross],
      );
      const affiliateAdjusted = affiliateResult.rows.length > 0;

      await client.query(
        `INSERT INTO audit_log
           (actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'booking', $3, $4::jsonb)`,
        [
          actorId,
          'transaction.gross.adjusted',
          bookingId,
          JSON.stringify({
            oldGross: Number(existing.gross),
            newGross,
            reason,
            affiliateAdjusted,
          }),
        ],
      );

      return { transaction, affiliateAdjusted };
    });
  }

  async requestAdjustment(
    driverId: string,
    bookingId: string,
    proposedGross: number,
    reason: string,
  ) {
    const booking = await this.db.one<{
      id: string;
      driver_id: string;
      current_gross: string | number | null;
      fare: string | number | null;
    }>(
      `SELECT b.id, r.driver_id, t.gross AS current_gross, b.fare
       FROM bookings b
       JOIN rides r ON r.id = b.ride_id
       LEFT JOIN transactions t ON t.booking_id = b.id
       WHERE b.id = $1`,
      [bookingId],
    );
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.driver_id !== driverId) {
      throw new ForbiddenException(
        'Only the driver of this booking can request an adjustment',
      );
    }

    const currentGross = Number(booking.current_gross ?? booking.fare ?? 0);
    await this.db.query(
      `INSERT INTO audit_log
         (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'booking', $3, $4::jsonb)`,
      [
        driverId,
        'transaction.adjustment.requested',
        bookingId,
        JSON.stringify({ proposedGross, reason, currentGross }),
      ],
    );

    this.realtime.emitToDispatch('transaction.adjustment.requested', {
      bookingId,
      driverId,
      proposedGross,
      reason,
    });
    return { requested: true };
  }
}
