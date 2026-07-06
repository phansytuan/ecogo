import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { RidesModule } from './modules/rides/rides.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { MatchingModule } from './modules/matching/matching.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { MatchingQueueModule } from './modules/matching-queue/matching-queue.module';
import { RequestsModule } from './modules/requests/requests.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChatModule } from './modules/chat/chat.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { HealthModule } from './modules/health/health.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    VehiclesModule,
    RidesModule,
    BookingsModule,
    MatchingModule,
    RealtimeModule,
    MatchingQueueModule,
    RequestsModule,
    DispatchModule,
    NotificationsModule,
    ChatModule,
    TransactionsModule,
    RatingsModule,
    HealthModule,
    MaintenanceModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
