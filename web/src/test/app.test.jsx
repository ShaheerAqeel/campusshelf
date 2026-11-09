import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import BookCard from '../components/BookCard.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { LoginPage } from '../pages/AuthPages.jsx';
import { api, tokenStore } from '../lib/api.js';
import { dueLabel } from '../lib/format.js';

function jsonResponse(status, body) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

function renderAt(path, routes) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>{routes}</Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  test('calls /api with the bearer token and query string', async () => {
    tokenStore.set('abc');
    fetch.mockReturnValue(jsonResponse(200, { items: [] }));
    await api('/books', { query: { search: 'cloud', page: 2, empty: '' } });
    const [url, opts] = fetch.mock.calls[0];
    expect(url.pathname).toBe('/api/books');
    expect(url.search).toBe('?search=cloud&page=2');
    expect(opts.headers.Authorization).toBe('Bearer abc');
  });

  test('throws an ApiError with the server message and validation details', async () => {
    fetch.mockReturnValue(jsonResponse(400, { error: 'Validation failed', details: [{ field: 'email', message: 'Invalid email' }] }));
    await expect(api('/auth/register', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400,
      message: 'Validation failed: email Invalid email',
    });
  });
});

describe('BookCard', () => {
  test('shows availability', () => {
    render(
      <MemoryRouter>
        <BookCard book={{ id: 1, title: 'Cloud Basics', author: 'A. Khan', copiesAvailable: 2, copiesTotal: 3, categoryName: 'Computing' }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('2 of 3 available')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/books/1');
  });

  test('shows when every copy is on loan', () => {
    render(
      <MemoryRouter>
        <BookCard book={{ id: 2, title: 'Gone', author: 'B', copiesAvailable: 0, copiesTotal: 1 }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('All copies on loan')).toBeInTheDocument();
  });
});

describe('ProtectedRoute', () => {
  const routes = (
    <>
      <Route path="/login" element={<p>login page</p>} />
      <Route path="/" element={<p>home page</p>} />
      <Route element={<ProtectedRoute roles={['librarian']} />}>
        <Route path="/staff" element={<p>staff page</p>} />
      </Route>
    </>
  );

  test('sends anonymous visitors to the login page', () => {
    renderAt('/staff', routes);
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  test('keeps members out of staff pages', async () => {
    tokenStore.set('t');
    fetch.mockReturnValue(jsonResponse(200, { user: { id: 1, name: 'M', role: 'member' } }));
    renderAt('/staff', routes);
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  test('lets librarians in', async () => {
    tokenStore.set('t');
    fetch.mockReturnValue(jsonResponse(200, { user: { id: 2, name: 'L', role: 'librarian' } }));
    renderAt('/staff', routes);
    expect(await screen.findByText('staff page')).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  const routes = (
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<p>home page</p>} />
    </>
  );

  test('shows the server error for a wrong password', async () => {
    fetch.mockReturnValue(jsonResponse(401, { error: 'Invalid email or password' }));
    renderAt('/login', routes);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(tokenStore.get()).toBeNull();
  });

  test('stores the token and redirects after a successful login', async () => {
    fetch.mockReturnValue(jsonResponse(200, { token: 'jwt-123', user: { id: 1, name: 'Sara', role: 'member' } }));
    renderAt('/login', routes);
    await userEvent.type(screen.getByLabelText('Email'), 'sara@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(screen.getByText('home page')).toBeInTheDocument());
    expect(tokenStore.get()).toBe('jwt-123');
  });
});

describe('dueLabel', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  test.each([
    ['2026-11-13T12:00:00Z', 'Due in 3 days'],
    ['2026-11-11T12:00:00Z', 'Due tomorrow'],
    ['2026-11-10T12:00:00Z', 'Due today'],
    ['2026-11-09T12:00:00Z', '1 day overdue'],
    ['2026-11-06T12:00:00Z', '4 days overdue'],
  ])('%s -> %s', (due, label) => expect(dueLabel(due, now)).toBe(label));
});
