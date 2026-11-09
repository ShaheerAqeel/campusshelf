import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Alert, PageHeader, Spinner } from '../../components/ui.jsx';

const tones = { ink: 'text-ink', forest: 'text-forest', brick: 'text-brick' };

function Stat({ label, value, tone = 'ink', to }) {
  const body = (
    <div className="card p-5">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className={`mt-2 font-serif text-4xl ${tones[tone]}`}>{value}</p>
    </div>
  );
  return to ? <Link to={to} className="block hover:opacity-90">{body}</Link> : body;
}

export default function DashboardPage() {
  const stats = useAsync(() => api('/stats'), []);
  if (stats.loading) return <Spinner label="Loading statistics" />;
  if (stats.error) return <Alert>{stats.error.message}</Alert>;
  const s = stats.data;
  const maxCat = Math.max(1, ...s.loansByCategory.map((c) => c.loans));

  return (
    <>
      <PageHeader title="Library dashboard" subtitle="Live figures from the database" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Titles" value={s.titles} />
        <Stat label="Copies" value={s.copies} />
        <Stat label="On loan" value={s.activeLoans} tone="forest" to="/staff/loans" />
        <Stat label="Overdue" value={s.overdueLoans} tone="brick" to="/staff/loans?status=overdue" />
        <Stat label="Members" value={s.members} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 text-xl">Most borrowed</h2>
          {s.mostBorrowed.length === 0 ? (
            <p className="text-sm text-muted">No loans yet.</p>
          ) : (
            <ol className="space-y-2">
              {s.mostBorrowed.map((b, i) => (
                <li key={b.id} className="flex items-baseline gap-3 text-sm">
                  <span className="font-serif text-lg text-muted">{i + 1}</span>
                  <Link to={`/books/${b.id}`} className="flex-1 hover:text-forest">{b.title}</Link>
                  <span className="text-muted">{b.timesBorrowed}×</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-4 text-xl">Loans by category</h2>
          {s.loansByCategory.length === 0 ? (
            <p className="text-sm text-muted">No loans yet.</p>
          ) : (
            <ul className="space-y-3">
              {s.loansByCategory.map((c) => (
                <li key={c.category} className="text-sm">
                  <div className="mb-1 flex justify-between">
                    <span>{c.category}</span>
                    <span className="text-muted">{c.loans}</span>
                  </div>
                  <div className="h-2 rounded-full bg-line/60">
                    <div className="h-2 rounded-full bg-forest" style={{ width: `${(c.loans / maxCat) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
