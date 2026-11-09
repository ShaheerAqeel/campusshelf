import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

const defaultCaPath = fileURLToPath(new URL('../certs/rds-global-bundle.pem', import.meta.url));

function sslOptions() {
  if (!config.DB_SSL) return false;
  // Amazon RDS for PostgreSQL 15+ forces TLS. Verify the server certificate
  // against the RDS CA bundle that is baked into the image at build time.
  const caPath = config.DB_SSL_CA_PATH || defaultCaPath;
  return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
}

export const pgConfig = {
  host: config.DB_HOST,
  port: config.DB_PORT,
  database: config.DB_NAME,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  ssl: sslOptions(),
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

export const pool = new pg.Pool(pgConfig);

pool.on('error', (err) => {
  // An idle client failed (for example the DB restarted). The pool replaces it.
  console.error(JSON.stringify({ level: 'error', msg: 'idle pg client error', err: err.message }));
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Run fn inside a transaction on a dedicated client. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
