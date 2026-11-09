import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole, STAFF } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireRole(...STAFF), async (_req, res) => {
  const [totals, popular, byCategory] = await Promise.all([
    query(`
      SELECT
        (SELECT count(*)::int FROM books WHERE archived = false)                                AS "titles",
        (SELECT coalesce(sum(copies_total), 0)::int FROM books WHERE archived = false)           AS "copies",
        (SELECT count(*)::int FROM loans WHERE returned_at IS NULL)                              AS "activeLoans",
        (SELECT count(*)::int FROM loans WHERE returned_at IS NULL AND due_at < now())           AS "overdueLoans",
        (SELECT count(*)::int FROM users WHERE role = 'member')                                  AS "members"`),
    query(`
      SELECT b.id, b.title, b.author, count(l.id)::int AS "timesBorrowed"
      FROM loans l JOIN books b ON b.id = l.book_id
      GROUP BY b.id ORDER BY "timesBorrowed" DESC, b.title LIMIT 5`),
    query(`
      SELECT coalesce(c.name, 'Uncategorised') AS category, count(l.id)::int AS loans
      FROM loans l JOIN books b ON b.id = l.book_id LEFT JOIN categories c ON c.id = b.category_id
      GROUP BY 1 ORDER BY loans DESC`),
  ]);
  res.json({ ...totals.rows[0], mostBorrowed: popular.rows, loansByCategory: byCategory.rows });
});

export default router;
