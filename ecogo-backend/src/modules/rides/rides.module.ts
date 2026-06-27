import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import { DIRECTIONS_PROVIDER } from './directions/directions.provider';
import { FakeDirectionsService } from './directions/fake-directions.service';
import { GoongDirectionsService } from './directions/goong-directions.service';

@Module({
  imports: [VehiclesModule],
  controllers: [RidesController],
  providers: [
    RidesService,
    FakeDirectionsService,
    GoongDirectionsService,
    {
      provide: DIRECTIONS_PROVIDER,
      inject: [ConfigService, FakeDirectionsService, GoongDirectionsService],
      useFactory: (
        config: ConfigService,
        fake: FakeDirectionsService,
        goong: GoongDirectionsService,
      ) => (config.get<string>('directions.provider') === 'goong' ? goong : fake),
    },
  ],
  exports: [RidesService],
})
export class RidesModule {}
