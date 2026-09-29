import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertTriangle, Plus, UserX, ShieldCheck, Trash2 } from 'lucide-react';
import { Role, useAuth } from '../../context/AuthContext';

interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
}

const ROLE_NOTE: Record<Role, string> = {
  owner: 'Everything, including cost, markup and profit',
  sales: 'Quotes and customers. Never sees cost or margin',
  production: 'Stock and orders. No pricing at all'
};

const F = 'w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25';
const L = 'block text-[11px] font-bold text-slate-600 mb-1';

export const UsersModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', password: '', role: 'sales' as Role });

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await fetch('/api/auth/users').then(r => r.json());
      if (d.error) throw new Error(d.error);
      setUsers(d);
    } catch (e: any) {
      setError(e.message || 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setError(null);
    setBusyId('new');
    try {
      const r = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDraft({ name: '', email: '', password: '', role: 'sales' });
      setAdding(false);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not create that account.');
    } finally {
      setBusyId(null);
    }
  };

  const update = async (u: ManagedUser, patch: Partial<{ role: Role; active: boolean }>) => {
    setError(null);
    setBusyId(u.id);
    try {
      const r = await fetch(`/api/auth/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not update that account.');
    } finally {
      setBusyId(null);
    }
  };

  const deactivate = async (u: ManagedUser) => {
    if (!window.confirm(`Stop ${u.name} from signing in?\n\nTheir account is kept so past activity still names them.`)) return;
    setError(null);
    setBusyId(u.id);
    try {
      const r = await fetch(`/api/auth/users/${u.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not remove that account.');
    } finally {
      setBusyId(null);
    }
  };

  /*
   * Rendered into document.body rather than where it is called from.
   * The navbar carries backdrop-blur, and a backdrop-filter makes that
   * element the containing block for any fixed-position descendant, which
   * squeezed this modal into the 64px-tall header instead of the viewport.
   */
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">People &amp; access</h2>
            <p className="text-[11px] text-slate-500">
              Cost and profit are sent only to owners — the API withholds them from everyone else.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left font-bold px-3 py-2">Person</th>
                    <th className="text-left font-bold px-3 py-2 w-44">Role</th>
                    <th className="text-left font-bold px-3 py-2 w-32">Last signed in</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(u => (
                    <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-800">
                          {u.name}
                          {u.id === me?.id && <span className="text-[10px] text-slate-400 font-medium"> (you)</span>}
                          {!u.active && <span className="text-[10px] text-rose-600 font-bold"> · disabled</span>}
                        </div>
                        <div className="text-[11px] text-slate-500">{u.email}</div>
                      </td>
                      <td className="px-3 py-2">
                        {busyId === u.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                        ) : (
                          <>
                            <select className={F} value={u.role} disabled={!u.active}
                              onChange={e => update(u, { role: e.target.value as Role })}>
                              <option value="owner">Owner</option>
                              <option value="sales">Sales</option>
                              <option value="production">Production</option>
                            </select>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{ROLE_NOTE[u.role]}</p>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-500">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-GB') : 'Never'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {u.id !== me?.id && (
                          u.active ? (
                            <button onClick={() => deactivate(u)} title="Stop this person signing in"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button onClick={() => update(u, { active: true })} title="Let this person sign in again"
                              className="px-2 py-1 rounded text-[10px] font-bold text-emerald-700 hover:bg-emerald-50">
                              Restore
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {adding ? (
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">New account</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>Name</label>
                  <input className={F} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div>
                  <label className={L}>Email</label>
                  <input type="email" className={F} value={draft.email}
                    onChange={e => setDraft({ ...draft, email: e.target.value })} />
                </div>
                <div>
                  <label className={L}>Temporary password</label>
                  <input className={F} value={draft.password} placeholder="At least 10 characters"
                    onChange={e => setDraft({ ...draft, password: e.target.value })} />
                </div>
                <div>
                  <label className={L}>Role</label>
                  <select className={F} value={draft.role}
                    onChange={e => setDraft({ ...draft, role: e.target.value as Role })}>
                    <option value="sales">Sales</option>
                    <option value="production">Production</option>
                    <option value="owner">Owner</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-0.5">{ROLE_NOTE[draft.role]}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setAdding(false)}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
                  Cancel
                </button>
                <button onClick={create} disabled={busyId === 'new'}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                  {busyId === 'new' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create account
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add someone
            </button>
          )}

          <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0 text-emerald-600" />
            Changing a role or disabling an account signs that person out immediately.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
