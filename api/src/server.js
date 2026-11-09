import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { logger } from './logger.js';

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'campusshelf-api listening');
});

// Keep-alive must outlast Nginx's upstream keepalive so idle sockets are not cut mid-request.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  // Docker sends SIGTERM when a container stops; an ASG instance refresh stops containers this way too.
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    await pool.end().catch(() => {});
    logger.info('shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
