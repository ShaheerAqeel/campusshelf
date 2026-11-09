import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import bookRoutes from './routes/books.js';
import categoryRoutes from './routes/categories.js';
import loanRoutes from './routes/loans.js';
import statsRoutes from './routes/stats.js';
import userRoutes from './routes/users.js';

export function createApp() {
  const app = express();

  // Requests arrive via the ALB and then Nginx: trust both hops so req.ip is the client.
  app.set('trust proxy', 2);
  app.disable('x-powered-by');

  app.use(helmet());
  // The browser calls /api on the same origin through Nginx, so CORS only matters in development.
  if (config.CORS_ORIGIN) app.use(cors({ origin: config.CORS_ORIGIN.split(',') }));
  app.use(express.json({ limit: '100kb' }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
      autoLogging: { ignore: (req) => req.url === '/health' },
      // Keep log lines small: CloudWatch Logs bills by volume past the free 5 GB.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );

  // Liveness: the process is up. Does not touch the database.
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Readiness: the database is reachable. Used by deploy checks and the instance readiness gate.
  app.get('/health/db', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'up' });
    } catch (err) {
      req.log.warn({ err: err.message }, 'database health check failed');
      res.status(503).json({ status: 'error', db: 'down' });
    }
  });

  app.get('/', (_req, res) => res.json({ service: 'campusshelf-api', version: process.env.APP_VERSION || 'dev' }));

  app.use('/auth', authRoutes);
  app.use('/books', bookRoutes);
  app.use('/categories', categoryRoutes);
  app.use('/loans', loanRoutes);
  app.use('/stats', statsRoutes);
  app.use('/users', userRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
