import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';

export class AutocompleteQueryDto {
  @IsString()
  @Length(1, 200)
  input!: string;

  /** Optional location bias — the user's current position. */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

export class ReverseQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}

export class DetailQueryDto {
  @IsString()
  @Length(1, 512)
  placeId!: string;
}
