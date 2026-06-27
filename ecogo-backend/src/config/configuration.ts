export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://ecogo:ecogo@localhost:5432/ecogo',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  },
  otpProvider: process.env.OTP_PROVIDER ?? 'fake',
  directions: {
    provider: process.env.DIRECTIONS_PROVIDER ?? 'fake',
    goongApiKey: process.env.GOONG_API_KEY ?? '',
  },
});
