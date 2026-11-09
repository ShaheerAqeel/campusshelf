import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { pgConfig } from './db.js';

const dir = fileURLToPath(new URL('../migrations', import.meta.url));
const direction = process.argv[2] === 'down' ? 'down' : 'up';

try {
  const ran = await runner({
    databaseUrl: pgConfig, // a pg client config, so TLS settings are shared with the app
    dir,
    direction,
    ...(direction === 'down' && { count: 1 }),
    migrationsTable: 'pgmigrations',
    // node-pg-migrate takes a PostgreSQL advisory lock by default, so two instances
    // booting at the same time cannot run the same migration twice.
    log: () => {},
  });
  console.log(JSON.stringify({ level: 'info', msg: 'migrations complete', direction, applied: ran.map((m) => m.name) }));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ level: 'error', msg: 'migrations failed', err: err.message }));
  process.exit(1);
}
