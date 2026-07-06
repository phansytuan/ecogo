import { IsString, Matches, Length, IsNotEmpty } from 'class-validator';

const VN_PHONE = /^(0|\+84)\d{9,10}$/;

export class RequestOtpDto {
  @IsString()
  @Matches(VN_PHONE, { message: 'phone must be a valid VN number' })
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(VN_PHONE, { message: 'phone must be a valid VN number' })
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
