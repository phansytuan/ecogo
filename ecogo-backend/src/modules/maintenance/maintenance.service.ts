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
 *  - unfinished rides past estimated completion (+grace)   -> 'expired'
 *  - ride-requests whose match window has passed (+grace)    -> 'cancelled'
 * Ride and booking terminal states are updated atomically, so a missed driver
 * completion cannot leave either side permanently busy.
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

    const { expired, cancelled } = await this.db.tx(async (client) => {
      const expired = (
        await client.query<{ id: string }>(
          `UPDATE rides SET status = 'expired', available_seats = 0
           WHERE status IN ('open','full','ongoing')
             AND departure_time + duration_s * interval '1 second'
                 < now() - make_interval(hours => $1)
           RETURNING id`,
          [rideGraceH],
        )
      ).rows;
      if (expired.length) {
        await client.query(
          `UPDATE bookings SET status = 'cancelled'
           WHERE ride_id = ANY($1::uuid[])
             AND status IN ('matched','confirmed','ongoing')`,
          [expired.map((ride) => ride.id)],
        );
      }
      const cancelled = (
        await client.query<{ id: string }>(
          `UPDATE bookings SET status = 'cancelled', claimed_by = NULL, claimed_at = NULL
           WHERE status IN ('pending','no_match','processing')
             AND req_window_end < now() - make_interval(mins => $1)
           RETURNING id`,
          [reqGraceMin],
        )
      ).rows;
      return { expired, cancelled };
    });

    return { expiredRides: expired.length, cancelledRequests: cancelled.length };
  }
}
