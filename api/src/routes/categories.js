import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { conflict } from '../errors.js';
import { requireAuth, requireRole, STAFF } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.name, count(b.id) FILTER (WHERE b.archived = false)::int AS "bookCount"
     FROM categories c LEFT JOIN books b ON b.category_id = c.id
     GROUP BY c.id ORDER BY c.name`,
  );
  res.json(rows);
});

router.post('/', requireAuth, requireRole(...STAFF), validate(z.object({ name: z.string().trim().min(2).max(60) })), async (req, res) => {
  const { name } = req.valid.body;
  const dup = await query('SELECT 1 FROM categories WHERE lower(name) = lower($1)', [name]);
  if (dup.rowCount) throw conflict('This category already exists');
  const { rows } = await query('INSERT INTO categories (name) VALUES ($1) RETURNING id, name', [name]);
  res.status(201).json({ ...rows[0], bookCount: 0 });
});

export default router;
