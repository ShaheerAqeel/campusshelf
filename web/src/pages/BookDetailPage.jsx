import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAsync } from '../lib/useAsync.js';
import { formatDate } from '../lib/format.js';
import { spineColor } from '../lib/spine.js';
import { Alert, Spinner } from '../components/ui.jsx';

export default function BookDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const book = useAsync(() => api(`/books/${id}`), [id]);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function borrow() {
    if (!user) return navigate('/login', { state: { from: `/books/${id}` } });
    setBusy(true);
    setMsg({ kind: '', text: '' });
    try {
      const loan = await api('/loans', { method: 'POST', body: { bookId: Number(id) } });
      setMsg({ kind: 'success', text: `Borrowed. Please return it by ${formatDate(loan.dueAt)}.` });
      book.reload();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (book.loading) return <Spinner label="Loading book" />;
  if (book.error) return <Alert>{book.error.status === 404 ? 'This book is not in the catalogue.' : book.error.message}</Alert>;
  const b = book.data;

  return (
    <div className="grid gap-8 md:grid-cols-[220px_1fr]">
      <div className="card flex aspect-[2/3] items-end overflow-hidden p-5 text-paper" style={{ backgroundColor: spineColor(b.id) }} aria-hidden="true">
        <p className="font-serif text-xl leading-tight">{b.title}</p>
      </div>
      <div>
        <Link to="/" className="text-sm text-forest underline">Back to catalogue</Link>
        {b.categoryName && <p className="mt-4 text-xs font-medium tracking-wide text-muted uppercase">{b.categoryName}</p>}
        <h1 className="mt-1 text-4xl">{b.title}</h1>
        <p className="mt-2 text-lg text-muted">by {b.author}</p>

        <dl className="mt-6 grid max-w-md grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted">ISBN</dt>
          <dd>{b.isbn}</dd>
          {b.publishedYear && (
            <>
              <dt className="text-muted">Published</dt>
              <dd>{b.publishedYear}</dd>
            </>
          )}
          <dt className="text-muted">Availability</dt>
          <dd>
            {b.copiesAvailable} of {b.copiesTotal} copies
          </dd>
        </dl>

        {b.description && <p className="mt-6 max-w-prose leading-relaxed">{b.description}</p>}

        <div className="mt-8 max-w-md space-y-3">
          <Alert kind={msg.kind || 'error'}>{msg.text}</Alert>
          <button className="btn-primary" onClick={borrow} disabled={busy || b.copiesAvailable < 1}>
            {b.copiesAvailable < 1 ? 'All copies on loan' : busy ? 'Borrowing...' : user ? 'Borrow for 14 days' : 'Log in to borrow'}
          </button>
        </div>
      </div>
    </div>
  );
}
