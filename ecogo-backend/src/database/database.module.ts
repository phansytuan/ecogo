import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, types } from 'pg';
import { DatabaseService } from './database.service';
import { PG_POOL } from './database.tokens';

export { PG_POOL } from './database.tokens';

// Postgres `numeric` (type OID 1700) is returned as a string by node-postgres to
// preserve arbitrary precision. Every numeric column we have (price_per_seat,
// fare, rating, transaction amounts) is a money/rating value well within JS
// safe-integer range, and API clients expect JSON numbers — the Flutter models
// cast these with `as num`, which throws on a string. Parse numeric as a JS
// number so responses carry real numbers. Backend money math already coerces
// with Number(), so this is a no-op there.
types.setTypeParser(1700, (v: string | null) => (v === null ? null : Number(v)));

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({ connectionString: config.get<string>('databaseUrl'), max: 10 }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
