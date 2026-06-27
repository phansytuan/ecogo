import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { GeoPointDto } from '../rides/rides.dto';

export class MatchRequestDto {
  @ValidateNested()
  @Type(() => GeoPointDto)
  pickup!: GeoPointDto;

  @ValidateNested()
  @Type(() => GeoPointDto)
  dropoff!: GeoPointDto;

  /** Earliest acceptable departure (ISO). */
  @IsISO8601()
  windowStart!: string;

  /** Latest acceptable departure (ISO). */
  @IsISO8601()
  windowEnd!: string;

  /** Preferred pickup time (ISO) — used only for ranking. */
  @IsOptional()
  @IsISO8601()
  desiredPickup?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;
}
