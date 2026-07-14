import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';

export class GeoPointDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsString()
  label?: string;

  /** Geocoding-provider reference for this point, when it came from a place search. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  placeId?: string;
}

export class QuoteDto {
  @ValidateNested()
  @Type(() => GeoPointDto)
  origin!: GeoPointDto;

  @ValidateNested()
  @Type(() => GeoPointDto)
  dest!: GeoPointDto;
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

export class CharterCheckDto {
  @ValidateNested()
  @Type(() => GeoPointDto)
  from!: GeoPointDto;

  /** Seconds the charter itself will take before heading to the pickup. */
  @IsOptional()
  @IsInt()
  @Min(0)
  charterDurationS?: number;
}

export class CharterOptOutDto {
  @IsBoolean()
  optOut!: boolean;
}

export class SeatLockDto {
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  seatIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  note?: string;
}
