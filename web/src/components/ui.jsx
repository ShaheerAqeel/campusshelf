export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const styles = {
    error: 'border-brick/30 bg-brick/5 text-brick',
    success: 'border-forest/30 bg-forest/5 text-forest',
    info: 'border-line bg-card text-muted',
  };
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${styles[kind]}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-forest border-t-transparent" />
      {label}...
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="card px-6 py-12 text-center">
      <p className="font-serif text-lg">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
      <button className="btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="text-muted">
        Page {page} of {pages}
      </span>
      <button className="btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export function StatusBadge({ loan }) {
  if (loan.returnedAt) return <span className="badge bg-line/60 text-muted">Returned</span>;
  if (loan.overdue) return <span className="badge bg-brick/10 text-brick">Overdue</span>;
  return <span className="badge bg-forest/10 text-forest">On loan</span>;
}
