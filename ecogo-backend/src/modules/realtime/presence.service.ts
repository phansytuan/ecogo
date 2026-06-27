import { Inject, Injectable } from '@nestjs/common';
import IORedis from 'ioredis';
import { REDIS } from '../../redis/redis.module';

export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  at: number; // epoch ms
}

/**
 * Live driver positions live in Redis, never in Postgres — high-frequency pings
 * would crush the DB. Key per driver with a short TTL so stale drivers fall off.
 */
@Injectable()
export class PresenceService {
  private readonly ttlS = 30;

  constructor(@Inject(REDIS) private readonly redis: IORedis) {}

  static key(driverId: string): string {
    return `presence:driver:${driverId}`;
  }

  async setLocation(loc: DriverLocation): Promise<void> {
    await this.redis.set(
      PresenceService.key(loc.driverId),
      JSON.stringify(loc),
      'EX',
      this.ttlS,
    );
  }

  async getLocation(driverId: string): Promise<DriverLocation | null> {
    const raw = await this.redis.get(PresenceService.key(driverId));
    return raw ? (JSON.parse(raw) as DriverLocation) : null;
  }

  async getMany(driverIds: string[]): Promise<DriverLocation[]> {
    if (driverIds.length === 0) return [];
    const keys = driverIds.map((id) => PresenceService.key(id));
    const raws = await this.redis.mget(keys);
    return raws
      .filter((r): r is string => r != null)
      .map((r) => JSON.parse(r) as DriverLocation);
  }
}
