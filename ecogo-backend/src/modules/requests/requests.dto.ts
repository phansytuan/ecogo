import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Min, ValidateNested } from 'class-validator';
import { GeoPointDto } from '../rides/rides.dto';

export class CreateRequestDto {
  @ValidateNested()
  @Type(() => GeoPointDto)
  pickup!: GeoPointDto;

  @ValidateNested()
  @Type(() => GeoPointDto)
  dropoff!: GeoPointDto;

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
