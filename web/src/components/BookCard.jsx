import { Link } from 'react-router-dom';
import { spineColor } from '../lib/spine.js';

export default function BookCard({ book }) {
  const available = book.copiesAvailable > 0;
  return (
    <Link
      to={`/books/${book.id}`}
      className="card group flex h-full overflow-hidden transition-shadow hover:shadow-md"
      aria-label={`${book.title} by ${book.author}`}
    >
      <div className="w-3 shrink-0" style={{ backgroundColor: spineColor(book.id) }} aria-hidden="true" />
      <div className="flex flex-1 flex-col p-4">
        {book.categoryName && <p className="text-xs font-medium tracking-wide text-muted uppercase">{book.categoryName}</p>}
        <h3 className="mt-1 text-lg leading-snug group-hover:text-forest">{book.title}</h3>
        <p className="mt-1 text-sm text-muted">{book.author}</p>
        <div className="mt-auto pt-4">
          <span className={`badge ${available ? 'bg-forest/10 text-forest' : 'bg-brick/10 text-brick'}`}>
            {available ? `${book.copiesAvailable} of ${book.copiesTotal} available` : 'All copies on loan'}
          </span>
        </div>
      </div>
    </Link>
  );
}
