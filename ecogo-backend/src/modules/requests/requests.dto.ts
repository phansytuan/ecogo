import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { GeoPointDto } from '../rides/rides.dto';

export class CreateRequestDto {
  @ValidateNested()
  @Type(() => GeoPointDto)
  pickup!: GeoPointDto;

  @ValidateNested()
  @Type(() => GeoPointDto)
  dropoff!: GeoPointDto;

  /** Precise formatted addresses from the place search, when available. */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  pickupAddress?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  dropoffAddress?: string;

  @IsISO8601()
  windowStart!: string;

  @IsISO8601()
  windowEnd!: string;

  @IsOptional()
  @IsISO8601()
  desiredPickup?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;
}
