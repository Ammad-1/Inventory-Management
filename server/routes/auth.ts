import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import {
  ROLES, Role, hashPassword, verifyPassword, passwordProblem, userCount,
  createSession, destroySession, userForToken, readSessionCookie,
  setSessionCookie, clearSessionCookie, requireRole, canSeeFinancials
} from '../services/auth';

/**
 * Sign in, sign out, and managing who has an account.
 *
 * Only an owner may create or change accounts. The very first account is
 * the exception: with no users at all nobody could sign in to make one, so
 * a one-time setup endpoint opens until an owner exists and then closes.
 */
export const authRouter = Router();

const now = () => new Date().toISOString();
const normaliseEmail = (v: unknown) => String(v || '').trim().toLowerCase();

const publicUser = (u: any) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  active: !!u.active,
  lastLoginAt: u.last_login_at,
  createdAt: u.created_at
});

/* -------------------------------------------------------------- session */

authRouter.get('/needs-setup', (_req: Request, res: Response) => {
  try {
    res.json({ needsSetup: userCount() === 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Creates the first owner. Refused once any account exists. */
authRouter.post('/setup', (req: Request, res: Response) => {
  try {
    if (userCount() > 0) {
      return res.status(409).json({ error: 'Setup has already been completed. Sign in instead.' });
    }
    const { name, email, password } = req.body || {};
    const mail = normaliseEmail(email);
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Your name is required' });
    if (!mail.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });

    const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, role, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'owner', 1, ?, ?)
    `).run(id, mail, String(name).trim(), hashPassword(password), now(), now());

    const token = createSession(id);
    setSessionCookie(res, token);
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), id);

    res.status(201).json({
      success: true,
      user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
      message: 'Owner account created. You are signed in.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/login', (req: Request, res: Response) => {
  try {
    const mail = normaliseEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(mail) as any;

    // One message for both cases, so this cannot be used to discover accounts
    const reject = () => res.status(401).json({ error: 'Email or password is incorrect' });
    if (!row || !row.active) return reject();
    if (!verifyPassword(password, row.password_hash)) return reject();

    const token = createSession(row.id);
    setSessionCookie(res, token);
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), row.id);

    res.json({
      success: true,
      user: publicUser(row),
      canSeeFinancials: canSeeFinancials(row.role),
      message: `Signed in as ${row.name}`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/logout', (req: Request, res: Response) => {
  try {
    const token = readSessionCookie(req);
    if (token) destroySession(token);
    clearSessionCookie(res);
    res.json({ success: true, message: 'Signed out' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Who am I, and what am I allowed to see. */
authRouter.get('/session', (req: Request, res: Response) => {
  try {
    const user = userForToken(readSessionCookie(req));
    if (!user) return res.json({ authenticated: false, needsSetup: userCount() === 0 });
    res.json({
      authenticated: true,
      user,
      canSeeFinancials: canSeeFinancials(user.role)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/change-password', (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Sign in to continue' });
    const { currentPassword, newPassword } = req.body || {};
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
    if (!row || !verifyPassword(String(currentPassword || ''), row.password_hash)) {
      return res.status(400).json({ error: 'Your current password is incorrect' });
    }
    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ error: problem });

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(newPassword), now(), row.id);
    // Other sessions are ended; the one in hand keeps working
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?')
      .run(row.id, readSessionCookie(req));

    res.json({ success: true, message: 'Password changed. Other devices have been signed out.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------------------- users */

authRouter.get('/users', requireRole('owner'), (_req: Request, res: Response) => {
  try {
    res.json(
      (db.prepare('SELECT * FROM users ORDER BY active DESC, name').all() as any[]).map(publicUser)
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/users', requireRole('owner'), (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body || {};
    const mail = normaliseEmail(email);
    if (!String(name || '').trim()) return res.status(400).json({ error: 'A name is required' });
    if (!mail.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
    }
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail)) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, role, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, mail, String(name).trim(), hashPassword(password), role, now(), now());

    res.status(201).json({
      success: true,
      user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
      message: `${String(name).trim()} can now sign in`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.put('/users/:id', requireRole('owner'), (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'User not found' });

    const { name, role, active, password } = req.body || {};
    if (role !== undefined && !ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
    }

    // Never leave the system without a way in
    const losingOwner =
      row.role === 'owner' && ((role !== undefined && role !== 'owner') || active === false);
    if (losingOwner) {
      const owners = (db.prepare(
        "SELECT COUNT(*) as c FROM users WHERE role = 'owner' AND active = 1 AND id != ?"
      ).get(row.id) as any).c;
      if (owners === 0) {
        return res.status(409).json({
          error: 'This is the last active owner. Promote someone else first.'
        });
      }
    }

    if (password !== undefined) {
      const problem = passwordProblem(password);
      if (problem) return res.status(400).json({ error: problem });
    }

    db.prepare(`
      UPDATE users SET
        name = COALESCE(?, name),
        role = COALESCE(?, role),
        active = COALESCE(?, active),
        password_hash = COALESCE(?, password_hash),
        updated_at = ?
      WHERE id = ?
    `).run(
      name !== undefined ? String(name).trim() : null,
      role !== undefined ? role : null,
      active !== undefined ? (active ? 1 : 0) : null,
      password !== undefined ? hashPassword(password) : null,
      now(), row.id
    );

    // A changed role or a disabled account must take effect at once
    if (role !== undefined || active === false || password !== undefined) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
    }

    res.json({
      success: true,
      user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(row.id)),
      message: `${row.name} updated`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.delete('/users/:id', requireRole('owner'), (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'User not found' });
    if (req.user?.id === row.id) {
      return res.status(409).json({ error: 'You cannot remove your own account' });
    }
    if (row.role === 'owner') {
      const owners = (db.prepare(
        "SELECT COUNT(*) as c FROM users WHERE role = 'owner' AND active = 1 AND id != ?"
      ).get(row.id) as any).c;
      if (owners === 0) {
        return res.status(409).json({ error: 'This is the last active owner.' });
      }
    }

    // Deactivated, not deleted: the audit trail still names them
    db.prepare('UPDATE users SET active = 0, updated_at = ? WHERE id = ?').run(now(), row.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
    res.json({ success: true, message: `${row.name} can no longer sign in` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
