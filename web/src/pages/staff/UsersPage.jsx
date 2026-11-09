import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { formatDate } from '../../lib/format.js';
import { Alert, PageHeader, Spinner } from '../../components/ui.jsx';

export default function UsersPage() {
  const { user: me } = useAuth();
  const users = useAsync(() => api('/users'), []);
  const [msg, setMsg] = useState({ kind: '', text: '' });

  async function changeRole(u, role) {
    setMsg({ kind: '', text: '' });
    try {
      await api(`/users/${u.id}/role`, { method: 'PATCH', body: { role } });
      setMsg({ kind: 'success', text: `${u.name} is now a ${role}.` });
      users.reload();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  return (
    <>
      <PageHeader title="Users" subtitle="Grant librarian or admin access" />
      <div className="mb-4"><Alert kind={msg.kind || 'error'}>{msg.text || users.error?.message}</Alert></div>
      {users.loading && <Spinner />}
      {users.data && (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Name</th>
                <th className="table-head">Email</th>
                <th className="table-head">Joined</th>
                <th className="table-head">On loan</th>
                <th className="table-head">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td className="table-cell font-medium">{u.name}</td>
                  <td className="table-cell">{u.email}</td>
                  <td className="table-cell">{formatDate(u.createdAt)}</td>
                  <td className="table-cell">{u.activeLoans}</td>
                  <td className="table-cell">
                    <select className="input w-36" aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id === me.id} onChange={(e) => changeRole(u, e.target.value)}>
                      <option value="member">Member</option>
                      <option value="librarian">Librarian</option>
                      <option value="admin">Admin</option>
                    </select>
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
