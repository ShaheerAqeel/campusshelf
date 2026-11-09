import { HttpError } from '../errors.js';
import { logger } from '../logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  // PostgreSQL unique violation, e.g. duplicate ISBN that slipped past a pre-check.
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'A record with these details already exists' });
  }
  (req.log || logger).error({ err }, 'unhandled error');
  // Never leak stack traces or SQL to clients.
  return res.status(500).json({ error: 'Internal server error' });
}
