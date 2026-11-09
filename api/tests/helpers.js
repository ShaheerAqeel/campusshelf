import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { signToken } from '../src/middleware/auth.js';

export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  await pool.query('TRUNCATE loans, books, categories, users RESTART IDENTITY CASCADE');
}

let counter = 0;
const fastHash = bcrypt.hashSync('password123', 4);

/** Insert a user directly and return { user, token, auth } for requests. */
export async function createUser(role = 'member', overrides = {}) {
  counter += 1;
  const { rows } = await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
    [overrides.name || `User ${counter}`, overrides.email || `user${counter}@test.local`, fastHash, role],
  );
  const user = rows[0];
  const token = signToken(user);
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function createBook(overrides = {}) {
  counter += 1;
  const copies = overrides.copies ?? 2;
  const { rows } = await pool.query(
    `INSERT INTO books (isbn, title, author, category_id, copies_total, copies_available)
     VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
    [overrides.isbn || `97800000${String(counter).padStart(5, '0')}`, overrides.title || `Book ${counter}`, overrides.author || 'Test Author', overrides.categoryId ?? null, copies],
  );
  return rows[0].id;
}

export async function closeDb() {
  await pool.end();
}
