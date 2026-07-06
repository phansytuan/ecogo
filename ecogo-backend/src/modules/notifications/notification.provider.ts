export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface NotificationProvider {
  send(msg: PushMessage): Promise<void>;
}

/** Thrown by a provider when FCM reports a device token is no longer valid,
 *  so the caller can prune it. */
export class InvalidTokenError extends Error {
  constructor(public readonly token: string) {
    super('invalid device token');
    this.name = 'InvalidTokenError';
  }
}

export const NOTIFICATION_PROVIDER = 'NOTIFICATION_PROVIDER';
