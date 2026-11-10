import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { roleLabel } from '../lib/format.js';

const linkClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-forest/10 text-forest' : 'text-ink/80 hover:text-forest'}`;

export default function Layout() {
  const { user, isStaff, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = [
    { to: '/', label: 'Catalogue', end: true },
    ...(user ? [{ to: '/loans', label: 'My loans' }] : []),
    ...(isStaff
      ? [
          { to: '/staff/dashboard', label: 'Dashboard' },
          { to: '/staff/books', label: 'Manage books' },
          { to: '/staff/loans', label: 'All loans' },
        ]
      : []),
    ...(user?.role === 'admin' ? [{ to: '/admin/users', label: 'Users' }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="flex items-center gap-2" aria-label="CampusShelf home">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="font-serif text-xl font-semibold">CampusShelf</span>
          </Link>

          <button className="ml-auto btn-secondary md:hidden" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen((o) => !o)}>
            Menu
          </button>

          <nav id="main-nav" className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-14 z-10 flex-col gap-1 border-b border-line bg-card p-4 md:static md:flex md:flex-row md:border-0 md:bg-transparent md:p-0`}>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass} onClick={() => setOpen(false)}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:ml-auto md:flex">
            {user ? (
              <>
                <span className="text-sm text-muted">
                  {user.name} <span className="badge bg-amber/25 text-ink">{roleLabel[user.role]}</span>
                </span>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">
                  Log in
                </Link>
                <Link to="/register" className="btn-primary">
                  Join
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        CampusShelf v1.5 · SE-490 Cloud Computing CEA · Three-tier app on AWS
      </footer>
    </div>
  );
}
