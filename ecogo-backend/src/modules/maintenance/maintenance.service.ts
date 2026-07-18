import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';

interface RideReviewRow {
  id: string;
  driver_id: string;
}

export interface CleanupResult {
  expiredRides: number;
  cancelledRequests: number;
  ridesRequiringReview: number;
  retriedNotifications: number;
}

/**
 * Periodic housekeeping so stale rows don't linger:
 *  - overdue rides with active bookings -> 'requires_review'
 *  - overdue rides without active bookings -> 'expired'
 *  - ride requests past their match window (+grace) -> 'cancelled'
 * Unresolved review rides alert dispatch on every cleanup run.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeGateway,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduled(): Promise<void> {
    const res = await this.runCleanup();
    if (
      res.expiredRides ||
      res.ridesRequiringReview ||
      res.retriedNotifications ||
      res.cancelledRequests
    ) {
      this.logger.log(
        `cleanup: expired ${res.expiredRides} ride(s), flagged ${res.ridesRequiringReview} ride(s) for review, cancelled ${res.cancelledRequests} stale request(s), retried ${res.retriedNotifications} notification(s)`,
      );
    }
  }

  async runCleanup(): Promise<CleanupResult> {
    const rideGraceH = this.config.get<number>('maintenance.rideGraceHours') ?? 2;
    const reqGraceMin = this.config.get<number>('maintenance.requestGraceMin') ?? 30;

    const {
      flagged,
      expired,
      leftovers,
      cancelled,
    } = await this.db.tx(async (client) => {
      const flagged = (
        await client.query<RideReviewRow>(
          `UPDATE rides SET status = 'requires_review'
           WHERE status IN ('open','full','ongoing')
             AND departure_time + duration_s * interval '1 second'
                 < now() - make_interval(hours => $1)
             AND EXISTS (
               SELECT 1 FROM bookings b
               WHERE b.ride_id = rides.id
                 AND b.status IN ('matched','confirmed','ongoing')
             )
           RETURNING id, driver_id`,
          [rideGraceH],
        )
      ).rows;

      const expired = (
        await client.query<{ id: string }>(
          `UPDATE rides SET status = 'expired', available_seats = 0
           WHERE status IN ('open','full','ongoing')
             AND departure_time + duration_s * interval '1 second'
                 < now() - make_interval(hours => $1)
             AND NOT EXISTS (
               SELECT 1 FROM bookings b
               WHERE b.ride_id = rides.id
                 AND b.status IN ('matched','confirmed','ongoing')
             )
           RETURNING id`,
          [rideGraceH],
        )
      ).rows;

      const leftovers = (
        await client.query<RideReviewRow>(
          `SELECT id, driver_id FROM rides
           WHERE status = 'requires_review'
             AND id <> ALL($1::uuid[])`,
          [flagged.map((ride) => ride.id)],
        )
      ).rows;

      const cancelled = (
        await client.query<{ id: string }>(
          `UPDATE bookings SET status = 'cancelled', claimed_by = NULL, claimed_at = NULL
           WHERE status IN ('pending','no_match','processing')
             AND req_window_end < now() - make_interval(mins => $1)
           RETURNING id`,
          [reqGraceMin],
        )
      ).rows;

      return { flagged, expired, leftovers, cancelled };
    });

    for (const ride of flagged) {
      const payload = { rideId: ride.id, driverId: ride.driver_id };
      this.realtime.emitToDispatch('ride.requires_review', payload);
      this.events.emit('ride.requires_review', payload);
    }

    for (const ride of leftovers) {
      const payload = { rideId: ride.id, driverId: ride.driver_id };
      this.realtime.emitToDispatch('ride.requires_review.reminder', payload);
      this.events.emit('ride.requires_review.reminder', payload);
    }

    const retriedNotifications = await this.notifications.retryUndelivered();

    return {
      expiredRides: expired.length,
      cancelledRequests: cancelled.length,
      ridesRequiringReview: flagged.length,
      retriedNotifications,
    };
  }
}
