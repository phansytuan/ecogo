import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { GEOCODING_PROVIDER } from './geocoding.provider';
import { FakeGeocodingService } from './fake-geocoding.service';
import { GoongGeocodingService } from './goong-geocoding.service';

@Module({
  controllers: [PlacesController],
  providers: [
    PlacesService,
    FakeGeocodingService,
    GoongGeocodingService,
    {
      provide: GEOCODING_PROVIDER,
      inject: [ConfigService, FakeGeocodingService, GoongGeocodingService],
      useFactory: (
        config: ConfigService,
        fake: FakeGeocodingService,
        goong: GoongGeocodingService,
      ) => (config.get<string>('places.provider') === 'goong' ? goong : fake),
    },
  ],
  exports: [PlacesService],
})
export class PlacesModule {}
