import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  InvalidTokenError,
  NOTIFICATION_PROVIDER,
  NotificationProvider,
} from './notification.provider';

interface OutboxRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, string> | null;
}

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

  async pushToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    const notification = await this.db.one<{ id: string }>(
      `INSERT INTO notifications (user_id, title, body, data)
       VALUES ($1,$2,$3,$4::jsonb)
       RETURNING id`,
      [userId, title, body, data ? JSON.stringify(data) : null],
    );
    if (!notification) {
      throw new Error('Failed to create notification outbox row');
    }

    await this.deliver(notification.id, userId, title, body, data);
  }

  private async deliver(
    notificationId: string,
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const rows = await this.db.query<{ token: string }>(
      `SELECT token FROM device_tokens WHERE user_id = $1`,
      [userId],
    );
    if (rows.length === 0) {
      await this.db.query(
        `UPDATE notifications
         SET status = 'skipped', attempts = attempts + 1
         WHERE id = $1`,
        [notificationId],
      );
      return;
    }

    let delivered = 0;
    let hardFailures = 0;
    await Promise.all(
      rows.map(async (row) => {
        try {
          await this.provider.send({ token: row.token, title, body, data });
          delivered += 1;
        } catch (error) {
          hardFailures += 1;
          if (error instanceof InvalidTokenError) {
            await this.pruneToken(error.token);
          } else {
            this.logger.warn(
              `push failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }),
    );

    if (delivered > 0) {
      await this.db.query(
        `UPDATE notifications
         SET status = 'sent', sent_at = now(), attempts = attempts + 1
         WHERE id = $1`,
        [notificationId],
      );
    } else if (hardFailures > 0) {
      await this.db.query(
        `UPDATE notifications
         SET status = 'failed', attempts = attempts + 1
         WHERE id = $1`,
        [notificationId],
      );
    }
  }

  async retryUndelivered(limit = 100): Promise<number> {
    const rows = await this.db.query<OutboxRow>(
      `SELECT id, user_id, title, body, data
       FROM notifications
       WHERE status IN ('pending','failed')
         AND attempts < 5
         AND created_at > now() - interval '24 hours'
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit],
    );

    for (const row of rows) {
      await this.deliver(
        row.id,
        row.user_id,
        row.title,
        row.body,
        row.data as Record<string, string> | undefined,
      );
    }
    return rows.length;
  }

  listForUser(userId: string, limit = 50) {
    return this.db.query(
      `SELECT id, title, body, data, status, created_at, read_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
  }

  async markRead(userId: string, notificationId: string) {
    const row = await this.db.one(
      `UPDATE notifications
       SET read_at = now()
       WHERE id = $2
         AND user_id = $1
         AND read_at IS NULL
       RETURNING id, read_at`,
      [userId, notificationId],
    );
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }

  /** Remove a device token FCM has reported as unregistered. */
  private async pruneToken(token: string) {
    await this.db
      .query(`DELETE FROM device_tokens WHERE token = $1`, [token])
      .catch(() => {});
    this.logger.debug('pruned an invalid device token');
  }
}
