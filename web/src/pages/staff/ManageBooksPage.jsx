import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Alert, PageHeader, Pagination, Spinner } from '../../components/ui.jsx';

const empty = { isbn: '', title: '', author: '', categoryId: '', publishedYear: '', description: '', copiesTotal: 1 };

function toPayload(f) {
  return {
    isbn: f.isbn.trim(),
    title: f.title.trim(),
    author: f.author.trim(),
    categoryId: f.categoryId ? Number(f.categoryId) : null,
    publishedYear: f.publishedYear ? Number(f.publishedYear) : null,
    description: f.description?.trim() || null,
    copiesTotal: Number(f.copiesTotal),
  };
}

export function BookForm({ initial = empty, categories = [], onSubmit, onCancel, submitLabel }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="card grid gap-4 p-5 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await onSubmit(toPayload(f));
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="sm:col-span-2"><Alert>{error}</Alert></div>
      <div className="sm:col-span-2">
        <label htmlFor="title" className="label">Title</label>
        <input id="title" className="input" required value={f.title} onChange={set('title')} />
      </div>
      <div>
        <label htmlFor="author" className="label">Author</label>
        <input id="author" className="input" required value={f.author} onChange={set('author')} />
      </div>
      <div>
        <label htmlFor="isbn" className="label">ISBN</label>
        <input id="isbn" className="input" required placeholder="978-..." value={f.isbn} onChange={set('isbn')} />
      </div>
      <div>
        <label htmlFor="categoryId" className="label">Category</label>
        <select id="categoryId" className="input" value={f.categoryId ?? ''} onChange={set('categoryId')}>
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="publishedYear" className="label">Year</label>
          <input id="publishedYear" type="number" className="input" value={f.publishedYear ?? ''} onChange={set('publishedYear')} />
        </div>
        <div>
          <label htmlFor="copiesTotal" className="label">Copies</label>
          <input id="copiesTotal" type="number" min="0" className="input" required value={f.copiesTotal} onChange={set('copiesTotal')} />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="description" className="label">Description</label>
        <textarea id="description" rows="3" className="input" value={f.description ?? ''} onChange={set('description')} />
      </div>
      <div className="flex gap-3 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving...' : submitLabel}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function ManageBooksPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | book
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const categories = useAsync(() => api('/categories'), []);
  const books = useAsync(() => api('/books', { query: { search, page, pageSize: 20 } }), [search, page]);

  const done = (text) => {
    setEditing(null);
    setNotice(text);
    books.reload();
  };

  async function archive(b) {
    if (!window.confirm(`Archive "${b.title}"? It will disappear from the catalogue.`)) return;
    setError('');
    try {
      await api(`/books/${b.id}`, { method: 'DELETE' });
      done(`Archived "${b.title}".`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageHeader
        title="Manage books"
        subtitle={books.data ? `${books.data.total} active titles` : ''}
        actions={!editing && <button className="btn-primary" onClick={() => { setNotice(''); setEditing('new'); }}>Add a book</button>}
      />
      <div className="mb-4 space-y-2">
        <Alert kind="success">{notice}</Alert>
        <Alert>{error}</Alert>
      </div>

      {editing && (
        <div className="mb-8">
          <h2 className="mb-3 text-xl">{editing === 'new' ? 'New book' : `Edit "${editing.title}"`}</h2>
          <BookForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? empty : editing}
            categories={categories.data || []}
            submitLabel={editing === 'new' ? 'Add book' : 'Save changes'}
            onCancel={() => setEditing(null)}
            onSubmit={async (payload) => {
              if (editing === 'new') {
                const b = await api('/books', { method: 'POST', body: payload });
                done(`Added "${b.title}".`);
              } else {
                const b = await api(`/books/${editing.id}`, { method: 'PUT', body: payload });
                done(`Saved "${b.title}".`);
              }
            }}
          />
        </div>
      )}

      <input className="input mb-4 max-w-sm" placeholder="Filter by title, author or ISBN" aria-label="Filter books" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
      {books.loading && <Spinner />}
      {books.data && (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Title</th>
                <th className="table-head">Author</th>
                <th className="table-head">ISBN</th>
                <th className="table-head">Available</th>
                <th className="table-head"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {books.data.items.map((b) => (
                <tr key={b.id}>
                  <td className="table-cell font-medium">{b.title}</td>
                  <td className="table-cell">{b.author}</td>
                  <td className="table-cell text-muted">{b.isbn}</td>
                  <td className="table-cell">{b.copiesAvailable} / {b.copiesTotal}</td>
                  <td className="table-cell whitespace-nowrap text-right">
                    <button className="btn-secondary mr-2" onClick={() => { setNotice(''); setEditing(b); }}>Edit</button>
                    <button className="btn-danger" onClick={() => archive(b)}>Archive</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {books.data && <Pagination page={page} pageSize={books.data.pageSize} total={books.data.total} onPage={setPage} />}
    </>
  );
}
