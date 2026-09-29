import React, { useState } from 'react';
import { Printer, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * The sign-in screen, and the one-time screen that creates the first owner.
 *
 * Nothing ships with a default password: on a system with no accounts the
 * first person to reach it becomes the owner, and the setup route then
 * closes for good.
 */
export const SignIn: React.FC = () => {
  const { signIn, setup, needsSetup } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = needsSetup
      ? await setup(name, email, password)
      : await signIn(email, password);
    if (!result.ok) setError(result.error || 'Something went wrong');
    setBusy(false);
  };

  const F = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400';
  const L = 'block text-[12px] font-bold text-slate-700 mb-1';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans antialiased">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Printer className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-900">
            PrintBerry <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md text-sm font-black">IQ</span>
          </span>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              {needsSetup ? 'Create the owner account' : 'Sign in'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {needsSetup
                ? 'This is the first account, so it becomes the owner. Only owners see cost and profit.'
                : 'Use the account your owner set up for you.'}
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {needsSetup && (
            <div>
              <label className={L}>Your name</label>
              <input className={F} value={name} autoComplete="name" required
                onChange={e => setName(e.target.value)} />
            </div>
          )}

          <div>
            <label className={L}>Email</label>
            <input type="email" className={F} value={email} required
              autoComplete="username" autoFocus={!needsSetup}
              onChange={e => setEmail(e.target.value)} />
          </div>

          <div>
            <label className={L}>Password</label>
            <input type="password" className={F} value={password} required
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              onChange={e => setPassword(e.target.value)} />
            {needsSetup && (
              <p className="text-[11px] text-slate-500 mt-1">At least 10 characters.</p>
            )}
          </div>

          <button type="submit" disabled={busy}
            className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {needsSetup ? 'Create account and sign in' : 'Sign in'}
          </button>
        </form>

        {needsSetup && (
          <p className="flex items-start gap-1.5 text-[11px] text-slate-500 mt-3 px-1">
            <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0 text-emerald-600" />
            Once this account exists, further accounts can only be created by an owner.
          </p>
        )}
      </div>
    </div>
  );
};
