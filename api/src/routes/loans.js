import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { requireAuth, requireRole, STAFF } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

const SELECT_LOAN = `
  SELECT l.id, l.user_id AS "userId", u.name AS "userName", u.email AS "userEmail",
         l.book_id AS "bookId", b.title AS "bookTitle", b.author AS "bookAuthor",
         l.borrowed_at AS "borrowedAt", l.due_at AS "dueAt", l.returned_at AS "returnedAt",
         (l.returned_at IS NULL AND l.due_at < now()) AS overdue
  FROM loans l JOIN users u ON u.id = l.user_id JOIN books b ON b.id = l.book_id`;

/**
 * Borrow a book. The book row is locked (SELECT ... FOR UPDATE) for the length of the
 * transaction, so two requests on two different app instances cannot both take the
 * last copy. Consistency comes from PostgreSQL, not from app memory, which is what
 * makes the application tier safe to scale horizontally.
 */
router.post('/', validate(z.object({ bookId: z.number().int().positive() })), async (req, res) => {
  const { bookId } = req.valid.body;
  const userId = req.user.id;

  const loanId = await withTransaction(async (client) => {
    const book = await client.query('SELECT copies_available FROM books WHERE id = $1 AND archived = false FOR UPDATE', [bookId]);
    if (!book.rowCount) throw notFound('Book not found');
    if (book.rows[0].copies_available < 1) throw conflict('No copies available right now');

    const mine = await client.query('SELECT book_id FROM loans WHERE user_id = $1 AND returned_at IS NULL', [userId]);
    if (mine.rows.some((r) => r.book_id === bookId)) throw conflict('You already have this book on loan');
    if (mine.rowCount >= config.MAX_ACTIVE_LOANS) throw conflict(`You can have at most ${config.MAX_ACTIVE_LOANS} books on loan`);

    await client.query('UPDATE books SET copies_available = copies_available - 1, updated_at = now() WHERE id = $1', [bookId]);
    const ins = await client.query(
      `INSERT INTO loans (user_id, book_id, due_at) VALUES ($1, $2, now() + make_interval(days => $3)) RETURNING id`,
      [userId, bookId, config.LOAN_DAYS],
    );
    return ins.rows[0].id;
  });

  const { rows } = await query(`${SELECT_LOAN} WHERE l.id = $1`, [loanId]);
  res.status(201).json(rows[0]);
});

router.get('/mine', async (req, res) => {
  const { rows } = await query(`${SELECT_LOAN} WHERE l.user_id = $1 ORDER BY l.returned_at IS NOT NULL, l.due_at ASC`, [req.user.id]);
  res.json(rows);
});

router.get(
  '/',
  requireRole(...STAFF),
  validate(z.object({ status: z.enum(['active', 'overdue', 'returned', 'all']).default('active') }), 'query'),
  async (req, res) => {
    const filters = {
      active: 'WHERE l.returned_at IS NULL',
      overdue: 'WHERE l.returned_at IS NULL AND l.due_at < now()',
      returned: 'WHERE l.returned_at IS NOT NULL',
      all: '',
    };
    const { rows } = await query(`${SELECT_LOAN} ${filters[req.valid.query.status]} ORDER BY l.due_at ASC LIMIT 500`);
    res.json(rows);
  },
);

router.post('/:id/return', validate(z.object({ id: z.coerce.number().int().positive() }), 'params'), async (req, res) => {
  const { id } = req.valid.params;
  await withTransaction(async (client) => {
    const loan = await client.query('SELECT user_id, book_id, returned_at FROM loans WHERE id = $1 FOR UPDATE', [id]);
    if (!loan.rowCount) throw notFound('Loan not found');
    const l = loan.rows[0];
    const isStaff = STAFF.includes(req.user.role);
    if (l.user_id !== req.user.id && !isStaff) throw forbidden('You can only return your own loans');
    if (l.returned_at) throw conflict('This loan has already been returned');
    await client.query('UPDATE loans SET returned_at = now() WHERE id = $1', [id]);
    await client.query('UPDATE books SET copies_available = copies_available + 1, updated_at = now() WHERE id = $1', [l.book_id]);
  });
  const { rows } = await query(`${SELECT_LOAN} WHERE l.id = $1`, [id]);
  res.json(rows[0]);
});

export default router;
