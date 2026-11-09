const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '-');

/** "Due in 3 days", "Due today", "4 days overdue" */
export function dueLabel(dueAt, now = new Date()) {
  const days = Math.ceil((new Date(dueAt) - now) / 86_400_000);
  if (days > 1) return `Due in ${days} days`;
  if (days === 1) return 'Due tomorrow';
  if (days === 0) return 'Due today';
  return `${-days} day${days === -1 ? '' : 's'} overdue`;
}

export const roleLabel = { member: 'Member', librarian: 'Librarian', admin: 'Admin' };
