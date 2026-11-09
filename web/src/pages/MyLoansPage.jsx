import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { dueLabel, formatDate } from '../lib/format.js';
import { Alert, EmptyState, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';

export default function MyLoansPage() {
  const loans = useAsync(() => api('/loans/mine'), []);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function returnLoan(id) {
    setBusyId(id);
    setError('');
    try {
      await api(`/loans/${id}/return`, { method: 'POST' });
      loans.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const active = loans.data?.filter((l) => !l.returnedAt) || [];
  const past = loans.data?.filter((l) => l.returnedAt) || [];

  return (
    <>
      <PageHeader title="My loans" subtitle={loans.data ? `${active.length} on loan, ${active.filter((l) => l.overdue).length} overdue` : ''} />
      <Alert>{error || loans.error?.message}</Alert>
      {loans.loading && <Spinner label="Loading your loans" />}

      {loans.data && active.length === 0 && (
        <EmptyState title="You have no books on loan">
          <Link to="/" className="text-forest underline">Browse the catalogue</Link>
        </EmptyState>
      )}

      {active.length > 0 && (
        <ul className="space-y-3">
          {active.map((l) => (
            <li key={l.id} className={`card flex flex-wrap items-center gap-4 p-4 ${l.overdue ? 'border-brick/40' : ''}`}>
              <div className="min-w-60 flex-1">
                <Link to={`/books/${l.bookId}`} className="font-serif text-lg hover:text-forest">{l.bookTitle}</Link>
                <p className="text-sm text-muted">{l.bookAuthor} · borrowed {formatDate(l.borrowedAt)}</p>
              </div>
              <StatusBadge loan={l} />
              <span className={`text-sm ${l.overdue ? 'font-medium text-brick' : 'text-muted'}`}>{dueLabel(l.dueAt)}</span>
              <button className="btn-secondary" onClick={() => returnLoan(l.id)} disabled={busyId === l.id}>
                {busyId === l.id ? 'Returning...' : 'Return'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl">History</h2>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-head">Book</th>
                  <th className="table-head">Borrowed</th>
                  <th className="table-head">Returned</th>
                </tr>
              </thead>
              <tbody>
                {past.map((l) => (
                  <tr key={l.id}>
                    <td className="table-cell">{l.bookTitle}</td>
                    <td className="table-cell">{formatDate(l.borrowedAt)}</td>
                    <td className="table-cell">{formatDate(l.returnedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
