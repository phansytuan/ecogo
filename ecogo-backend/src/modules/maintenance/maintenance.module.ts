import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MaintenanceService } from './maintenance.service';

@Module({ imports: [RealtimeModule, NotificationsModule], providers: [MaintenanceService] })
export class MaintenanceModule {}
