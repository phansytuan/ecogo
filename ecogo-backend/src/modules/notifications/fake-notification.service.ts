import { Injectable, Logger } from '@nestjs/common';
import { NotificationProvider, PushMessage } from './notification.provider';

/** Dev provider: logs instead of sending. Swap for FCM in production. */
@Injectable()
export class FakeNotificationService implements NotificationProvider {
  private readonly logger = new Logger('Push');
  async send(msg: PushMessage): Promise<void> {
    this.logger.debug(`PUSH -> ${msg.token}: ${msg.title} | ${msg.body}`);
  }
}
