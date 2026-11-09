import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import BookCard from '../components/BookCard.jsx';
import { Alert, EmptyState, PageHeader, Pagination, Spinner } from '../components/ui.jsx';

export default function CataloguePage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const category = params.get('category') || '';
  const available = params.get('available') === 'true';
  const page = Number(params.get('page') || 1);
  const [draft, setDraft] = useState(search);
  // Keep the search box in sync when the URL changes (back button, links)
  const [lastSearch, setLastSearch] = useState(search);
  if (search !== lastSearch) {
    setLastSearch(search);
    setDraft(search);
  }

  const categories = useAsync(() => api('/categories'), []);
  const books = useAsync(
    () => api('/books', { query: { search, category, available: available ? 'true' : undefined, page, pageSize: 12 } }),
    [search, category, available, page],
  );

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  return (
    <>
      <PageHeader title="Catalogue" subtitle={books.data ? `${books.data.total} titles on the shelf` : 'Browse the campus collection'} />
      {location.state?.denied && <div className="mb-4"><Alert>That page is for library staff only.</Alert></div>}

      <form
        role="search"
        className="card mb-8 flex flex-wrap items-end gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          update({ search: draft.trim() });
        }}
      >
        <div className="min-w-56 flex-1">
          <label htmlFor="search" className="label">Search</label>
          <input id="search" className="input" placeholder="Title, author or ISBN" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <div className="w-52">
          <label htmlFor="category" className="label">Category</label>
          <select id="category" className="input" value={category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.bookCount})
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={available} onChange={(e) => update({ available: e.target.checked ? 'true' : '' })} />
          Available now
        </label>
        <button type="submit" className="btn-primary">Search</button>
      </form>

      {books.loading && <Spinner label="Loading books" />}
      {books.error && <Alert>{books.error.message}</Alert>}
      {books.data && books.data.items.length === 0 && <EmptyState title="No books match your search">Try a different word or clear the filters.</EmptyState>}
      {books.data && books.data.items.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.data.items.map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
          <Pagination page={page} pageSize={books.data.pageSize} total={books.data.total} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
    </>
  );
}
