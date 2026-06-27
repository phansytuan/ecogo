import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class ReferralsService {
  constructor(private readonly db: DatabaseService) {}

  /** A driver refers a customer. One referrer per customer (UNIQUE constraint). */
  create(driverId: string, referredUserId: string) {
    return this.db.one(
      `INSERT INTO referrals (driver_id, referred_user_id)
       VALUES ($1,$2)
       ON CONFLICT (referred_user_id) DO NOTHING
       RETURNING id, driver_id, referred_user_id, pct, expires_at`,
      [driverId, referredUserId],
    );
  }
}
