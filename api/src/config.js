import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().optional(),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: bool,
  DB_SSL_CA_PATH: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  CORS_ORIGIN: z.string().optional(),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  LOAN_DAYS: z.coerce.number().int().positive().default(14),
  MAX_ACTIVE_LOANS: z.coerce.number().int().positive().default(5),
});

function load() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // Print variable names only, never values.
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    console.error(`Invalid configuration. Check these environment variables:\n${problems.join('\n')}`);
    process.exit(1);
  }
  return Object.freeze(result.data);
}

export const config = load();
