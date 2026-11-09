import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { requireAuth, requireRole, STAFF } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.coerce.number().int().positive().optional(),
  available: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const bookBody = z.object({
  isbn: z
    .string()
    .trim()
    .regex(/^[0-9X-]{10,17}$/, 'ISBN must be 10-17 digits, dashes or X'),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(150),
  categoryId: z.number().int().positive().nullable().optional(),
  publishedYear: z.number().int().min(1000).max(2100).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  coverUrl: z.string().trim().url().max(500).nullable().optional(),
  copiesTotal: z.number().int().min(0).max(1000),
});

const SELECT_BOOK = `
  SELECT b.id, b.isbn, b.title, b.author, b.category_id AS "categoryId", c.name AS "categoryName",
         b.published_year AS "publishedYear", b.description, b.cover_url AS "coverUrl",
         b.copies_total AS "copiesTotal", b.copies_available AS "copiesAvailable", b.archived
  FROM books b LEFT JOIN categories c ON c.id = b.category_id`;

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { search, category, available, page, pageSize } = req.valid.query;
  const where = ['b.archived = false'];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    where.push(`(b.title ILIKE $${params.length} OR b.author ILIKE $${params.length} OR b.isbn ILIKE $${params.length})`);
  }
  if (category) {
    params.push(category);
    where.push(`b.category_id = $${params.length}`);
  }
  if (available === 'true') where.push('b.copies_available > 0');

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = await query(`SELECT count(*)::int AS n FROM books b ${whereSql}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query(
    `${SELECT_BOOK} ${whereSql} ORDER BY b.title ASC, b.id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ items: rows, page, pageSize, total: total.rows[0].n });
});

router.get('/:id', validate(idSchema, 'params'), async (req, res) => {
  const { rows } = await query(`${SELECT_BOOK} WHERE b.id = $1 AND b.archived = false`, [req.valid.params.id]);
  if (!rows.length) throw notFound('Book not found');
  res.json(rows[0]);
});

router.post('/', requireAuth, requireRole(...STAFF), validate(bookBody), async (req, res) => {
  const b = req.valid.body;
  const dup = await query('SELECT 1 FROM books WHERE isbn = $1', [b.isbn]);
  if (dup.rowCount) throw conflict('A book with this ISBN already exists');
  const { rows } = await query(
    `INSERT INTO books (isbn, title, author, category_id, published_year, description, cover_url, copies_total, copies_available)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
    [b.isbn, b.title, b.author, b.categoryId ?? null, b.publishedYear ?? null, b.description ?? null, b.coverUrl ?? null, b.copiesTotal],
  );
  const created = await query(`${SELECT_BOOK} WHERE b.id = $1`, [rows[0].id]);
  res.status(201).json(created.rows[0]);
});

router.put('/:id', requireAuth, requireRole(...STAFF), validate(idSchema, 'params'), validate(bookBody), async (req, res) => {
  const { id } = req.valid.params;
  const b = req.valid.body;
  await withTransaction(async (client) => {
    const cur = await client.query('SELECT copies_total, copies_available FROM books WHERE id = $1 AND archived = false FOR UPDATE', [id]);
    if (!cur.rowCount) throw notFound('Book not found');
    const onLoan = cur.rows[0].copies_total - cur.rows[0].copies_available;
    if (b.copiesTotal < onLoan) throw conflict(`Cannot set copies below the ${onLoan} currently on loan`);
    const clash = await client.query('SELECT 1 FROM books WHERE isbn = $1 AND id <> $2', [b.isbn, id]);
    if (clash.rowCount) throw conflict('A book with this ISBN already exists');
    await client.query(
      `UPDATE books SET isbn=$1, title=$2, author=$3, category_id=$4, published_year=$5, description=$6, cover_url=$7,
              copies_total=$8::int, copies_available=$8::int - $9::int, updated_at=now()
       WHERE id=$10`,
      [b.isbn, b.title, b.author, b.categoryId ?? null, b.publishedYear ?? null, b.description ?? null, b.coverUrl ?? null, b.copiesTotal, onLoan, id],
    );
  });
  const { rows } = await query(`${SELECT_BOOK} WHERE b.id = $1`, [id]);
  res.json(rows[0]);
});

// Archive rather than delete, so loan history stays intact.
router.delete('/:id', requireAuth, requireRole(...STAFF), validate(idSchema, 'params'), async (req, res) => {
  const { id } = req.valid.params;
  const active = await query('SELECT 1 FROM loans WHERE book_id = $1 AND returned_at IS NULL LIMIT 1', [id]);
  if (active.rowCount) throw conflict('This book has copies on loan. Wait until they are returned.');
  const { rowCount } = await query('UPDATE books SET archived = true, updated_at = now() WHERE id = $1 AND archived = false', [id]);
  if (!rowCount) throw notFound('Book not found');
  res.status(204).end();
});

export default router;
