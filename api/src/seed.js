/**
 * Loads demo data: 3 users (one per role), 8 categories, ~320 books and some loans.
 * Safe to run more than once (existing rows are left alone).
 * Usage: SEED_DEMO_PASSWORD=... node src/seed.js
 */
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './db.js';

const password = process.env.SEED_DEMO_PASSWORD;
if (!password || password.length < 8) {
  console.error('Set SEED_DEMO_PASSWORD (8+ characters) to seed demo users.');
  process.exit(1);
}

const categories = ['Computer Science', 'Software Engineering', 'Mathematics', 'Physics', 'Business', 'Literature', 'History', 'Design'];

const subjects = {
  'Computer Science': ['Algorithms', 'Data Structures', 'Operating Systems', 'Computer Networks', 'Databases', 'Compilers', 'Machine Learning', 'Distributed Systems'],
  'Software Engineering': ['Clean Architecture', 'Testing', 'DevOps', 'Cloud Computing', 'Microservices', 'Requirements', 'Agile Delivery', 'Refactoring'],
  Mathematics: ['Linear Algebra', 'Calculus', 'Discrete Mathematics', 'Probability', 'Statistics', 'Number Theory', 'Optimisation', 'Graph Theory'],
  Physics: ['Mechanics', 'Electromagnetism', 'Thermodynamics', 'Quantum Physics', 'Optics', 'Relativity', 'Astrophysics', 'Electronics'],
  Business: ['Accounting', 'Marketing', 'Entrepreneurship', 'Finance', 'Project Management', 'Economics', 'Leadership', 'Operations'],
  Literature: ['Poetry', 'The Modern Novel', 'Drama', 'Short Stories', 'Urdu Literature', 'World Classics', 'Creative Writing', 'Literary Theory'],
  History: ['Ancient Civilisations', 'The Mughal Era', 'The Industrial Age', 'South Asia', 'The Silk Road', 'World Wars', 'The Cold War', 'Science History'],
  Design: ['Typography', 'Interaction Design', 'Colour Theory', 'User Research', 'Visual Communication', 'Accessibility', 'Information Design', 'Product Design'],
};
const prefixes = ['Introduction to', 'Principles of', 'A Practical Guide to', 'Foundations of', 'Advanced'];
const firstNames = ['Ayesha', 'Bilal', 'Fatima', 'Hamza', 'Sara', 'Omar', 'Zainab', 'Usman', 'Maria', 'Daniel', 'Grace', 'Ali'];
const lastNames = ['Khan', 'Ahmed', 'Malik', 'Raza', 'Hussain', 'Smith', 'Chen', 'Siddiqui', 'Iqbal', 'Garcia', 'Patel', 'Qureshi'];

// Deterministic pseudo-random numbers, so every seed produces the same catalogue.
let s = 42;
const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function isbn13(n) {
  const base = `978${String(1000000000 + n).slice(-9)}`;
  const sum = [...base].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
}

await withTransaction(async (c) => {
  const hash = await bcrypt.hash(password, 10);
  const demoUsers = [
    ['Mona Member', 'member@campusshelf.test', 'member'],
    ['Liam Librarian', 'librarian@campusshelf.test', 'librarian'],
    ['Ada Admin', 'admin@campusshelf.test', 'admin'],
  ];
  for (const [name, email, role] of demoUsers) {
    await c.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT ((lower(email))) DO NOTHING`,
      [name, email, hash, role],
    );
  }

  for (const name of categories) {
    await c.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT ((lower(name))) DO NOTHING', [name]);
  }
  const cats = (await c.query('SELECT id, name FROM categories')).rows;

  let n = 0;
  for (const cat of cats) {
    for (const subject of subjects[cat.name] || []) {
      for (const prefix of prefixes) {
        n += 1;
        const copies = 1 + Math.floor(rand() * 4);
        await c.query(
          `INSERT INTO books (isbn, title, author, category_id, published_year, description, copies_total, copies_available)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7) ON CONFLICT (isbn) DO NOTHING`,
          [
            isbn13(n),
            `${prefix} ${subject}`,
            `${pick(firstNames)} ${pick(lastNames)}`,
            cat.id,
            1990 + Math.floor(rand() * 36),
            `${prefix} ${subject.toLowerCase()}, written for ${cat.name.toLowerCase()} students.`,
            copies,
          ],
        );
      }
    }
  }

  // A few loans for the demo member, including one overdue, if they have none yet.
  const member = (await c.query("SELECT id FROM users WHERE email = 'member@campusshelf.test'")).rows[0];
  const has = await c.query('SELECT 1 FROM loans WHERE user_id = $1 LIMIT 1', [member.id]);
  if (!has.rowCount) {
    const books = (await c.query('SELECT id FROM books WHERE copies_available > 0 ORDER BY id LIMIT 3')).rows;
    const plans = [
      ["now() - interval '20 days'", "now() - interval '6 days'"], // overdue
      ["now() - interval '3 days'", "now() + interval '11 days'"],
      ["now() - interval '1 day'", "now() + interval '13 days'"],
    ];
    for (const [i, b] of books.entries()) {
      await c.query(`INSERT INTO loans (user_id, book_id, borrowed_at, due_at) VALUES ($1, $2, ${plans[i][0]}, ${plans[i][1]})`, [member.id, b.id]);
      await c.query('UPDATE books SET copies_available = copies_available - 1 WHERE id = $1', [b.id]);
    }
  }
  console.log(JSON.stringify({ level: 'info', msg: 'seed complete', booksConsidered: n }));
});

await pool.end();
