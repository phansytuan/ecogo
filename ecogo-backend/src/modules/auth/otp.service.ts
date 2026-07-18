import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type IORedis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import { SMS_SENDER, SmsSender } from './sms.provider';

interface OtpEntry {
  code: string;
  attempts: number;
}

const CODE_TTL_S = 300;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_S = 60;

/**
 * Redis-backed OTP store shared across backend processes and restarts.
 * Codes expire automatically, wrong attempts are capped, and requests have a
 * per-phone cooldown. The fake provider still returns codes for development.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(REDIS) private readonly redis: IORedis,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  async issue(
    phone: string,
  ): Promise<{ code: string; devReturn: boolean }> {
    const cooldownKey = `otp:cd:${phone}`;
    const codeKey = `otp:code:${phone}`;

    if (await this.redis.exists(cooldownKey)) {
      throw new HttpException(
        'Please wait before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.redis.set(
      cooldownKey,
      '1',
      'EX',
      RESEND_COOLDOWN_S,
    );
    await this.redis.set(
      codeKey,
      JSON.stringify({ code, attempts: 0 }),
      'EX',
      CODE_TTL_S,
    );

    const message = `ECOGO: Ma xac thuc cua ban la ${code}. Hieu luc 5 phut.`;
    try {
      await this.sms.send(phone, message);
    } catch {
      await this.redis.del(cooldownKey).catch(() => {});
      await this.redis.del(codeKey).catch(() => {});
      throw new ServiceUnavailableException('Khong gui duoc SMS — thu lai sau');
    }

    return {
      code,
      devReturn: (process.env.OTP_PROVIDER ?? 'fake') === 'fake',
    };
  }

  async verify(phone: string, code: string): Promise<boolean> {
    const codeKey = `otp:code:${phone}`;
    const raw = await this.redis.get(codeKey);

    if (!raw) {
      return false;
    }

    let entry: OtpEntry;
    try {
      entry = JSON.parse(raw) as OtpEntry;
    } catch {
      return false;
    }

    if (
      !entry ||
      typeof entry.code !== 'string' ||
      typeof entry.attempts !== 'number'
    ) {
      return false;
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      await this.redis.del(codeKey);
      return false;
    }

    if (entry.code === code) {
      await this.redis.del(codeKey);
      return true;
    }

    await this.redis.set(
      codeKey,
      JSON.stringify({ ...entry, attempts: entry.attempts + 1 }),
      'KEEPTTL',
    );
    return false;
  }
}
