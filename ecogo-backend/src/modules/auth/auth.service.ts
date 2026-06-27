import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { OtpService } from './otp.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
  ) {}

  requestOtp(phone: string) {
    const { code, devReturn } = this.otp.issue(phone);
    return devReturn ? { sent: true, devCode: code } : { sent: true };
  }

  async verifyOtp(phone: string, code: string) {
    if (!this.otp.verify(phone, code)) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    const user = await this.users.findOrCreateByPhone(phone);
    const token = await this.jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      roles: user.roles,
    });
    return {
      accessToken: token,
      user: { id: user.id, phone: user.phone, roles: user.roles },
    };
  }
}
