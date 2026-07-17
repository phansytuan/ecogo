import { HttpException, HttpStatus } from '@nestjs/common';
import { OtpService } from './otp.service';

interface StoredValue {
  value: string;
  ttl?: number;
}

class FakeRedis {
  private readonly store = new Map<string, StoredValue>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }

  async set(
    key: string,
    value: string,
    mode?: string,
    duration?: number,
  ): Promise<'OK'> {
    const existing = this.store.get(key);
    const ttl =
      mode === 'EX'
        ? duration
        : mode === 'KEEPTTL'
          ? existing?.ttl
          : undefined;

    this.store.set(key, { value, ttl });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const deleted = this.store.delete(key);
    return deleted ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }
}

describe('OtpService', () => {
  let redis: FakeRedis;
  let service: OtpService;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new OtpService(redis as any);
  });

  it('issues a six-digit development code', async () => {
    const result = await service.issue('+84901234567');

    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.devReturn).toBe(true);
  });

  it('rejects a second request during the cooldown', async () => {
    const phone = '+84901234567';
    await service.issue(phone);

    let error: unknown;
    try {
      await service.issue(phone);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('does not apply one phone cooldown to another phone', async () => {
    await service.issue('+84901234567');

    await expect(service.issue('+84907654321')).resolves.toMatchObject({
      devReturn: true,
    });
  });

  it('accepts and consumes the correct code', async () => {
    const phone = '+84901234567';
    const { code } = await service.issue(phone);

    await expect(service.verify(phone, code)).resolves.toBe(true);
    await expect(service.verify(phone, code)).resolves.toBe(false);
  });

  it('allows the correct code after a wrong attempt', async () => {
    const phone = '+84901234567';
    const { code } = await service.issue(phone);

    await expect(service.verify(phone, '000000')).resolves.toBe(false);
    await expect(service.verify(phone, code)).resolves.toBe(true);
  });

  it('rejects the correct code after the maximum wrong attempts', async () => {
    const phone = '+84901234567';
    const { code } = await service.issue(phone);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.verify(phone, '000000')).resolves.toBe(false);
    }

    await expect(service.verify(phone, code)).resolves.toBe(false);
  });

  it('rejects verification when no code was requested', async () => {
    await expect(service.verify('+84901234567', '123456')).resolves.toBe(false);
  });
});
