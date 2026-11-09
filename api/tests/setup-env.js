// Defaults for local test runs. CI sets the same variables explicitly.
process.env.NODE_ENV = 'test';
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5432';
process.env.DB_NAME ??= 'campusshelf_test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.DB_SSL ??= 'false';
process.env.JWT_SECRET ??= 'test-only-secret-not-for-production';
