import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://ecogo:ecogo@localhost:5432/ecogo';
  const base = join(__dirname, '..');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(join(base, 'db', 'schema.sql'), 'utf8'));
    console.log('Applied schema.sql');

    const migDir = join(base, 'db', 'migrations');
    if (existsSync(migDir)) {
      const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) {
        await client.query(readFileSync(join(migDir, f), 'utf8'));
        console.log('Applied', f);
      }
    }
    console.log('Database ready.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('DB init failed:', err.message);
  process.exit(1);
});
