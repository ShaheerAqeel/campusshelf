import pino from 'pino';
import { config } from './config.js';

// JSON logs to stdout. On AWS the Docker awslogs driver ships stdout to CloudWatch.
export const logger = pino({
  level: config.LOG_LEVEL || (config.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'campusshelf-api' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.password_hash'],
    censor: '[redacted]',
  },
});
