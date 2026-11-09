import { pool } from '../src/db.js';
import { api, closeDb, createBook, createUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(closeDb);

const copiesOf = async (id) => (await pool.query('SELECT copies_available FROM books WHERE id = $1', [id])).rows[0].copies_available;

describe('loans', () => {
  test('borrowing needs a login', async () => {
    const id = await createBook();
    expect((await api().post('/loans').send({ bookId: id })).status).toBe(401);
  });

  test('borrow reduces copies and sets a 14-day due date', async () => {
    const { auth } = await createUser();
    const id = await createBook({ copies: 2 });
    const res = await api().post('/loans').set(auth).send({ bookId: id });
    expect(res.status).toBe(201);
    expect(res.body.overdue).toBe(false);
    const days = (new Date(res.body.dueAt) - new Date(res.body.borrowedAt)) / 86_400_000;
    expect(Math.round(days)).toBe(14);
    expect(await copiesOf(id)).toBe(1);
  });

  test('borrowing a book with no copies returns 409', async () => {
    const { auth } = await createUser();
    const id = await createBook({ copies: 0 });
    expect((await api().post('/loans').set(auth).send({ bookId: id })).status).toBe(409);
  });

  test('a member cannot borrow the same book twice', async () => {
    const { auth } = await createUser();
    const id = await createBook({ copies: 3 });
    await api().post('/loans').set(auth).send({ bookId: id });
    const again = await api().post('/loans').set(auth).send({ bookId: id });
    expect(again.status).toBe(409);
    expect(await copiesOf(id)).toBe(2);
  });

  test('the active-loan limit is enforced', async () => {
    const { auth } = await createUser();
    for (let i = 0; i < 5; i += 1) {
      const id = await createBook();
      expect((await api().post('/loans').set(auth).send({ bookId: id })).status).toBe(201);
    }
    const sixth = await createBook();
    const res = await api().post('/loans').set(auth).send({ bookId: sixth });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/at most 5/);
  });

  test('two members racing for the last copy: exactly one wins', async () => {
    const a = await createUser();
    const b = await createUser();
    const id = await createBook({ copies: 1 });
    const results = await Promise.all([
      api().post('/loans').set(a.auth).send({ bookId: id }),
      api().post('/loans').set(b.auth).send({ bookId: id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await copiesOf(id)).toBe(0);
  });

  test('return gives the copy back, and cannot be done twice', async () => {
    const { auth } = await createUser();
    const id = await createBook({ copies: 1 });
    const loan = await api().post('/loans').set(auth).send({ bookId: id });
    const ret = await api().post(`/loans/${loan.body.id}/return`).set(auth);
    expect(ret.status).toBe(200);
    expect(ret.body.returnedAt).not.toBeNull();
    expect(await copiesOf(id)).toBe(1);
    expect((await api().post(`/loans/${loan.body.id}/return`).set(auth)).status).toBe(409);
  });

  test("a member cannot return someone else's loan, but a librarian can", async () => {
    const owner = await createUser();
    const other = await createUser();
    const lib = await createUser('librarian');
    const id = await createBook();
    const loan = await api().post('/loans').set(owner.auth).send({ bookId: id });
    expect((await api().post(`/loans/${loan.body.id}/return`).set(other.auth)).status).toBe(403);
    expect((await api().post(`/loans/${loan.body.id}/return`).set(lib.auth)).status).toBe(200);
  });

  test('overdue loans are flagged in /loans/mine and in the librarian view', async () => {
    const m = await createUser();
    const lib = await createUser('librarian');
    const id = await createBook();
    await pool.query(
      "INSERT INTO loans (user_id, book_id, borrowed_at, due_at) VALUES ($1, $2, now() - interval '20 days', now() - interval '6 days')",
      [m.user.id, id],
    );
    const mine = await api().get('/loans/mine').set(m.auth);
    expect(mine.body[0].overdue).toBe(true);

    const overdue = await api().get('/loans?status=overdue').set(lib.auth);
    expect(overdue.body).toHaveLength(1);
    expect(overdue.body[0].userEmail).toBe(m.user.email);
  });

  test('members cannot see all loans', async () => {
    const { auth } = await createUser();
    expect((await api().get('/loans').set(auth)).status).toBe(403);
  });
});

describe('stats and users', () => {
  test('librarian stats summarise the library', async () => {
    const lib = await createUser('librarian');
    const m = await createUser();
    const id = await createBook({ copies: 2 });
    await createBook({ copies: 1 });
    await api().post('/loans').set(m.auth).send({ bookId: id });
    const res = await api().get('/stats').set(lib.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ titles: 2, copies: 3, activeLoans: 1, overdueLoans: 0, members: 1 });
    expect(res.body.mostBorrowed[0].id).toBe(id);
  });

  test('only admins manage roles, and not their own', async () => {
    const admin = await createUser('admin');
    const lib = await createUser('librarian');
    const m = await createUser();
    expect((await api().get('/users').set(lib.auth)).status).toBe(403);
    expect((await api().get('/users').set(admin.auth)).body).toHaveLength(3);

    const promote = await api().patch(`/users/${m.user.id}/role`).set(admin.auth).send({ role: 'librarian' });
    expect(promote.status).toBe(200);
    expect(promote.body.role).toBe('librarian');

    expect((await api().patch(`/users/${admin.user.id}/role`).set(admin.auth).send({ role: 'member' })).status).toBe(400);
    expect((await api().patch(`/users/${m.user.id}/role`).set(admin.auth).send({ role: 'superuser' })).status).toBe(400);
  });
});
