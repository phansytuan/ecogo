import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, types } from 'pg';
import { DatabaseService } from './database.service';
import { PG_POOL } from './database.tokens';

export { PG_POOL } from './database.tokens';

// node-postgres returns `numeric`/`decimal` columns as strings to preserve
// arbitrary precision. All our numeric columns (prices, fares, fees in
// numeric(12,0) VND; ratings/pct) are well within JS safe-integer range, and
// clients (Flutter models, dispatch console) expect JSON numbers — so parse
// the numeric OID (1700) into a JS number.
const PG_NUMERIC_OID = 1700;
types.setTypeParser(PG_NUMERIC_OID, (value) => (value === null ? null : Number(value)));

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
