import { pool } from '../src/db.js';
import { api, closeDb, createBook, createUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(closeDb);

const newBook = { isbn: '978-0-13-468599-1', title: 'The Pragmatic Programmer', author: 'Hunt and Thomas', copiesTotal: 3 };

describe('catalogue', () => {
  test('anyone can list and search books with pagination', async () => {
    await createBook({ title: 'Cloud Computing Basics' });
    await createBook({ title: 'Linear Algebra' });
    await createBook({ title: 'Cloud Security' });

    const all = await api().get('/books');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);

    const search = await api().get('/books?search=cloud&pageSize=1&page=2');
    expect(search.body.total).toBe(2);
    expect(search.body.items).toHaveLength(1);
    expect(search.body.items[0].title).toBe('Cloud Security');
  });

  test('available=true hides books with no free copies', async () => {
    await createBook({ title: 'Free', copies: 1 });
    await createBook({ title: 'Gone', copies: 0 });
    const res = await api().get('/books?available=true');
    expect(res.body.items.map((b) => b.title)).toEqual(['Free']);
  });

  test('invalid query parameters return 400', async () => {
    expect((await api().get('/books?pageSize=500')).status).toBe(400);
    expect((await api().get('/books/abc')).status).toBe(400);
  });

  test('a member cannot create books', async () => {
    const { auth } = await createUser('member');
    expect((await api().post('/books').set(auth).send(newBook)).status).toBe(403);
    expect((await api().post('/books').send(newBook)).status).toBe(401);
  });

  test('a librarian can create, update and archive a book', async () => {
    const { auth } = await createUser('librarian');
    const created = await api().post('/books').set(auth).send(newBook);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: newBook.title, copiesTotal: 3, copiesAvailable: 3 });

    const dup = await api().post('/books').set(auth).send(newBook);
    expect(dup.status).toBe(409);

    const updated = await api().put(`/books/${created.body.id}`).set(auth).send({ ...newBook, copiesTotal: 5 });
    expect(updated.status).toBe(200);
    expect(updated.body.copiesAvailable).toBe(5);

    const archived = await api().delete(`/books/${created.body.id}`).set(auth);
    expect(archived.status).toBe(204);
    expect((await api().get(`/books/${created.body.id}`)).status).toBe(404);
  });

  test('copies cannot be reduced below the number on loan', async () => {
    const lib = await createUser('librarian');
    const m1 = await createUser('member');
    const m2 = await createUser('member');
    const id = await createBook({ copies: 3 });
    await api().post('/loans').set(m1.auth).send({ bookId: id });
    await api().post('/loans').set(m2.auth).send({ bookId: id });

    const res = await api().put(`/books/${id}`).set(lib.auth).send({ ...newBook, copiesTotal: 1 });
    expect(res.status).toBe(409);

    const ok = await api().put(`/books/${id}`).set(lib.auth).send({ ...newBook, copiesTotal: 2 });
    expect(ok.status).toBe(200);
    expect(ok.body.copiesAvailable).toBe(0);
  });

  test('a book with copies on loan cannot be archived', async () => {
    const lib = await createUser('librarian');
    const m = await createUser('member');
    const id = await createBook();
    await api().post('/loans').set(m.auth).send({ bookId: id });
    expect((await api().delete(`/books/${id}`).set(lib.auth)).status).toBe(409);
  });

  test('categories list includes book counts, and librarians can add one', async () => {
    const lib = await createUser('librarian');
    const created = await api().post('/categories').set(lib.auth).send({ name: 'Cloud' });
    expect(created.status).toBe(201);
    await createBook({ categoryId: created.body.id });
    const list = await api().get('/categories');
    expect(list.body).toEqual([{ id: created.body.id, name: 'Cloud', bookCount: 1 }]);
    expect((await api().post('/categories').set(lib.auth).send({ name: 'cloud' })).status).toBe(409);
  });

  test('the book detail includes the category name', async () => {
    const { rows } = await pool.query("INSERT INTO categories (name) VALUES ('Physics') RETURNING id");
    const id = await createBook({ categoryId: rows[0].id });
    const res = await api().get(`/books/${id}`);
    expect(res.body.categoryName).toBe('Physics');
  });
});
