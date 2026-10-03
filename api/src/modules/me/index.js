'use strict';

const express = require('express');
const { z } = require('zod');

const { safe } = require('../../lib/safe');
const { parse } = require('../../lib/validate');
const { HttpError } = require('../../lib/errors');
const { publicUser, toUser, USER_COLUMNS } = require('../../lib/auth');

const validTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
};

const patchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(40).nullable(),
    handle: z.string().regex(/^[a-z0-9_]{3,20}$/, 'Pseudo : 3 à 20 caractères, minuscules, chiffres ou _').nullable(),
    timezone: z.string().max(64).refine(validTimezone, 'Fuseau horaire inconnu'),
    dailyGoalXp: z.number().int().min(10).max(500),
    leaderboardOptIn: z.boolean(),
    marketingOptIn: z.boolean()
  })
  .partial()
  .strict();

// Seules ces colonnes (liste fermée) peuvent être modifiées
const COLUMN_OF = {
  displayName: 'display_name',
  handle: 'handle',
  timezone: 'timezone',
  dailyGoalXp: 'daily_goal_xp',
  leaderboardOptIn: 'leaderboard_opt_in',
  marketingOptIn: 'marketing_opt_in'
};

function createMeRouter({ db, auth }) {
  const router = express.Router();
  router.use(auth.csrfGuard, auth.requireUser);

  // GET /me
  router.get('/', (req, res) => res.json({ user: publicUser(req.user) }));

  // PATCH /me : pseudo, fuseau, objectif quotidien, opt-in classement / marketing
  router.patch('/', safe(async (req, res) => {
    const changes = parse(patchSchema, req.body);
    const keys = Object.keys(changes);
    if (keys.length === 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Aucun champ à modifier');
    const sets = keys.map((k, i) => `${COLUMN_OF[k]} = $${i + 2}`);
    try {
      const { rows } = await db.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $1 AND deleted_at IS NULL RETURNING ${USER_COLUMNS}`,
        [req.user.id, ...keys.map((k) => changes[k])]
      );
      res.json({ user: publicUser(toUser(rows[0])) });
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'HANDLE_TAKEN', 'Ce pseudo est déjà pris');
      throw err;
    }
  }));

  // DELETE /me : suppression RGPD. Cascade sur sessions, progression, tentatives, XP, etc. ;
  // analytics_events.user_id passe à NULL ; les liens magiques liés à l'e-mail sont purgés.
  router.delete('/', safe(async (req, res) => {
    await db.tx(async (tx) => {
      if (req.user.email) await tx.query('DELETE FROM login_tokens WHERE lower(email) = lower($1)', [req.user.email]);
      await tx.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    });
    auth.clearSessionCookie(res);
    res.status(204).end();
  }));

  return router;
}

module.exports = { createMeRouter };
