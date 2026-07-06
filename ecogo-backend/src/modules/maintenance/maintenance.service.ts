import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service';

export interface CleanupResult {
  expiredRides: number;
  cancelledRequests: number;
}

/**
 * Periodic housekeeping so stale rows don't linger:
 *  - open rides past departure (+grace) that nobody booked  -> 'expired'
 *  - ride-requests whose match window has passed (+grace)    -> 'cancelled'
 * Conservative on purpose: rides that have active bookings are left for the
 * driver to complete, never auto-expired.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduled(): Promise<void> {
    const res = await this.runCleanup();
    if (res.expiredRides || res.cancelledRequests) {
      this.logger.log(
        `cleanup: expired ${res.expiredRides} ride(s), cancelled ${res.cancelledRequests} stale request(s)`,
      );
    }
  }

  async runCleanup(): Promise<CleanupResult> {
    const rideGraceH = this.config.get<number>('maintenance.rideGraceHours') ?? 2;
    const reqGraceMin = this.config.get<number>('maintenance.requestGraceMin') ?? 30;

    const expired = await this.db.query<{ id: string }>(
      `UPDATE rides SET status = 'expired'
       WHERE status = 'open'
         AND departure_time < now() - make_interval(hours => $1)
         AND NOT EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.ride_id = rides.id AND b.status IN ('matched','confirmed')
         )
       RETURNING id`,
      [rideGraceH],
    );

    const cancelled = await this.db.query<{ id: string }>(
      `UPDATE bookings SET status = 'cancelled'
       WHERE status IN ('pending','no_match')
         AND req_window_end < now() - make_interval(mins => $1)
       RETURNING id`,
      [reqGraceMin],
    );

    return { expiredRides: expired.length, cancelledRequests: cancelled.length };
  }
}
