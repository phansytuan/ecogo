import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { UsersService } from '../users/users.service';
import { OtpService } from './otp.service';

interface UserLike {
  id: string;
  phone: string;
  roles: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async requestOtp(phone: string) {
    const { code, devReturn } = await this.otp.issue(phone);
    return devReturn ? { sent: true, devCode: code } : { sent: true };
  }

  async verifyOtp(phone: string, code: string) {
    if (!(await this.otp.verify(phone, code))) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    const user = await this.users.findOrCreateByPhone(phone);
    const tokens = await this.issueTokens(user);
    return { ...tokens, user: { id: user.id, phone: user.phone, roles: user.roles } };
  }

  async refresh(refreshToken: string) {
    const row = await this.db.one<{
      id: string;
      user_id: string;
      expires_at: string;
      revoked: boolean;
      phone: string;
      roles: string[];
    }>(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked, u.phone, u.roles
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [this.hash(refreshToken)],
    );
    if (!row || row.revoked || new Date(row.expires_at) < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // rotate: single-use refresh tokens
    await this.db.query(`UPDATE refresh_tokens SET revoked = true WHERE id = $1`, [row.id]);
    const user: UserLike = { id: row.user_id, phone: row.phone, roles: row.roles };
    const tokens = await this.issueTokens(user);
    return { ...tokens, user };
  }

  async logout(refreshToken: string) {
    await this.db.query(`UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`, [
      this.hash(refreshToken),
    ]);
    return { ok: true };
  }

  private async issueTokens(user: UserLike) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      roles: user.roles,
    });
    const refreshToken = randomBytes(40).toString('hex');
    const days = this.config.get<number>('jwt.refreshDays') ?? 30;
    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(days => $3))`,
      [user.id, this.hash(refreshToken), days],
    );
    return { accessToken, refreshToken };
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
