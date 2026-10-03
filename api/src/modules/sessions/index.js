'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const { safe } = require('../../lib/safe');
const { parse } = require('../../lib/validate');
const { HttpError, badRequest, forbidden, notFound, conflict } = require('../../lib/errors');
const { parseJson, findUniverse, lessonMap } = require('../../lib/catalog');
const { grade, solution, choiceWhy, publicItem, SUPPORTED_KINDS } = require('../../lib/grading');
const { answerXp, missionBonus, levelFor } = require('../../lib/xp');
const { lockUser, applyXp, snapshot } = require('../../lib/ledger');
const { track } = require('../../lib/analytics');

const BOSS_LIVES = 3; // 3 vies, uniquement sur les items boss de la session ; aucune vie globale
const REVIEW_SIZE = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

const startSchema = z
  .object({
    lessonKey: z.string().min(3).max(200).optional(),
    mode: z.enum(['lesson', 'review', 'challenge']).optional(),
    universe: z.string().min(1).max(80).optional()
  })
  .strict();

const answerSchema = z
  .object({
    itemKey: z.string().min(3).max(240),
    response: z.any(),
    timeMs: z.number().int().min(0).max(600000).optional()
  })
  .strict();

const hintSchema = z.object({ itemKey: z.string().min(3).max(240) }).strict();

const pgIntArray = (ids) => `{${ids.join(',')}}`;
const intArray = (v) => {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === 'string') return v.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number);
  return [];
};
const placeholders = (n, from = 1) => Array.from({ length: n }, (_, i) => `$${i + from}`).join(', ');
const payloadOf = (row) => parseJson(row.payload, {});

