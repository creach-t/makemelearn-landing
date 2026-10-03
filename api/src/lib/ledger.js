'use strict';

/**
 * Écritures de progression, TOUJOURS appelées à l'intérieur d'une transaction (db.tx) :
 * XP (grand livre idempotent), cache d'XP par univers, activité quotidienne, streak, classement hebdomadaire.
 * Lecture : snapshot() (XP, niveau, objectif du jour, streak) pour /progress et les réponses d'API.
 *
 * Sérialisation : lockUser() verrouille la ligne users (vrai Postgres) : deux requêtes simultanées du même joueur
 * s'exécutent l'une après l'autre, sans course sur daily_activity / streaks.
 */

const { localDay, weekStartUtc } = require('./dates');
const { STREAK_XP, DAILY_CAP, levelFor, leaderboardCredit } = require('./xp');
const { emptyState, recordGoalMet, effectiveStreak } = require('./streak');

// Colonnes DATE : un vrai pg les rend en Date à minuit LOCAL du process, pg-mem à minuit UTC. On lit le jour calendaire dans les deux cas.
const pad = (n) => String(n).padStart(2, '0');
function asDay(v) {
  if (!v) return null;
  if (!(v instanceof Date)) return String(v).slice(0, 10);
  if (v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0) return v.toISOString().slice(0, 10);
  return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
}
const asDays = (v) => (Array.isArray(v) ? v.map(asDay) : []);

async function lockUser(db, tx, userId) {
  if (db.kind === 'pg') await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
}

async function readStreak(runner, userId) {
  const { rows } = await runner.query('SELECT current_days, longest_days, last_active_day, freezes_available, freeze_refill_on, frozen_days FROM streaks WHERE user_id = $1', [userId]);
  if (rows.length === 0) return { exists: false, state: emptyState() };
  const r = rows[0];
  return {
    exists: true,
    state: { current: r.current_days, longest: r.longest_days, lastActiveDay: asDay(r.last_active_day), freezes: r.freezes_available, refillOn: asDay(r.freeze_refill_on), frozenDays: asDays(r.frozen_days) }
  };
}

const pgDateArray = (days) => `{${days.join(',')}}`;

async function writeStreak(runner, userId, exists, s) {
  const params = [userId, s.current, s.longest, s.lastActiveDay, s.freezes, s.refillOn, pgDateArray(s.frozenDays)];
  if (exists) {
    await runner.query(
      'UPDATE streaks SET current_days = $2, longest_days = $3, last_active_day = $4, freezes_available = $5, freeze_refill_on = $6, frozen_days = $7 WHERE user_id = $1',
      params
    );
  } else {
    await runner.query(
      'INSERT INTO streaks (user_id, current_days, longest_days, last_active_day, freezes_available, freeze_refill_on, frozen_days) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      params
    );
  }
}

async function bumpLeaderboard(runner, week, universeId, userId, credit, now) {
  const { rows } = await runner.query('SELECT xp FROM leaderboard_weekly WHERE week_start = $1 AND universe_id = $2 AND user_id = $3', [week, universeId, userId]);
  if (rows.length === 0) {
    await runner.query('INSERT INTO leaderboard_weekly (week_start, universe_id, user_id, xp, updated_at) VALUES ($1, $2, $3, $4, $5)', [week, universeId, userId, credit, now]);
  } else {
    await runner.query('UPDATE leaderboard_weekly SET xp = xp + $4, updated_at = $5 WHERE week_start = $1 AND universe_id = $2 AND user_id = $3', [week, universeId, userId, credit, now]);
  }
}

/**
 * Crédite `amount` XP (>= 0) et/ou compte `items` réponses dans la journée locale.
 * `reason`/`ref` = clé d'idempotence du grand livre : un même couple n'est jamais compté deux fois.
 * @returns {{awarded: number, duplicate: boolean, dailyXp: number, streakExtended: boolean, usedFreeze: boolean, totalBefore: number, totalAfter: number}}
 */
