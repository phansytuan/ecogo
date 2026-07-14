import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { GeoPointDto } from '../rides/rides.dto';

/** An additional traveller on a multi-seat booking. */
export class CompanionDto {
  @IsString()
  @Length(2, 80)
  fullName!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

/** Fare quote request — no ride yet, just the passenger's two points. */
export class QuoteBookingDto {
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

export class CreateBookingDto {
  @IsUUID()
  rideId!: string;

  @ValidateNested()
  @Type(() => GeoPointDto)
  pickup!: GeoPointDto;

  @ValidateNested()
  @Type(() => GeoPointDto)
  dropoff!: GeoPointDto;

  /** Precise address the passenger picked on the map. */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  pickupAddress?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  dropoffAddress?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;

  /** Required when seats >= 2: details for each additional passenger. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => CompanionDto)
  companions?: CompanionDto[];

  /** Optional specific seat positions (e.g. ['R2-1']). Must match seat count. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  seatIds?: string[];
}