async function loadItems(runner, ids) {
  if (ids.length === 0) return [];
  const { rows } = await runner.query(
    `SELECT id, key, kind, difficulty, is_boss, payload, lesson_id FROM items WHERE id IN (${placeholders(ids.length)})`,
    ids
  );
  const byId = new Map(rows.map((r) => [r.id, { ...r, payload: payloadOf(r) }]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function loadSession(runner, id, userId, { lock = false, db = null } = {}) {
  if (!UUID_RE.test(String(id))) throw notFound('SESSION_NOT_FOUND', 'Session introuvable');
  const suffix = lock && db && db.kind === 'pg' ? ' FOR UPDATE' : '';
  const { rows } = await runner.query(
    `SELECT id, user_id, universe_id, lesson_id, mode, item_ids, lives_left, hinted_item_ids, started_at, finished_at, total_count, correct_count, xp_total
       FROM play_sessions WHERE id = $1 AND user_id = $2${suffix}`,
    [id, userId]
  );
  if (rows.length === 0) throw notFound('SESSION_NOT_FOUND', 'Session introuvable');
  const s = rows[0];
  return { ...s, item_ids: intArray(s.item_ids), hinted_item_ids: intArray(s.hinted_item_ids) };
}

const sessionView = (s, answered = 0) => ({
  id: s.id,
  mode: s.mode,
  total: Number(s.total_count),
  answered,
  correct: Number(s.correct_count),
  xp: Number(s.xp_total),
  lives: s.lives_left == null ? null : Number(s.lives_left),
  finished: Boolean(s.finished_at)
});

async function finalAttempts(runner, sessionId) {
  const { rows } = await runner.query('SELECT item_id, is_correct, xp_awarded FROM attempts WHERE session_id = $1 AND is_final = true', [sessionId]);
  return rows;
}

function createSessionsRouter({ db, env, auth }) {
  const router = express.Router();
  router.use(auth.csrfGuard, auth.requireUser);

  // Limite par joueur (et non par IP) sur les réponses : 120 / minute
  const answersLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: env.NODE_ENV === 'test' ? 100000 : 120,
    keyGenerator: (req) => `ans:${req.user.id}`,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Doucement : trop de réponses envoyées à la minute.', code: 'ANSWER_RATE_LIMITED' })
  });

  // ------------------------------------------------------------------ POST /sessions
  router.post('/', safe(async (req, res) => {
    const body = parse(startSchema, req.body);
    let slug = body.universe;
    let mode = body.mode;
    if (body.lessonKey) {
      if (mode && mode !== 'lesson') throw badRequest('VALIDATION_ERROR', 'lessonKey est réservé au mode lesson');
      mode = 'lesson';
      slug = body.lessonKey.split('/')[0];
    }
    if (!mode) throw badRequest('VALIDATION_ERROR', 'lessonKey ou mode requis');
    if (mode !== 'lesson' && !slug) throw badRequest('VALIDATION_ERROR', 'universe requis pour ce mode');
    if (mode === 'lesson' && !body.lessonKey) throw badRequest('VALIDATION_ERROR', 'lessonKey requis pour le mode lesson');

    const uni = await findUniverse(db, env, slug);
    const lessons = await lessonMap(db, uni.id, req.user.id);

    let lesson = null;
    let itemRows = [];
    if (mode === 'lesson') {
      lesson = lessons.find((l) => l.key === body.lessonKey);
      if (!lesson) throw notFound('LESSON_NOT_FOUND', 'Leçon introuvable');
      if (lesson.state === 'locked') throw forbidden('LESSON_LOCKED', 'Cette leçon est verrouillée : termine d’abord les leçons précédentes.');
      const { rows } = await db.query(
        `SELECT id, key, kind, difficulty, is_boss, payload, lesson_id FROM items WHERE lesson_id = $1 AND archived_at IS NULL ORDER BY position`,
        [lesson.id]
      );
      itemRows = rows.map((r) => ({ ...r, payload: payloadOf(r) })).filter((r) => SUPPORTED_KINDS.includes(r.kind));
    } else if (mode === 'challenge') {
      // Défi des boss : les épreuves des leçons déjà débloquées
      const ids = lessons.filter((l) => l.state !== 'locked' && l.hasBoss).map((l) => l.id);
      if (ids.length > 0) {
        const { rows } = await db.query(
          `SELECT id, key, kind, difficulty, is_boss, payload, lesson_id FROM items WHERE is_boss = true AND archived_at IS NULL AND lesson_id IN (${placeholders(ids.length)}) ORDER BY lesson_id`,
          ids
        );
        itemRows = rows.map((r) => ({ ...r, payload: payloadOf(r) })).filter((r) => SUPPORTED_KINDS.includes(r.kind));
      }
    } else {
      // Révision : les items déjà tentés (les ratés d'abord, puis les plus anciens). SRS FSRS = lot 5.
      const { rows } = await db.query(
        `SELECT a.item_id, a.is_correct, a.answered_at FROM attempts a JOIN items i ON i.id = a.item_id JOIN lessons l ON l.id = i.lesson_id
          WHERE a.user_id = $1 AND a.is_final = true AND l.universe_id = $2 AND i.archived_at IS NULL ORDER BY a.answered_at`,
        [req.user.id, uni.id]
      );
      const last = new Map();
      for (const r of rows) last.set(r.item_id, { ok: r.is_correct, at: new Date(r.answered_at).getTime() });
      const ids = [...last.entries()].sort((a, b) => Number(a[1].ok) - Number(b[1].ok) || a[1].at - b[1].at).slice(0, REVIEW_SIZE).map(([id]) => id);
      itemRows = (await loadItems(db, ids)).filter((r) => SUPPORTED_KINDS.includes(r.kind));
    }
    if (itemRows.length === 0) {
      throw conflict('NO_ITEMS', mode === 'review' ? 'Rien à réviser pour l’instant : joue d’abord une leçon.' : 'Aucun exercice disponible pour ce mode.');
    }

    const lives = itemRows.some((r) => r.is_boss) ? BOSS_LIVES : null;
    const ins = await db.query(
      `INSERT INTO play_sessions (user_id, universe_id, lesson_id, mode, item_ids, lives_left, total_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, user_id, universe_id, lesson_id, mode, item_ids, lives_left, hinted_item_ids, started_at, finished_at, total_count, correct_count, xp_total`,
      [req.user.id, uni.id, lesson ? lesson.id : null, mode, pgIntArray(itemRows.map((r) => r.id)), lives, itemRows.length]
    );
    await track(db, req.user.id, mode === 'review' ? 'review_started' : 'session_started', { mode, universe: uni.slug });

    let lessonInfo = null;
    if (lesson) {
      const l = (await db.query('SELECT body_md, meta FROM lessons WHERE id = $1', [lesson.id])).rows[0];
      const meta = parseJson(l.meta, {});
      lessonInfo = { key: lesson.key, title: lesson.title, microCourse: l.body_md, recap: lesson.summary, intro: meta.intro || null, xpReward: lesson.xpReward, durationMin: lesson.durationMin };
    }
    res.status(201).json({
      session: sessionView(ins.rows[0]),
      universe: uni.slug,
      lesson: lessonInfo,
      items: itemRows.map(publicItem)
    });
  }));

  // ------------------------------------------------------------------ GET /sessions/:id (reprise)
  router.get('/:id', safe(async (req, res) => {
    const s = await loadSession(db, req.params.id, req.user.id);
    const finals = await finalAttempts(db, s.id);
    const done = new Set(finals.map((a) => a.item_id));
    const remaining = (await loadItems(db, s.item_ids)).filter((r) => !done.has(r.id));
    res.json({ session: sessionView(s, done.size), items: remaining.map(publicItem) });
  }));

  // ------------------------------------------------------------------ POST /sessions/:id/hint
  // L'indice est mesuré côté serveur : le demander ramène l'XP de l'item à x0.6.
  router.post('/:id/hint', safe(async (req, res) => {
    const { itemKey } = parse(hintSchema, req.body);
    const out = await db.tx(async (tx) => {
      await lockUser(db, tx, req.user.id);
      const s = await loadSession(tx, req.params.id, req.user.id, { lock: true, db });
      if (s.finished_at) throw conflict('SESSION_FINISHED', 'Session terminée');
      const item = (await loadItems(tx, s.item_ids)).find((r) => r.key === itemKey);
      if (!item) throw badRequest('ITEM_NOT_IN_SESSION', 'Cet exercice ne fait pas partie de la session');
      if (!item.payload.indice) return { hint: null };
      if (!s.hinted_item_ids.includes(item.id)) {
        await tx.query('UPDATE play_sessions SET hinted_item_ids = $2 WHERE id = $1', [s.id, pgIntArray([...s.hinted_item_ids, item.id])]);
      }
      return { hint: item.payload.indice, xpFactor: 0.6 };
    });
    res.json(out);
  }));

  // ------------------------------------------------------------------ POST /sessions/:id/answers
  router.post('/:id/answers', answersLimiter, safe(async (req, res) => {
    const key = req.get('Idempotency-Key');
    if (!key || !KEY_RE.test(key)) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'En-tête Idempotency-Key requis (8 à 100 caractères : lettres, chiffres, - ou _)');
    const body = parse(answerSchema, req.body);
    if (body.response === undefined) throw badRequest('INVALID_RESPONSE', 'response requis');

    const run = () => db.tx((tx) => answerTx(tx, { sessionId: req.params.id, user: req.user, key, body }));
    let out;
    try {
      out = await run();
    } catch (err) {
      // Course entre deux requêtes simultanées (violation d'unicité) : on rejoue, la 2e lit le résultat de la 1re
      if (err && err.code === '23505') out = await run();
      else throw err;
    }
    res.json(out.body);
  }));

  async function answerTx(tx, { sessionId, user, key, body }) {
    await lockUser(db, tx, user.id);
    const s = await loadSession(tx, sessionId, user.id, { lock: true, db });

    // Rejeu : même clé = même résultat, XP non doublé
    const prev = await tx.query('SELECT id, session_id, item_id, is_correct, xp_awarded, try_no, is_final, response FROM attempts WHERE user_id = $1 AND idempotency_key = $2', [user.id, key]);
    if (prev.rows.length > 0) {
      const a = prev.rows[0];
      const item = (await loadItems(tx, [a.item_id]))[0];
      if (a.session_id !== s.id || !item || item.key !== body.itemKey) throw conflict('IDEMPOTENCY_KEY_REUSED', 'Cette clé d’idempotence a déjà servi pour une autre réponse');
      return { replayed: true, body: await resultBody(tx, { s, user, item, attempt: a, replayed: true }) };
    }

    if (s.finished_at) throw conflict('SESSION_FINISHED', 'Cette session est terminée');
    const items = await loadItems(tx, s.item_ids);
    const item = items.find((r) => r.key === body.itemKey);
    if (!item) throw badRequest('ITEM_NOT_IN_SESSION', 'Cet exercice ne fait pas partie de la session');

    const tries = (await tx.query('SELECT try_no, is_final FROM attempts WHERE session_id = $1 AND item_id = $2', [s.id, item.id])).rows;
    if (tries.some((t) => t.is_final)) throw conflict('ALREADY_ANSWERED', 'Cet exercice a déjà reçu une réponse définitive');
    if (item.is_boss && s.lives_left != null && Number(s.lives_left) <= 0) throw conflict('NO_LIVES_LEFT', 'Plus de vies pour ce boss');
    const tryNo = tries.length + 1;

    // Correction (lève 400 INVALID_RESPONSE si la réponse est mal formée : rien n'est écrit)
    const graded = grade(item.kind, item.payload, body.response);

    // XP
    const hintUsed = s.hinted_item_ids.includes(item.id);
    const wasCorrectBefore = (await tx.query('SELECT 1 AS ok FROM attempts WHERE user_id = $1 AND item_id = $2 AND is_correct = true', [user.id, item.id])).rows.length > 0;
    const xp = answerXp({ difficulty: item.difficulty, correct: graded.correct, hintUsed, retried: tryNo > 1, firstTime: !wasCorrectBefore, kind: item.kind });

    // Vies (boss uniquement) : une erreur coûte une vie ; l'item reste rejouable tant qu'il en reste
    let lives = s.lives_left == null ? null : Number(s.lives_left);
    let isFinal = true;
    if (item.is_boss && lives != null && !graded.correct) {
      lives -= 1;
      isFinal = lives <= 0;
    }
    const rating = !graded.correct ? 1 : hintUsed || tryNo > 1 ? 2 : 3;

    const ins = await tx.query(
      `INSERT INTO attempts (user_id, session_id, item_id, is_correct, rating, response, time_ms, xp_awarded, idempotency_key, try_no, is_final)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, session_id, item_id, is_correct, xp_awarded, try_no, is_final`,
      [user.id, s.id, item.id, graded.correct, rating, JSON.stringify(body.response), body.timeMs ?? null, xp.amount, key, tryNo, isFinal]
    );
    const attempt = ins.rows[0];

    const led = await applyXp(tx, { user, universeId: s.universe_id, amount: xp.amount, reason: 'answer', ref: `${s.id}:${item.id}:${tryNo}`, items: 1 });

    await tx.query('UPDATE play_sessions SET xp_total = xp_total + $2, correct_count = correct_count + $3, lives_left = $4 WHERE id = $1', [
      s.id, led.awarded, isFinal && graded.correct ? 1 : 0, lives
    ]);
    const s2 = { ...s, xp_total: Number(s.xp_total) + led.awarded, correct_count: Number(s.correct_count) + (isFinal && graded.correct ? 1 : 0), lives_left: lives };
    if (led.streakExtended) await track(tx, user.id, 'streak_extended', {});

    return {
      replayed: false,
      body: await resultBody(tx, { s: s2, user, item, attempt, graded, xp, led, hintUsed, response: body.response })
    };
  }

  // Corps de réponse : identique en rejeu (la correction est recalculée depuis la tentative stockée)
  async function resultBody(tx, { s, user, item, attempt, graded, xp, led, hintUsed, replayed = false, response }) {
    const correct = attempt.is_correct;
    const isFinal = attempt.is_final;
    const p = item.payload;
    const stored = replayed ? parseJson(attempt.response, {}) : response;
    let g = graded;
    if (!g) {
      try { g = grade(item.kind, p, stored); } catch (_) { g = { correct, detail: {} }; }
    }
    const snap = await snapshot(tx, user);
    const finals = await finalAttempts(tx, s.id);
    const lives = s.lives_left == null ? null : Number(s.lives_left);
    const out = {
      correct,
      final: isFinal,
      xp: { awarded: attempt.xp_awarded, ...(xp ? { base: xp.base, quality: xp.quality, firstTime: xp.firstTime } : {}) },
      detail: g.detail,
      explanation: isFinal ? (correct ? p.feedback_ok : p.feedback_ko) : null,
      solution: isFinal ? solution(item.kind, p) : null,
      why: isFinal && !correct && g.detail ? choiceWhy(item.kind, p, g.detail.choice) : null,
      sources: isFinal ? p.sources || [] : [],
      boss: item.is_boss ? { lives, maxLives: BOSS_LIVES, canRetry: !isFinal && !correct, defeated: isFinal && correct } : null,
      session: sessionView(s, finals.length),
      progress: snap,
      levelUp: led ? levelFor(led.totalAfter).level > levelFor(led.totalBefore).level : false,
      streakExtended: led ? led.streakExtended : false,
      replayed
    };
    return out;
  }

  // ------------------------------------------------------------------ POST /sessions/:id/complete
  router.post(['/:id/complete', '/:id/finish'], safe(async (req, res) => {
    const out = await db.tx(async (tx) => {
      await lockUser(db, tx, req.user.id);
      const s = await loadSession(tx, req.params.id, req.user.id, { lock: true, db });
      const items = await loadItems(tx, s.item_ids);
      const finals = await finalAttempts(tx, s.id);
      const byItem = new Map(finals.map((a) => [a.item_id, a]));

      if (!s.finished_at && finals.length < items.length) {
        throw conflict('SESSION_INCOMPLETE', 'Réponds à tous les exercices avant de terminer la session.');
      }
      const correct = finals.filter((a) => a.is_correct).length;
      const total = items.length;
      const accuracy = total ? correct / total : 0;
      const answersXp = finals.reduce((n, a) => n + Number(a.xp_awarded), 0);
      const boss = items.find((r) => r.is_boss);
      const bossDefeated = boss ? Boolean(byItem.get(boss.id) && byItem.get(boss.id).is_correct) : null;
      const completedLesson = s.mode === 'lesson' && s.lesson_id != null && bossDefeated !== false;

      let bonus = 0;
      let firstCompletion = false;
      let led = null;
      if (!s.finished_at) {
        if (completedLesson) {
          const lp = await tx.query('SELECT status, best_score, runs FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2', [s.user_id, s.lesson_id]);
          const wasDone = lp.rows.length > 0 && ['completed', 'mastered'].includes(lp.rows[0].status);
          firstCompletion = !wasDone;
          const score = Math.round(accuracy * 10000) / 100;
          const status = accuracy === 1 ? 'mastered' : wasDone && lp.rows[0].status === 'mastered' ? 'mastered' : 'completed';
          if (lp.rows.length === 0) {
            await tx.query('INSERT INTO lesson_progress (user_id, lesson_id, status, best_score, runs, completed_at) VALUES ($1, $2, $3, $4, 1, $5)', [s.user_id, s.lesson_id, status, score, new Date()]);
          } else {
            await tx.query('UPDATE lesson_progress SET status = $3, best_score = $4, runs = runs + 1, completed_at = COALESCE(completed_at, $5) WHERE user_id = $1 AND lesson_id = $2', [
              s.user_id, s.lesson_id, status, Math.max(score, Number(lp.rows[0].best_score)), new Date()
            ]);
          }
          // Bonus de mission : une seule fois par leçon (rejouer ne rapporte plus de bonus : anti-grind)
          if (firstCompletion) {
            const lesson = (await tx.query('SELECT xp_reward FROM lessons WHERE id = $1', [s.lesson_id])).rows[0];
            bonus = missionBonus(accuracy, lesson.xp_reward);
          }
        } else if (s.mode === 'lesson' && s.lesson_id != null) {
          // Boss non vaincu : la leçon reste à refaire (gratuitement, sans limite)
          const lp = await tx.query('SELECT 1 AS present FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2', [s.user_id, s.lesson_id]);
          if (lp.rows.length === 0) {
            await tx.query("INSERT INTO lesson_progress (user_id, lesson_id, status, best_score, runs) VALUES ($1, $2, 'in_progress', 0, 1)", [s.user_id, s.lesson_id]);
          } else {
            await tx.query('UPDATE lesson_progress SET runs = runs + 1 WHERE user_id = $1 AND lesson_id = $2', [s.user_id, s.lesson_id]);
          }
        }
        if (bonus > 0) {
          led = await applyXp(tx, { user: req.user, universeId: s.universe_id, amount: bonus, reason: 'lesson_complete', ref: `lesson:${s.lesson_id}` });
          bonus = led.awarded;
        }
        await tx.query('UPDATE play_sessions SET finished_at = $2, xp_total = xp_total + $3 WHERE id = $1', [s.id, new Date(), bonus]);
        await track(tx, s.user_id, 'session_finished', { mode: s.mode, accuracy: Math.round(accuracy * 100) });
        if (completedLesson && firstCompletion) await track(tx, s.user_id, 'lesson_completed', {});
        if (led && led.streakExtended) await track(tx, s.user_id, 'streak_extended', {});
      } else {
        // Déjà terminée : le bilan est rejoué tel quel (bonus = XP du bonus déjà versé, sans nouvelle écriture)
        bonus = Math.max(0, Number(s.xp_total) - answersXp);
      }

      const snap = await snapshot(tx, req.user);
      const lessons = await lessonMap(tx, s.universe_id, s.user_id);
      const next = lessons.find((l) => l.state === 'unlocked' && l.id !== s.lesson_id) || null;
      const levelBefore = levelFor(Math.max(0, snap.xp.total - (led ? led.awarded : 0))).level;
      return {
        summary: {
          sessionId: s.id,
          mode: s.mode,
          correct,
          total,
          accuracy: Math.round(accuracy * 100) / 100,
          perfect: total > 0 && correct === total,
          xp: { answers: answersXp, bonus, total: answersXp + bonus },
          lessonCompleted: completedLesson,
          firstCompletion,
          bossDefeated,
          levelUp: !s.finished_at && snap.level.level > levelBefore,
          level: snap.level,
          streak: snap.streak,
          dailyGoal: snap.dailyGoal,
          xpTotal: snap.xp.total,
          next: next ? { key: next.key, title: next.title } : null,
          replayed: Boolean(s.finished_at)
        }
      };
    });
    res.json(out);
  }));

  return router;
}

module.exports = { createSessionsRouter, BOSS_LIVES };
