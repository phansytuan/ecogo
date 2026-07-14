import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RealtimeModule } from '../realtime/realtime.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import type IORedis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import { DIRECTIONS_PROVIDER } from './directions/directions.provider';
import { CachedDirectionsService } from './directions/cached-directions.service';
import { FakeDirectionsService } from './directions/fake-directions.service';
import { GoongDirectionsService } from './directions/goong-directions.service';

@Module({
  imports: [VehiclesModule, RealtimeModule],
  controllers: [RidesController],
  providers: [
    RidesService,
    FakeDirectionsService,
    GoongDirectionsService,
    {
      provide: DIRECTIONS_PROVIDER,
      inject: [ConfigService, FakeDirectionsService, GoongDirectionsService, REDIS],
      useFactory: (
        config: ConfigService,
        fake: FakeDirectionsService,
        goong: GoongDirectionsService,
        redis: IORedis,
      ) => {
        const inner =
          config.get<string>('directions.provider') === 'goong' ? goong : fake;
        return new CachedDirectionsService(inner, redis, config);
      },
    },
  ],
  exports: [RidesService, DIRECTIONS_PROVIDER],
})
export class RidesModule {}
