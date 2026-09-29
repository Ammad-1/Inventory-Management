import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Role = 'owner' | 'sales' | 'production';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthState {
  loading: boolean;
  user: AuthUser | null;
  /** Owner only. The API also strips these figures, so this is for layout. */
  canSeeFinancials: boolean;
  needsSetup: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  setup: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
};

/** Convenience for the many places that only care about one thing. */
export const useCanSeeFinancials = () => useAuth().canSeeFinancials;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [canSeeFinancials, setCanSee] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const d = await fetch('/api/auth/session').then(r => r.json());
      setUser(d.authenticated ? d.user : null);
      setCanSee(!!d.canSeeFinancials);
      setNeedsSetup(!!d.needsSetup);
    } catch {
      // A server that cannot be reached is not the same as being signed out,
      // but there is nothing useful to show either way
      setUser(null);
      setCanSee(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const post = async (path: string, body: unknown) => {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await r.json().catch(() => ({}));
    return { r, d };
  };

  const signIn: AuthState['signIn'] = async (email, password) => {
    const { r, d } = await post('/api/auth/login', { email, password });
    if (!r.ok) return { ok: false, error: d.error || 'Could not sign in' };
    setUser(d.user);
    setCanSee(!!d.canSeeFinancials);
    setNeedsSetup(false);
    return { ok: true };
  };

  const setup: AuthState['setup'] = async (name, email, password) => {
    const { r, d } = await post('/api/auth/setup', { name, email, password });
    if (!r.ok) return { ok: false, error: d.error || 'Could not create the account' };
    setUser(d.user);
    setCanSee(d.user?.role === 'owner');
    setNeedsSetup(false);
    return { ok: true };
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setCanSee(false);
    // Nothing loaded under the old session should linger on screen
    window.location.reload();
  };

  return (
    <Ctx.Provider value={{ loading, user, canSeeFinancials, needsSetup, signIn, setup, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
};
