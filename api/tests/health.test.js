import { api, closeDb } from './helpers.js';

afterAll(closeDb);

describe('health checks', () => {
  test('GET /health returns ok without touching the database', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('GET /health/db returns ok when PostgreSQL is reachable', async () => {
    const res = await api().get('/health/db');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('up');
  });

  test('unknown routes return 404 JSON', async () => {
    const res = await api().get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No route/);
  });

  test('security headers are set and x-powered-by is hidden', async () => {
    const res = await api().get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
