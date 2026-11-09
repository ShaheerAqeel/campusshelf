import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.created_at AS "createdAt",
            count(l.id) FILTER (WHERE l.returned_at IS NULL)::int AS "activeLoans"
     FROM users u LEFT JOIN loans l ON l.user_id = u.id
     GROUP BY u.id ORDER BY u.created_at DESC`,
  );
  res.json(rows);
});

router.patch(
  '/:id/role',
  validate(z.object({ id: z.coerce.number().int().positive() }), 'params'),
  validate(z.object({ role: z.enum(['member', 'librarian', 'admin']) })),
  async (req, res) => {
    const { id } = req.valid.params;
    if (id === req.user.id) throw badRequest('You cannot change your own role');
    const { rows } = await query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role', [req.valid.body.role, id]);
    if (!rows.length) throw notFound('User not found');
    res.json(rows[0]);
  },
);

export default router;
