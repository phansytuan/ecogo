import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsListener } from './notifications.listener';
import { NOTIFICATION_PROVIDER } from './notification.provider';
import { FakeNotificationService } from './fake-notification.service';
import { FcmNotificationService } from './fcm-notification.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsListener,
    FakeNotificationService,
    FcmNotificationService,
    {
      provide: NOTIFICATION_PROVIDER,
      inject: [ConfigService, FakeNotificationService, FcmNotificationService],
      useFactory: (config: ConfigService, fake: FakeNotificationService, fcm: FcmNotificationService) =>
        process.env.NOTIFICATION_PROVIDER === 'fcm' ? fcm : fake,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
