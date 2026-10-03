'use strict';

const { safe } = require('./safe');
const { HttpError, unauthorized } = require('./errors');
const { newToken, hashToken } = require('./tokens');

const COOKIE_NAME = 'mml_sid';
const SESSION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key || key in out) continue;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch (_) {
      /* cookie mal formé : ignoré */
    }
  }
  return out;
}

const toUser = (r) => ({
  id: r.id,
  email: r.email,
  isAnonymous: r.is_anonymous,
  displayName: r.display_name,
  handle: r.handle,
  locale: r.locale,
  timezone: r.timezone,
  dailyGoalXp: r.daily_goal_xp,
  leaderboardOptIn: r.leaderboard_opt_in,
  marketingOptIn: r.marketing_opt_in,
  createdAt: r.created_at
});

/** Représentation publique : l'e-mail n'est exposé que pour un compte (jamais pour un invité). */
const publicUser = (u) => ({
  id: u.id,
  isAnonymous: u.isAnonymous,
  email: u.isAnonymous ? null : u.email,
  displayName: u.displayName,
  handle: u.handle,
  locale: u.locale,
  timezone: u.timezone,
  dailyGoalXp: u.dailyGoalXp,
  leaderboardOptIn: u.leaderboardOptIn,
  marketingOptIn: u.marketingOptIn,
  createdAt: u.createdAt
});

const USER_COLUMNS = 'id, email, is_anonymous, display_name, handle, locale, timezone, daily_goal_xp, leaderboard_opt_in, marketing_opt_in, created_at';

/**
 * Sessions par cookie HttpOnly. Le jeton (256 bits) n'est JAMAIS stocké : seul son hash SHA-256 l'est.
 * CSRF : SameSite=Lax + en-tête `X-MML: 1` obligatoire sur les mutations + contrôle de `Origin`.
 */
function createAuth({ db, env }) {
  const appOrigin = new URL(env.APP_URL).origin;
  const extraOrigins = (env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);

  const cookieOptions = () => ({
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * DAY_MS
  });
  const setSessionCookie = (res, token) => res.cookie(COOKIE_NAME, token, cookieOptions());
  const clearSessionCookie = (res) => res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });

  async function createSession(runner, userId, userAgent) {
    const token = newToken();
    const now = new Date();
    await runner.query(
      'INSERT INTO auth_sessions (user_id, token_hash, last_used_at, expires_at, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [userId, hashToken(token), now, new Date(now.getTime() + SESSION_DAYS * DAY_MS), (userAgent || '').slice(0, 300)]
    );
    return token;
  }

  async function revokeSession(runner, token) {
    if (!token) return;
    await runner.query('UPDATE auth_sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(token), new Date()]);
  }

  // Attache req.user (ou null) ; prolonge la session de façon glissante (1 écriture / jour au plus).
  const attachUser = safe(async (req, res, next) => {
    req.user = null;
    req.sessionToken = null;
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!token || token.length > 200) return next();
    const now = new Date();
    const { rows } = await db.query(
      `SELECT s.id AS session_id, s.last_used_at, u.${USER_COLUMNS.split(', ').join(', u.')}
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 AND u.deleted_at IS NULL`,
      [hashToken(token), now]
    );
    if (rows.length === 0) return next();
    const row = rows[0];
    req.user = toUser(row);
    req.sessionToken = token;
    if (now.getTime() - new Date(row.last_used_at).getTime() > DAY_MS) {
      await db.query('UPDATE auth_sessions SET last_used_at = $2, expires_at = $3 WHERE id = $1', [row.session_id, now, new Date(now.getTime() + SESSION_DAYS * DAY_MS)]);
      await db.query('UPDATE users SET last_seen_at = $2 WHERE id = $1', [row.id, now]);
      setSessionCookie(res, token);
    }
    return next();
  });

  const requireUser = (req, res, next) => (req.user ? next() : next(unauthorized()));

  // Mutations : en-tête X-MML: 1 obligatoire + Origin cohérente avec l'application.
  const csrfGuard = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('X-MML') !== '1') return next(new HttpError(403, 'CSRF_HEADER_REQUIRED', 'En-tête X-MML requis'));
    const origin = req.get('Origin');
    if (origin) {
      let host = null;
      try { host = new URL(origin).host; } catch (_) { /* origine illisible */ }
      const sameHost = host && host === req.get('Host');
      if (!sameHost && origin !== appOrigin && !extraOrigins.includes(origin)) {
        return next(new HttpError(403, 'BAD_ORIGIN', 'Origine non autorisée'));
      }
    }
    return next();
  };

  return { COOKIE_NAME, attachUser, requireUser, csrfGuard, createSession, revokeSession, setSessionCookie, clearSessionCookie };
}

module.exports = { createAuth, parseCookies, publicUser, toUser, USER_COLUMNS, COOKIE_NAME, SESSION_DAYS };
