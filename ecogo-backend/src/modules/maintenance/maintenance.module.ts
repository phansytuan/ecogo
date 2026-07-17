import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { MaintenanceService } from './maintenance.service';

@Module({ imports: [RealtimeModule], providers: [MaintenanceService] })
export class MaintenanceModule {}
