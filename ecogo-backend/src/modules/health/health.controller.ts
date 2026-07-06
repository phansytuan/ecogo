import { Controller, Get, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type IORedis from 'ioredis';
import { DatabaseService } from '../../database/database.service';
import { REDIS } from '../../redis/redis.module';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    @Inject(REDIS) private readonly redis: IORedis,
  ) {}

  @Get()
  async check() {
    const out = { status: 'ok', db: 'down', redis: 'down', uptime: Math.round(process.uptime()) };
    try {
      await this.db.query('SELECT 1');
      out.db = 'up';
    } catch {
      /* db down */
    }
    try {
      out.redis = (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      /* redis down */
    }
    out.status = out.db === 'up' && out.redis === 'up' ? 'ok' : 'degraded';
    return out;
  }
}
