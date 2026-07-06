import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  InvalidTokenError,
  NOTIFICATION_PROVIDER,
  NotificationProvider,
} from './notification.provider';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  async registerToken(userId: string, token: string, platform?: string) {
    return this.db.one(
      `INSERT INTO device_tokens (user_id, token, platform)
       VALUES ($1,$2,$3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING id, platform`,
      [userId, token, platform ?? null],
    );
  }

  async pushToUser(userId: string, title: string, body: string, data?: Record<string, string>) {
    const rows = await this.db.query<{ token: string }>(
      `SELECT token FROM device_tokens WHERE user_id = $1`,
      [userId],
    );
    await Promise.all(
      rows.map(async (r) => {
        try {
          await this.provider.send({ token: r.token, title, body, data });
        } catch (e) {
          if (e instanceof InvalidTokenError) {
            await this.pruneToken(e.token);
          } else {
            this.logger.warn(`push failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }),
    );
  }

  /** Remove a device token FCM has reported as unregistered. */
  private async pruneToken(token: string) {
    await this.db.query(`DELETE FROM device_tokens WHERE token = $1`, [token]).catch(() => {});
    this.logger.debug('pruned an invalid device token');
  }
}
