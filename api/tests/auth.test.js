import { api, closeDb, createUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('auth', () => {
  test('register creates a member and returns a token', async () => {
    const res = await api().post('/auth/register').send({ name: 'Sara Khan', email: 'Sara@Example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toMatchObject({ email: 'sara@example.com', role: 'member' });
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('register cannot choose a staff role', async () => {
    const res = await api().post('/auth/register').send({ name: 'Eve', email: 'eve@example.com', password: 'password123', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('member');
  });

  test('register rejects a duplicate email (case-insensitive)', async () => {
    await api().post('/auth/register').send({ name: 'Ann', email: 'dup@example.com', password: 'password123' });
    const res = await api().post('/auth/register').send({ name: 'Bee', email: 'DUP@example.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('register validates input', async () => {
    const res = await api().post('/auth/register').send({ name: 'X', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    const fields = res.body.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  test('login works with the right password', async () => {
    await api().post('/auth/register').send({ name: 'Omar', email: 'omar@example.com', password: 'password123' });
    const res = await api().post('/auth/login').send({ email: 'omar@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Omar');
  });

  test('login gives the same error for a wrong password and an unknown email', async () => {
    await api().post('/auth/register').send({ name: 'Omar', email: 'omar@example.com', password: 'password123' });
    const wrong = await api().post('/auth/login').send({ email: 'omar@example.com', password: 'wrongpass' });
    const unknown = await api().post('/auth/login').send({ email: 'ghost@example.com', password: 'whatever1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  test('GET /auth/me needs a valid token', async () => {
    expect((await api().get('/auth/me')).status).toBe(401);
    expect((await api().get('/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
    const { auth, user } = await createUser('librarian');
    const res = await api().get('/auth/me').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, role: 'librarian' });
  });

  test('malformed JSON returns 400, not 500', async () => {
    const res = await api().post('/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
  });
});
