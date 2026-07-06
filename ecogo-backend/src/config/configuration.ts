export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://ecogo:ecogo@localhost:5432/ecogo',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '2h',
    refreshDays: parseInt(process.env.JWT_REFRESH_DAYS ?? '30', 10),
  },
  otpProvider: process.env.OTP_PROVIDER ?? 'fake',
  directions: {
    provider: process.env.DIRECTIONS_PROVIDER ?? 'fake',
    goongApiKey: process.env.GOONG_API_KEY ?? '',
    cachePrecision: parseInt(process.env.DIRECTIONS_CACHE_PRECISION ?? '4', 10),
    cacheTtlS: parseInt(process.env.DIRECTIONS_CACHE_TTL_S ?? '2592000', 10),
  },
  maintenance: {
    rideGraceHours: parseInt(process.env.MAINTENANCE_RIDE_GRACE_HOURS ?? '2', 10),
    requestGraceMin: parseInt(process.env.MAINTENANCE_REQUEST_GRACE_MIN ?? '30', 10),
  },
  fcm: {
    projectId: process.env.FCM_PROJECT_ID ?? '',
    clientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
    // PEM keys carry literal \n in env; restore real newlines.
    privateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
});
