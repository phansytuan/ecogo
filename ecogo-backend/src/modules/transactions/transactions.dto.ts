import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CompleteBookingDto {
  @IsUUID()
  bookingId!: string;

  /** Override the recorded fare (e.g. cash actually collected). */
  @IsOptional()
  @IsInt()
  @Min(0)
  gross?: number;
}

export class CreateReferralDto {
  @IsUUID()
  referredUserId!: string;
}
