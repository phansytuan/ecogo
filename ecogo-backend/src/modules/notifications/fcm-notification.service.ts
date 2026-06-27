import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { NotificationProvider, PushMessage } from './notification.provider';

/**
 * FCM HTTP v1. In production mint the bearer from a Firebase service account
 * (firebase-admin). For dev you can set FCM_ACCESS_TOKEN + FCM_PROJECT_ID.
 */
@Injectable()
export class FcmNotificationService implements NotificationProvider {
  private readonly logger = new Logger('FCM');
  constructor(private readonly config: ConfigService) {}

  async send(msg: PushMessage): Promise<void> {
    const projectId = process.env.FCM_PROJECT_ID;
    const accessToken = process.env.FCM_ACCESS_TOKEN;
    if (!projectId || !accessToken) {
      this.logger.warn('FCM not configured; dropping push');
      return;
    }
    await axios.post(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      { message: { token: msg.token, notification: { title: msg.title, body: msg.body }, data: msg.data } },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }
}
