import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { dueLabel, formatDate } from '../../lib/format.js';
import { Alert, EmptyState, PageHeader, Spinner, StatusBadge } from '../../components/ui.jsx';

const tabs = [
  { key: 'active', label: 'On loan' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'returned', label: 'Returned' },
];

export default function ManageLoansPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'active';
  const loans = useAsync(() => api('/loans', { query: { status } }), [status]);
  const [error, setError] = useState('');

  async function markReturned(id) {
    setError('');
    try {
      await api(`/loans/${id}/return`, { method: 'POST' });
      loans.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageHeader title="All loans" subtitle="Track who has which book, and chase overdue items" />
      <div className="mb-4 flex gap-2" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={status === t.key} className={status === t.key ? 'btn-primary' : 'btn-secondary'} onClick={() => setParams({ status: t.key })}>
            {t.label}
          </button>
        ))}
      </div>
      <Alert>{error || loans.error?.message}</Alert>
      {loans.loading && <Spinner label="Loading loans" />}
      {loans.data?.length === 0 && <EmptyState title="Nothing here" />}
      {loans.data?.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Member</th>
                <th className="table-head">Book</th>
                <th className="table-head">Borrowed</th>
                <th className="table-head">Due</th>
                <th className="table-head">Status</th>
                <th className="table-head"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {loans.data.map((l) => (
                <tr key={l.id}>
                  <td className="table-cell">
                    <div className="font-medium">{l.userName}</div>
                    <div className="text-xs text-muted">{l.userEmail}</div>
                  </td>
                  <td className="table-cell">{l.bookTitle}</td>
                  <td className="table-cell">{formatDate(l.borrowedAt)}</td>
                  <td className="table-cell">{l.returnedAt ? formatDate(l.dueAt) : dueLabel(l.dueAt)}</td>
                  <td className="table-cell"><StatusBadge loan={l} /></td>
                  <td className="table-cell text-right">
                    {!l.returnedAt && <button className="btn-secondary" onClick={() => markReturned(l.id)}>Mark returned</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
