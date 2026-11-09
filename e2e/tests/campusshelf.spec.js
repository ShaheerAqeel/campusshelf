import { expect, test } from '@playwright/test';

// Demo users come from `node src/seed.js`; their password is SEED_DEMO_PASSWORD.
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD;
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function login(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
}

test.describe('smoke', () => {
  test('API health through the web tier', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    const db = await request.get('/api/health/db');
    expect(await db.json()).toEqual({ status: 'ok', db: 'up' });
  });

  test('catalogue loads and search works @mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
    await expect(page.getByText(/titles on the shelf/)).toBeVisible();
    await page.getByLabel('Search').fill('cloud');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/search=cloud/);
  });

  test('deep links work (Nginx SPA fallback)', async ({ page }) => {
    const res = await page.goto('/register');
    expect(res.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Join CampusShelf' })).toBeVisible();
  });

  test('unknown API routes return JSON 404, not the SPA', async ({ request }) => {
    const res = await request.get('/api/does-not-exist');
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });
});

test.describe('member journey', () => {
  test('invalid login shows an error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@campusshelf.test');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  });

  test('register, borrow a book, see it in My loans, return it', async ({ page }) => {
    const email = `e2e${unique()}@campusshelf.test`;
    await page.goto('/register');
    await page.getByLabel('Full name').fill('E2E Member');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('E2E Member')).toBeVisible();

    await page.goto('/?available=true');
    const firstBook = page.locator('a[href^="/books/"]').first();
    const title = (await firstBook.locator('h3').textContent()).trim();
    await firstBook.click();
    await page.getByRole('button', { name: 'Borrow for 14 days' }).click();
    await expect(page.getByText(/Borrowed\. Please return it by/)).toBeVisible();

    await page.getByRole('link', { name: 'My loans' }).click();
    const loan = page.getByRole('listitem').filter({ hasText: title });
    await expect(loan).toContainText('Due in 14 days');
    await loan.getByRole('button', { name: 'Return' }).click();
    await expect(page.getByText('You have no books on loan')).toBeVisible();
  });

  test('members cannot open staff pages', async ({ page }) => {
    const email = `e2e${unique()}@campusshelf.test`;
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Curious Member');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Curious Member')).toBeVisible();
    await page.goto('/staff/books');
    await expect(page.getByText('That page is for library staff only.')).toBeVisible();
  });
});

test.describe('librarian journey', () => {
  test.skip(!DEMO_PASSWORD, 'Set E2E_DEMO_PASSWORD (the SEED_DEMO_PASSWORD used when seeding)');

  test('adds a book that then appears in the catalogue', async ({ page }) => {
    await login(page, 'librarian@campusshelf.test', DEMO_PASSWORD);
    await page.getByRole('link', { name: 'Manage books' }).click();
    await page.getByRole('button', { name: 'Add a book' }).click();
    const title = `E2E Cloud Book ${unique()}`;
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Author').fill('Playwright Tester');
    await page.getByLabel('ISBN').fill(`978${unique().slice(-10)}`);
    await page.getByLabel('Copies').fill('2');
    await page.getByRole('button', { name: 'Add book' }).click();
    await expect(page.getByText(`Added "${title}".`)).toBeVisible();

    await page.goto(`/?search=${encodeURIComponent(title)}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  });

  test('sees the dashboard figures', async ({ page }) => {
    await login(page, 'librarian@campusshelf.test', DEMO_PASSWORD);
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Library dashboard' })).toBeVisible();
    await expect(page.getByText('Most borrowed')).toBeVisible();
  });
});
