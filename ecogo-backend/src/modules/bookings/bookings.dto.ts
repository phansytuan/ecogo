import { Type } from 'class-transformer';
import { IsInt, IsUUID, IsOptional, Min, ValidateNested } from 'class-validator';
import { GeoPointDto } from '../rides/rides.dto';

export class CreateBookingDto {
  @IsUUID()
  rideId!: string;

  @ValidateNested()
  @Type(() => GeoPointDto)
  pickup!: GeoPointDto;

  @ValidateNested()
  @Type(() => GeoPointDto)
  dropoff!: GeoPointDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;
}
