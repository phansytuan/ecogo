import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class GeoPointDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsString()
  label?: string;
}

export class CreateRideDto {
  @IsUUID()
  vehicleId!: string;

  @ValidateNested()
  @Type(() => GeoPointDto)
  origin!: GeoPointDto;

  @ValidateNested()
  @Type(() => GeoPointDto)
  dest!: GeoPointDto;

  @IsISO8601()
  departureTime!: string;

  @IsInt()
  @Min(1)
  totalSeats!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pricePerSeat?: number;
}
