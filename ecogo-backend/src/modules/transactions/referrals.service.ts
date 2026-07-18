import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';

interface ReferralTarget {
  id: string;
  created_at: string | Date;
  booking_count: number;
}

interface ReferralRow {
  id: string;
  driver_id: string;
  referred_user_id: string;
  pct: string | number;
  status: string;
  expires_at: string | Date;
}

@Injectable()
export class ReferralsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  async claim(
    claimer: { id: string; roles: string[] },
    referredUserId: string,
  ) {
    if (!claimer.roles.includes('driver')) {
      throw new ForbiddenException('Only drivers can claim referrals');
    }
    if (referredUserId === claimer.id) {
      throw new BadRequestException('You cannot refer yourself');
    }

    const target = await this.db.one<ReferralTarget>(
      `SELECT
         id,
         created_at,
         (SELECT count(*)::int
            FROM bookings b
           WHERE b.passenger_id = users.id) AS booking_count
       FROM users
       WHERE id = $1`,
      [referredUserId],
    );
    if (!target) throw new NotFoundException('User not found');

    const windowDays =
      this.config.get<number>('referrals.claimWindowDays') ?? 14;
    const accountAgeMs =
      Date.now() - new Date(target.created_at).getTime();
    if (accountAgeMs > windowDays * 86_400_000) {
      throw new ConflictException(
        'This user is outside the referral claim window',
      );
    }
    if (Number(target.booking_count) > 0) {
      throw new ConflictException(
        'This user already has booking history and cannot be claimed',
      );
    }

    const referral = await this.db.one<ReferralRow>(
      `INSERT INTO referrals
         (driver_id, referred_user_id, status)
       VALUES ($1, $2, 'pending_confirmation')
       ON CONFLICT (referred_user_id) DO NOTHING
       RETURNING id, driver_id, referred_user_id, pct, status, expires_at`,
      [claimer.id, referredUserId],
    );
    if (!referral) {
      throw new ConflictException('User already has a referrer');
    }

    await this.db.query(
      `INSERT INTO audit_log
         (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'user', $3, $4::jsonb)`,
      [
        claimer.id,
        'referral.claimed',
        referredUserId,
        JSON.stringify({ referralId: referral.id }),
      ],
    );
    this.events.emit('referral.claimed', {
      referralId: referral.id,
      driverId: claimer.id,
      referredUserId,
    });
    return referral;
  }

  async respond(referredUserId: string, accept: boolean) {
    const status = accept ? 'confirmed' : 'rejected';
    const referral = await this.db.one<{
      id: string;
      driver_id: string;
      status: string;
    }>(
      `UPDATE referrals
       SET status = $2,
           confirmed_at = CASE
             WHEN $2 = 'confirmed' THEN now()
             ELSE confirmed_at
           END
       WHERE referred_user_id = $1
         AND status = 'pending_confirmation'
       RETURNING id, driver_id, status`,
      [referredUserId, status],
    );
    if (!referral) {
      throw new NotFoundException('No pending referral to respond to');
    }

    await this.db.query(
      `INSERT INTO audit_log
         (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'user', $3, $4::jsonb)`,
      [
        referredUserId,
        `referral.${accept ? 'confirmed' : 'rejected'}`,
        referredUserId,
        JSON.stringify({
          referralId: referral.id,
          driverId: referral.driver_id,
        }),
      ],
    );
    return referral;
  }
}
