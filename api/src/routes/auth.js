import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { conflict, notFound, unauthorized } from '../errors.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// In-memory limiter: counts are per app instance (documented limitation).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.AUTH_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  message: { error: 'Too many attempts, please try again later' },
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
});

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { name, email, password } = req.valid.body;
  const existing = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existing.rowCount) throw conflict('An account with this email already exists');

  const hash = await bcrypt.hash(password, 10);
  // Self-registration always creates a member. Staff roles are granted by an admin.
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'member')
     RETURNING id, name, email, role`,
    [name, email, hash],
  );
  res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.valid.body;
  const { rows } = await query('SELECT id, name, email, role, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  // Same message for unknown email and wrong password, so accounts cannot be enumerated.
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!ok) throw unauthorized('Invalid email or password');
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
  if (!rows.length) throw notFound('User not found');
  res.json({ user: publicUser(rows[0]) });
});

export default router;
