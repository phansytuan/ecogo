import { Injectable, Logger } from '@nestjs/common';

interface OtpEntry {
  code: string;
  expiresAt: number;
}

/**
 * Dev OTP store. In production, swap for Firebase Auth phone or an SMS provider
 * (eSMS/FPT). Codes are kept in memory and also returned in the API response
 * when OTP_PROVIDER=fake, so the client/dev can complete the flow without SMS.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly store = new Map<string, OtpEntry>();
  private readonly ttlMs = 5 * 60 * 1000;

  issue(phone: string): { code: string; devReturn: boolean } {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.store.set(phone, { code, expiresAt: Date.now() + this.ttlMs });
    this.logger.debug(`OTP for ${phone}: ${code}`);
    return { code, devReturn: (process.env.OTP_PROVIDER ?? 'fake') === 'fake' };
  }

  verify(phone: string, code: string): boolean {
    const entry = this.store.get(phone);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(phone);
      return false;
    }
    const ok = entry.code === code;
    if (ok) this.store.delete(phone);
    return ok;
  }
}
