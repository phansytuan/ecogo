import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
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

  let smsMock: { send: jest.Mock };

  beforeEach(() => {
    redis = new FakeRedis();
    smsMock = { send: jest.fn().mockResolvedValue(undefined) };
    service = new OtpService(redis as any, smsMock as any);
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

  it('sends the generated code through the SMS sender', async () => {
    const phone = '+84901234567';

    const issued = await service.issue(phone);

    expect(smsMock.send).toHaveBeenCalledWith(
      phone,
      expect.stringContaining(issued.code),
    );
  });

  it('clears both Redis keys when SMS delivery fails', async () => {
    const phone = '+84901234567';
    const delSpy = jest.spyOn(redis, 'del');
    smsMock.send.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(service.issue(phone)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(delSpy).toHaveBeenCalledWith(`otp:cd:${phone}`);
    expect(delSpy).toHaveBeenCalledWith(`otp:code:${phone}`);
    await expect(redis.exists(`otp:cd:${phone}`)).resolves.toBe(0);
    await expect(redis.exists(`otp:code:${phone}`)).resolves.toBe(0);
    await expect(service.issue(phone)).resolves.toBeDefined();
  });
});
