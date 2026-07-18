const forbiddenJwtSecrets = new Set([
  'change-me-in-production',
  'dev-secret-change-me',
]);

export function assertProductionConfig(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const violations: string[] = [];
  const jwtSecret = env.JWT_SECRET;

  if (!jwtSecret) {
    violations.push('JWT_SECRET is required.');
  } else if (jwtSecret.length < 32) {
    violations.push('JWT_SECRET must be at least 32 characters long.');
  } else if (forbiddenJwtSecrets.has(jwtSecret)) {
    violations.push('JWT_SECRET must not use a known unsafe default.');
  }

  if (!env.OTP_PROVIDER || env.OTP_PROVIDER === 'fake') {
    violations.push('OTP_PROVIDER must be set and must not be "fake".');
  }

  if (!env.DATABASE_URL?.trim()) {
    violations.push('DATABASE_URL is required and must be non-empty.');
  }

  if (!env.REDIS_URL?.trim()) {
    violations.push('REDIS_URL is required and must be non-empty.');
  }

  if (!env.DIRECTIONS_PROVIDER || env.DIRECTIONS_PROVIDER === 'fake') {
    console.warn(
      'DIRECTIONS_PROVIDER is unset or "fake" in production.',
    );
  }

  if (env.REQUIRE_DRIVER_KYC !== 'true') {
    console.warn(
      'REQUIRE_DRIVER_KYC is not enabled in production — unverified drivers can post rides.',
    );
  }

  if (!env.SENTRY_DSN) {
    console.warn(
      'SENTRY_DSN is not set in production — errors will not be tracked.',
    );
  }

  if (violations.length > 0) {
    throw new Error(`Invalid production configuration:\n${violations.join('\n')}`);
  }
}
