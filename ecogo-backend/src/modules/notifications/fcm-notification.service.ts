import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { JWT } from 'google-auth-library';
import { InvalidTokenError, NotificationProvider, PushMessage } from './notification.provider';

/**
 * FCM HTTP v1 using a Firebase service account. The google-auth-library JWT
 * client mints and auto-refreshes the OAuth access token, so there is no
 * short-lived bearer to manage. Unconfigured -> pushes are dropped (dev/fake).
 */
@Injectable()
export class FcmNotificationService implements NotificationProvider {
  private readonly logger = new Logger('FCM');
  private readonly jwt?: JWT;
  private readonly projectId?: string;

  constructor(config: ConfigService) {
    const projectId = config.get<string>('fcm.projectId');
    const clientEmail = config.get<string>('fcm.clientEmail');
    const privateKey = config.get<string>('fcm.privateKey');
    if (projectId && clientEmail && privateKey) {
      this.projectId = projectId;
      this.jwt = new JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
    } else {
      this.logger.warn('FCM service account not configured; pushes will be dropped');
    }
  }

  async send(msg: PushMessage): Promise<void> {
    if (!this.jwt || !this.projectId) return;
    const { token: accessToken } = await this.jwt.getAccessToken();
    try {
      await axios.post(
        `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        {
          message: {
            token: msg.token,
            notification: { title: msg.title, body: msg.body },
            data: msg.data,
          },
        },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    } catch (e) {
      const err = e as { response?: { status?: number; data?: any } };
      const status = err.response?.status;
      const code =
        err.response?.data?.error?.details?.[0]?.errorCode ?? err.response?.data?.error?.status;
      if (status === 404 || code === 'UNREGISTERED' || code === 'NOT_FOUND') {
        throw new InvalidTokenError(msg.token);
      }
      throw e;
    }
  }
}