async function applyXp(tx, { user, universeId, amount, reason, ref, items = 0, now = new Date() }) {
  const day = localDay(now, user.timezone);
  const before = await totalXp(tx, user.id);

  let awarded = amount;
  if (amount > 0) {
    const exists = await tx.query('SELECT 1 AS present FROM xp_events WHERE user_id = $1 AND reason = $2 AND ref = $3', [user.id, reason, ref]);
    if (exists.rows.length > 0) {
      const today = await dailyRow(tx, user.id, day);
      return { awarded: 0, duplicate: true, dailyXp: today.xp, streakExtended: false, usedFreeze: false, totalBefore: before, totalAfter: before };
    }
    await tx.query('INSERT INTO xp_events (user_id, universe_id, amount, reason, ref, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [user.id, universeId, amount, reason, ref, now]);

    const uu = await tx.query('SELECT xp_total FROM user_universes WHERE user_id = $1 AND universe_id = $2', [user.id, universeId]);
    if (uu.rows.length === 0) {
      await tx.query('INSERT INTO user_universes (user_id, universe_id, xp_total, started_at, last_played_at) VALUES ($1, $2, $3, $4, $4)', [user.id, universeId, amount, now]);
    } else {
      await tx.query('UPDATE user_universes SET xp_total = xp_total + $3, last_played_at = $4 WHERE user_id = $1 AND universe_id = $2', [user.id, universeId, amount, now]);
    }
  } else {
    awarded = 0;
  }

  // Activité du jour local
  const today = await dailyRow(tx, user.id, day);
  const dailyBefore = today.xp;
  const dailyAfter = dailyBefore + awarded;
  if (!today.exists) {
    await tx.query('INSERT INTO daily_activity (user_id, day, xp, items_answered, goal_met) VALUES ($1, $2, $3, $4, false)', [user.id, day, dailyAfter, items]);
  } else {
    await tx.query('UPDATE daily_activity SET xp = $3, items_answered = items_answered + $4 WHERE user_id = $1 AND day = $2', [user.id, day, dailyAfter, items]);
  }

  // Streak : validé au passage de 30 XP dans la journée locale
  let streakExtended = false;
  let usedFreeze = false;
  if (dailyBefore < STREAK_XP && dailyAfter >= STREAK_XP) {
    const cur = await readStreak(tx, user.id);
    const res = recordGoalMet(cur.state, day);
    streakExtended = res.extended;
    usedFreeze = res.usedFreeze;
    await writeStreak(tx, user.id, cur.exists, res.state);
    await tx.query('UPDATE daily_activity SET goal_met = true WHERE user_id = $1 AND day = $2', [user.id, day]);
  }

  // Classement hebdomadaire : même transaction, plafonné par jour (anti-grind)
  const credit = leaderboardCredit(dailyBefore, awarded);
  if (credit > 0) {
    const week = weekStartUtc(now);
    await bumpLeaderboard(tx, week, 0, user.id, credit, now);
    await bumpLeaderboard(tx, week, universeId, user.id, credit, now);
  }

  return { awarded, duplicate: false, dailyXp: dailyAfter, streakExtended, usedFreeze, totalBefore: before, totalAfter: before + awarded };
}

async function dailyRow(runner, userId, day) {
  const { rows } = await runner.query('SELECT xp, items_answered, goal_met FROM daily_activity WHERE user_id = $1 AND day = $2', [userId, day]);
  return rows.length ? { exists: true, xp: Number(rows[0].xp), items: Number(rows[0].items_answered), goalMet: rows[0].goal_met } : { exists: false, xp: 0, items: 0, goalMet: false };
}

async function totalXp(runner, userId) {
  const { rows } = await runner.query('SELECT COALESCE(SUM(xp_total), 0) AS total FROM user_universes WHERE user_id = $1', [userId]);
  return Number(rows[0].total);
}

/** Vue de progression (lecture seule) : XP, niveau, objectif du jour, streak, dernière activité. */
async function snapshot(runner, user, now = new Date()) {
  const day = localDay(now, user.timezone);
  const [total, daily, streak, last] = await Promise.all([
    totalXp(runner, user.id),
    dailyRow(runner, user.id, day),
    readStreak(runner, user.id),
    runner.query('SELECT MAX(answered_at) AS at FROM attempts WHERE user_id = $1', [user.id])
  ]);
  const eff = effectiveStreak(streak.state, day);
  return {
    xp: { total, today: daily.xp, dailyCap: DAILY_CAP },
    level: levelFor(total),
    dailyGoal: { xp: user.dailyGoalXp, done: daily.xp, met: daily.xp >= user.dailyGoalXp, itemsAnswered: daily.items },
    streak: { ...eff, thresholdXp: STREAK_XP },
    lastActivityAt: last.rows[0] && last.rows[0].at ? new Date(last.rows[0].at).toISOString() : null,
    today: day
  };
}

module.exports = { asDay, lockUser, applyXp, snapshot, totalXp, readStreak, dailyRow };
