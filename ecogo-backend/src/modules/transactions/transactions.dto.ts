import {
  IsInt,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CompleteBookingDto {
  @IsUUID()
  bookingId!: string;
}

export class AdjustGrossDto {
  @IsUUID()
  bookingId!: string;

  @IsInt()
  @Min(0)
  gross!: number;

  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class RequestAdjustmentDto {
  @IsUUID()
  bookingId!: string;

  @IsInt()
  @Min(0)
  proposedGross!: number;

  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class CreateReferralDto {
  @IsUUID()
  referredUserId!: string;
}
