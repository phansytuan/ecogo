import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

export const REDIS = 'REDIS';
export const REDIS_CONN = 'REDIS_CONN';

export interface RedisConn {
  host: string;
  port: number;
}

function parse(url: string): RedisConn {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379) };
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = new IORedis(config.get<string>('redisUrl') as string, {
          maxRetriesPerRequest: null,
        });
        const logger = new Logger('Redis');
        redis.on('error', (error) => logger.error(`connection error: ${error.message}`));
        return redis;
      },
    },
    {
      provide: REDIS_CONN,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RedisConn =>
        parse(config.get<string>('redisUrl') as string),
    },
  ],
  exports: [REDIS, REDIS_CONN],
})
export class RedisModule {}
