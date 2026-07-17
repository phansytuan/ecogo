import { assertProductionConfig } from './validate-production';

const validProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a-secure-random-secret-that-is-longer-than-32-characters',
  OTP_PROVIDER: 'esms',
  DATABASE_URL: 'postgresql://localhost/ecogo',
  REDIS_URL: 'redis://localhost:6379',
  DIRECTIONS_PROVIDER: 'mapbox',
};

describe('assertProductionConfig', () => {
  it.each([undefined, 'development', 'test'])(
    'does not throw when NODE_ENV is %s',
    (nodeEnv) => {
      const env: NodeJS.ProcessEnv = {};

      if (nodeEnv !== undefined) {
        env.NODE_ENV = nodeEnv;
      }

      expect(() => assertProductionConfig(env)).not.toThrow();
    },
  );

  it('rejects the default production JWT secret', () => {
    expect(() =>
      assertProductionConfig({
        ...validProductionEnv,
        JWT_SECRET: 'change-me-in-production',
      }),
    ).toThrow('JWT_SECRET');
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() =>
      assertProductionConfig({
        ...validProductionEnv,
        JWT_SECRET: 'too-short',
      }),
    ).toThrow('JWT_SECRET');
  });

  it('rejects the fake OTP provider in production', () => {
    expect(() =>
      assertProductionConfig({
        ...validProductionEnv,
        OTP_PROVIDER: 'fake',
      }),
    ).toThrow('OTP_PROVIDER');
  });

  it('accepts valid production configuration', () => {
    expect(() =>
      assertProductionConfig({ ...validProductionEnv }),
    ).not.toThrow();
  });

  it('reports multiple violations in one error', () => {
    let error: Error | undefined;

    try {
      assertProductionConfig({
        ...validProductionEnv,
        JWT_SECRET: 'too-short',
        OTP_PROVIDER: 'fake',
      });
    } catch (caught) {
      error = caught as Error;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('JWT_SECRET');
    expect(error?.message).toContain('OTP_PROVIDER');
  });

  it('warns but does not throw for fake directions in production', () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        assertProductionConfig({
          ...validProductionEnv,
          DIRECTIONS_PROVIDER: 'fake',
        }),
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
