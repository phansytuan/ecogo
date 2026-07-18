import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { LoggingInterceptor } from './common/logging.interceptor';
import { assertProductionConfig } from './config/validate-production';

async function bootstrap() {
  assertProductionConfig(process.env);
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
    });
  }

  const app = await NestFactory.create(AppModule);
  // Explicit signal handling instead of enableShutdownHooks(): Nest's hooks
  // finish by re-raising the signal and relying on its default disposition,
  // but as PID 1 in a container the kernel ignores handler-less signals — the
  // process would linger until docker's SIGKILL. app.close() still runs every
  // onModuleDestroy hook (pg pool, BullMQ worker/queue).
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, async () => {
      try {
        await app.close();
        process.exit(0);
      } catch {
        process.exit(1);
      }
    });
  }
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({ origin: config.get<string[]>('corsOrigins'), credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  console.log(`ECOGO backend listening on http://localhost:${port}/api`);
}
bootstrap();
