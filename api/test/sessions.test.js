'use strict';

const crypto = require('crypto');
const request = require('supertest');
const { createTestDb, REAL } = require('./helpers/testdb');
const { buildApp } = require('./helpers/app');
const { PILOT, LESSON, SLUG, setupGame, client, correctResponse, wrongResponse } = require('./helpers/game');
const { answerXp, missionBonus } = require('../src/lib/xp');
const { localDay } = require('../src/lib/dates');
const { asDay } = require('../src/lib/ledger');

const BOSS_KEY = [...PILOT.items.entries()].find(([, i]) => i.boss)[0];
const bossItem = PILOT.items.get(BOSS_KEY);
const keysOfLesson = (n) => [...PILOT.items.keys()].filter((k) => k.startsWith(`${LESSON(n)}/`));

// pg-mem n'isole pas les transactions et ne sait pas les annuler : l'atomicité et les accès concurrents
// réellement parallèles ne sont vérifiés que sur un vrai Postgres (TEST_DATABASE_URL).
const realOnly = REAL ? test : test.skip;

describe('sessions de jeu : démarrage, réponses, bilan (lot 4)', () => {
  let t;
  let app;
  let c;
  const count = async (table, where = '') => Number((await t.db.query(`SELECT count(*) AS n FROM ${table} ${where}`)).rows[0].n);
  const totalXp = async () => Number((await c.get('/api/v1/progress')).body.xp.total);
  const unlockThrough = async (n) => { for (let i = 1; i < n; i++) expect((await c.playLesson(LESSON(i))).summary.body.summary.lessonCompleted).toBe(true); };

  beforeEach(async () => {
    t = await createTestDb();
    ({ app } = await setupGame(t));
    c = client(app);
    await c.guest();
  });
  afterEach(async () => { await t.close(); });

  describe('protection', () => {
    test('sans cookie : 401 ; sans en-tête X-MML : 403 ; mauvaise Origin : 403', async () => {
      expect((await request(app).post('/api/v1/sessions').set('X-MML', '1').send({ lessonKey: LESSON(1) })).status).toBe(401);
      expect((await request(app).get('/api/v1/progress')).status).toBe(401);
      const noCsrf = await request(app).post('/api/v1/sessions').set('Cookie', c.cookie).send({ lessonKey: LESSON(1) });
      expect(noCsrf.status).toBe(403);
      expect(noCsrf.body.code).toBe('CSRF_HEADER_REQUIRED');
      const badOrigin = await request(app).post('/api/v1/sessions').set('Cookie', c.cookie).set('X-MML', '1').set('Origin', 'https://evil.example').send({ lessonKey: LESSON(1) });
      expect(badOrigin.status).toBe(403);
    });

    test('la session d’un joueur est introuvable pour un autre', async () => {
      const started = await c.start(LESSON(1));
      const other = client(app);
      await other.guest();
      const res = await other.answer(started.body.session.id, started.body.items[0].key, { known: true });
      expect(res.status).toBe(404);
      expect((await other.get(`/api/v1/sessions/${started.body.session.id}`)).status).toBe(404);
      expect((await other.complete(started.body.session.id)).status).toBe(404);
      expect((await c.get('/api/v1/sessions/pas-un-uuid')).status).toBe(404);
    });
  });

  describe('démarrage', () => {
    test('renvoie les items SANS réponse, explication, source ni indice ; session + leçon (micro-cours, intro)', async () => {
      const res = await c.start(LESSON(1));
      expect(res.status).toBe(201);
      expect(res.body.session).toMatchObject({ mode: 'lesson', total: 4, answered: 0, lives: null, finished: false });
      expect(res.body.lesson).toMatchObject({ key: LESSON(1), title: 'Le biais de confirmation' });
      expect(res.body.lesson.microCourse).toMatch(/biais de confirmation/i);
      expect(res.body.items).toHaveLength(4);
      expect(res.body.items.map((i) => i.kind)).toEqual(['flashcard', 'mcq', 'truefalse', 'cloze']);
      const json = JSON.stringify(res.body.items);
      for (const f of ['bonne', 'feedback', 'distracteur', 'reponses_acceptees', 'sources', '"indice"', 'verso', 'solution']) expect(json).not.toContain(f);
      for (const it of res.body.items) {
        const src = PILOT.items.get(it.key);
        expect(json.includes(src.feedback_ok)).toBe(false);
        expect(it.hasHint).toBe(Boolean(src.indice));
      }
      expect(await count('play_sessions')).toBe(1);
    });

    test('leçon verrouillée : 403 LESSON_LOCKED ; inconnue : 404 ; paramètres invalides : 400', async () => {
      const locked = await c.start(LESSON(2));
      expect(locked.status).toBe(403);
      expect(locked.body.code).toBe('LESSON_LOCKED');
      expect((await c.start(`${SLUG}/inexistante`)).status).toBe(404);
      expect((await c.start('autre-univers/x')).status).toBe(404);
      expect((await c.post('/api/v1/sessions', {})).status).toBe(400);
      expect((await c.post('/api/v1/sessions', { mode: 'review' })).status).toBe(400);
      expect((await c.post('/api/v1/sessions', { lessonKey: LESSON(1), mode: 'review' })).status).toBe(400);
      expect((await c.post('/api/v1/sessions', { lessonKey: LESSON(1), extra: 1 })).status).toBe(400);
    });

    test('un boss active 3 vies pour la session ; une leçon sans boss n’a aucune vie (pas de vies globales)', async () => {
      await unlockThrough(3);
      const withBoss = await c.start(LESSON(3));
      expect(withBoss.body.session.lives).toBe(3);
      expect(withBoss.body.items.at(-1)).toMatchObject({ key: BOSS_KEY, isBoss: true });
      expect((await c.start(LESSON(1))).body.session.lives).toBeNull();
    });

    test('GET /sessions/:id : reprise avec les items restants', async () => {
      const s = await c.start(LESSON(1));
      const first = s.body.items[0];
      await c.answer(s.body.session.id, first.key, correctResponse(PILOT.items.get(first.key)));
      const res = await c.get(`/api/v1/sessions/${s.body.session.id}`);
      expect(res.body.session).toMatchObject({ answered: 1, total: 4 });
      expect(res.body.items.map((i) => i.key)).toEqual(s.body.items.slice(1).map((i) => i.key));
    });
  });

  describe('réponses : correction, XP, idempotence', () => {
    test('bonne réponse : correct, explication, solution, XP pondérée (base x qualité x première fois)', async () => {
      const s = await c.start(LESSON(1));
      const qcm = s.body.items.find((i) => i.kind === 'mcq');
      const src = PILOT.items.get(qcm.key);
      const res = await c.answer(s.body.session.id, qcm.key, correctResponse(src));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ correct: true, final: true, explanation: src.feedback_ok, replayed: false });
      expect(res.body.solution.choice).toBe(src.bonne);
      expect(res.body.sources).toEqual(src.sources);
      expect(res.body.xp).toMatchObject({ awarded: answerXp({ difficulty: src.difficulte, correct: true }).amount, quality: 1, firstTime: 1.5 });
      expect(res.body.session).toMatchObject({ answered: 1, correct: 1 });
      expect(res.body.progress.xp.total).toBe(res.body.xp.awarded);
    });

    test('mauvaise réponse : 0 XP, explication qui démonte l’erreur, pourquoi le choix est faux, solution révélée', async () => {
      const s = await c.start(LESSON(1));
      const qcm = s.body.items.find((i) => i.kind === 'mcq');
      const src = PILOT.items.get(qcm.key);
      const wrong = wrongResponse(src);
      const res = await c.answer(s.body.session.id, qcm.key, wrong);
      expect(res.body).toMatchObject({ correct: false, final: true, explanation: src.feedback_ko });
      expect(res.body.xp.awarded).toBe(0);
      expect(res.body.why).toBe(src.choix.find((x) => x.id === wrong.choice).distracteur_pourquoi);
      expect(res.body.solution.choice).toBe(src.bonne);
      expect(await count('xp_events')).toBe(0);
    });

    test('tous les types du pilote : une bonne réponse est acceptée par l’API', async () => {
      const kinds = new Set();
      for (let n = 1; n <= 9; n++) {
        const r = await c.playLesson(LESSON(n));
        expect(r.started.status).toBe(201);
        for (const a of r.answers) {
          expect(a.status).toBe(200);
          expect(a.body.correct).toBe(true);
        }
        r.started.body.items.forEach((i) => kinds.add(i.kind));
        expect(r.summary.body.summary.lessonCompleted).toBe(true);
      }
      expect([...kinds].sort()).toEqual(['cloze', 'flashcard', 'match', 'mcq', 'ordering', 'input', 'truefalse'].sort());
      const map = (await c.get(`/api/v1/universes/${SLUG}`)).body;
      expect(map.progress.lessonsCompleted).toBe(9);
      expect(map.progress.nextLessonKey).toBeNull();
    });

    test('réponse mal formée : 400 INVALID_RESPONSE et rien n’est écrit ; l’item reste jouable', async () => {
      const s = await c.start(LESSON(1));
      const qcm = s.body.items.find((i) => i.kind === 'mcq');
      const bad = await c.answer(s.body.session.id, qcm.key, { choice: 'Z' });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('INVALID_RESPONSE');
      expect(await count('attempts')).toBe(0);
      expect((await c.answer(s.body.session.id, qcm.key, correctResponse(PILOT.items.get(qcm.key)))).status).toBe(200);
    });

    test('Idempotency-Key obligatoire et valide', async () => {
      const s = await c.start(LESSON(1));
      const it = s.body.items[0];
      const url = `/api/v1/sessions/${s.body.session.id}/answers`;
      const body = { itemKey: it.key, response: { known: true } };
      expect((await c.post(url, body)).status).toBe(400);
      expect((await c.post(url, body, { 'Idempotency-Key': 'court' })).body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect((await c.post(url, { itemKey: it.key }, { 'Idempotency-Key': 'cle-valide-123' })).status).toBe(400); // response manquant
    });

    test('idempotence : même clé = même résultat, XP non doublée', async () => {
      const s = await c.start(LESSON(1));
      const it = s.body.items[0];
      const key = 'cle-idempotence-0001';
      const body = correctResponse(PILOT.items.get(it.key));
      const first = await c.answer(s.body.session.id, it.key, body, key);
      const xpAfterFirst = await totalXp();
      const again = await c.answer(s.body.session.id, it.key, body, key);
      expect(again.status).toBe(200);
      expect(again.body.replayed).toBe(true);
      expect(again.body.xp.awarded).toBe(first.body.xp.awarded);
      expect(again.body.correct).toBe(first.body.correct);
      expect(again.body.explanation).toBe(first.body.explanation);
      expect(await totalXp()).toBe(xpAfterFirst);
      expect(await count('attempts')).toBe(1);
      expect(await count('xp_events')).toBe(1);
      // même clé pour un autre item : refusé
      const other = await c.answer(s.body.session.id, s.body.items[1].key, { choice: 'A' }, key);
      expect(other.status).toBe(409);
      expect(other.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    test('un item ne reçoit qu’une réponse définitive (clé différente : 409 ALREADY_ANSWERED)', async () => {
      const s = await c.start(LESSON(1));
      const it = s.body.items[0];
      await c.answer(s.body.session.id, it.key, { known: true });
      const res = await c.answer(s.body.session.id, it.key, { known: true });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_ANSWERED');
      expect(await count('attempts')).toBe(1);
    });

    test('refuse un item hors session (400 ITEM_NOT_IN_SESSION), un item inconnu, et une session terminée', async () => {
      await unlockThrough(2);
      const s = await c.start(LESSON(1));
      const foreign = keysOfLesson(2)[0];
      const res = await c.answer(s.body.session.id, foreign, correctResponse(PILOT.items.get(foreign)));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ITEM_NOT_IN_SESSION');
      expect((await c.answer(s.body.session.id, `${SLUG}/inconnu/i99`, { known: true })).body.code).toBe('ITEM_NOT_IN_SESSION');
      expect(await count('attempts', `WHERE session_id = '${s.body.session.id}'`)).toBe(0);

      const done = await c.playLesson(LESSON(1));
      const late = await c.answer(done.sid, done.started.body.items[0].key, { known: true });
      expect(late.status).toBe(409);
      expect(late.body.code).toBe('SESSION_FINISHED');
    });

    test('indice mesuré côté serveur : le demander ramène l’XP de l’item à x0,6', async () => {
      const s = await c.start(LESSON(1));
      const qcm = s.body.items.find((i) => i.kind === 'mcq');
      const src = PILOT.items.get(qcm.key);
      const hint = await c.post(`/api/v1/sessions/${s.body.session.id}/hint`, { itemKey: qcm.key });
      expect(hint.body.hint).toBe(src.indice);
      const res = await c.answer(s.body.session.id, qcm.key, correctResponse(src));
      expect(res.body.xp.quality).toBe(0.6);
      expect(res.body.xp.awarded).toBe(answerXp({ difficulty: src.difficulte, correct: true, hintUsed: true }).amount);
      expect((await c.post(`/api/v1/sessions/${s.body.session.id}/hint`, { itemKey: 'x/y/z' })).status).toBe(400);
    });

    test('flashcard : auto-évaluée, rémunérée moitié moins ; le verso n’est révélé qu’après l’engagement', async () => {
      const s = await c.start(LESSON(1));
      const fc = s.body.items[0];
      const src = PILOT.items.get(fc.key);
      expect(JSON.stringify(fc)).not.toContain(src.verso);
      const res = await c.answer(s.body.session.id, fc.key, { known: true });
      expect(res.body.solution.back).toBe(src.verso);
      expect(res.body.xp.awarded).toBe(answerXp({ difficulty: src.difficulte, correct: true, kind: 'flashcard' }).amount);
    });
  });

  describe('boss : 3 vies, essais multiples', () => {
    const playToBoss = async () => {
      await unlockThrough(3);
      const s = await c.start(LESSON(3));
      const sid = s.body.session.id;
      for (const it of s.body.items.filter((i) => !i.isBoss)) await c.answer(sid, it.key, correctResponse(PILOT.items.get(it.key)));
      return sid;
    };

    test('chaque erreur coûte une vie, l’item reste rejouable, la solution n’est révélée qu’à la dernière', async () => {
      const sid = await playToBoss();
      const w1 = await c.answer(sid, BOSS_KEY, wrongResponse(bossItem));
      expect(w1.body).toMatchObject({ correct: false, final: false, explanation: null, solution: null });
      expect(w1.body.boss).toMatchObject({ lives: 2, canRetry: true });
      expect(w1.body.xp.awarded).toBe(0);
      const w2 = await c.answer(sid, BOSS_KEY, wrongResponse(bossItem));
      expect(w2.body.boss).toMatchObject({ lives: 1, canRetry: true });
      const w3 = await c.answer(sid, BOSS_KEY, wrongResponse(bossItem));
      expect(w3.body).toMatchObject({ correct: false, final: true });
      expect(w3.body.boss).toMatchObject({ lives: 0, canRetry: false });
      expect(w3.body.solution).toBeTruthy();
      expect(w3.body.explanation).toBe(bossItem.feedback_ko);
      const more = await c.answer(sid, BOSS_KEY, correctResponse(bossItem));
      expect(more.status).toBe(409);
      expect(more.body.code).toBe('ALREADY_ANSWERED');
    });

    test('boss perdu : la leçon n’est pas validée mais se rejoue gratuitement ; la suivante reste verrouillée', async () => {
      const sid = await playToBoss();
      for (let i = 0; i < 3; i++) await c.answer(sid, BOSS_KEY, wrongResponse(bossItem));
      const bilan = (await c.complete(sid)).body.summary;
      expect(bilan).toMatchObject({ lessonCompleted: false, bossDefeated: false, firstCompletion: false });
      expect(bilan.xp.bonus).toBe(0);
      const map = (await c.get(`/api/v1/universes/${SLUG}`)).body.chapters.flatMap((ch) => ch.lessons);
      expect(map[2].state).toBe('unlocked');
      expect(map[3].state).toBe('locked');
      expect((await c.start(LESSON(4))).status).toBe(403);
      // nouvel essai gratuit, réussi du premier coup
      const retry = await c.playLesson(LESSON(3));
      expect(retry.summary.body.summary).toMatchObject({ lessonCompleted: true, bossDefeated: true });
      expect((await c.start(LESSON(4))).status).toBe(201);
    });

    test('boss réussi après une erreur : valide, mais XP réduite (x0,6) ; réussi du premier coup : XP pleine', async () => {
      const sid = await playToBoss();
      await c.answer(sid, BOSS_KEY, wrongResponse(bossItem));
      const ok = await c.answer(sid, BOSS_KEY, correctResponse(bossItem));
      expect(ok.body).toMatchObject({ correct: true, final: true });
      expect(ok.body.boss).toMatchObject({ lives: 2, defeated: true });
      expect(ok.body.xp.awarded).toBe(answerXp({ difficulty: bossItem.difficulte, correct: true, retried: true }).amount);
      const bilan = (await c.complete(sid)).body.summary;
      expect(bilan).toMatchObject({ lessonCompleted: true, bossDefeated: true });
    });

    test('mode challenge : les boss des leçons débloquées ; refusé tant qu’aucun n’est accessible', async () => {
      expect((await c.post('/api/v1/sessions', { mode: 'challenge', universe: SLUG })).status).toBe(409);
      await unlockThrough(3);
      const res = await c.post('/api/v1/sessions', { mode: 'challenge', universe: SLUG });
      expect(res.status).toBe(201);
      expect(res.body.items.map((i) => i.key)).toEqual([BOSS_KEY]);
      expect(res.body.session).toMatchObject({ mode: 'challenge', lives: 3 });
      await c.answer(res.body.session.id, BOSS_KEY, correctResponse(bossItem));
      const bilan = (await c.complete(res.body.session.id)).body.summary;
      expect(bilan).toMatchObject({ mode: 'challenge', lessonCompleted: false, bossDefeated: true });
      expect(bilan.xp.bonus).toBe(0);
    });
  });

  describe('fin de session : bilan', () => {
    test('XP total, précision, streak, niveau, leçon suivante ; bonus de mission = XP de la leçon + 5 x floor(précision x 10)', async () => {
      const miss = keysOfLesson(1).find((k) => PILOT.items.get(k).type === 'trous');
      const r = await c.playLesson(LESSON(1), { wrongKeys: [miss] });
      const sum = r.summary.body.summary;
      const answersXp = r.answers.reduce((n, a) => n + a.body.xp.awarded, 0);
      expect(sum).toMatchObject({ correct: 3, total: 4, accuracy: 0.75, perfect: false, lessonCompleted: true, firstCompletion: true, bossDefeated: null, replayed: false });
      expect(sum.xp).toEqual({ answers: answersXp, bonus: missionBonus(0.75, 20), total: answersXp + missionBonus(0.75, 20) });
      expect(sum.streak).toMatchObject({ current: 1, doneToday: true });
      expect(sum.dailyGoal).toMatchObject({ xp: 30, met: true });
      expect(sum.next).toEqual({ key: LESSON(2), title: expect.any(String) });
      expect(sum.xpTotal).toBe(sum.xp.total);
      expect(await totalXp()).toBe(sum.xp.total);
      const lp = (await t.db.query('SELECT status, best_score, runs FROM lesson_progress')).rows[0];
      expect(lp.status).toBe('completed');
      expect(Number(lp.best_score)).toBe(75);
    });

    test('terminer avant d’avoir tout répondu : 409 SESSION_INCOMPLETE', async () => {
      const s = await c.start(LESSON(1));
      await c.answer(s.body.session.id, s.body.items[0].key, { known: true });
      const res = await c.complete(s.body.session.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SESSION_INCOMPLETE');
    });

    test('terminer deux fois rend le même bilan, sans nouveau bonus ; /finish est un alias', async () => {
      const r = await c.playLesson(LESSON(1));
      const xp = await totalXp();
      const again = await c.complete(r.sid);
      expect(again.body.summary.replayed).toBe(true);
      expect(again.body.summary.xp).toEqual(r.summary.body.summary.xp);
      const alias = await c.post(`/api/v1/sessions/${r.sid}/finish`);
      expect(alias.status).toBe(200);
      expect(await totalXp()).toBe(xp);
      expect(await count('xp_events', "WHERE reason = 'lesson_complete'")).toBe(1);
    });

    test('rejouer une leçon : pas de nouveau bonus de mission (anti-grind), XP de révision (x1 au lieu de x1,5)', async () => {
      const first = await c.playLesson(LESSON(1));
      const second = await c.playLesson(LESSON(1));
      expect(second.summary.body.summary).toMatchObject({ firstCompletion: false });
      expect(second.summary.body.summary.xp.bonus).toBe(0);
      expect(second.summary.body.summary.xp.answers).toBeLessThan(first.summary.body.summary.xp.answers);
      expect((await t.db.query('SELECT runs FROM lesson_progress')).rows[0].runs).toBe(2);
    });

    test('mode review : rejoue d’abord les items ratés ; refusé s’il n’y a rien à réviser ; pas de bonus de mission', async () => {
      expect((await c.post('/api/v1/sessions', { mode: 'review', universe: SLUG })).status).toBe(409);
      const miss = keysOfLesson(1).find((k) => PILOT.items.get(k).type === 'qcm');
      await c.playLesson(LESSON(1), { wrongKeys: [miss] });
      const rev = await c.post('/api/v1/sessions', { mode: 'review', universe: SLUG });
      expect(rev.status).toBe(201);
      expect(rev.body.session.mode).toBe('review');
      expect(rev.body.items[0].key).toBe(miss);
      expect(rev.body.items).toHaveLength(4);
      for (const it of rev.body.items) await c.answer(rev.body.session.id, it.key, correctResponse(PILOT.items.get(it.key)));
      const bilan = (await c.complete(rev.body.session.id)).body.summary;
      expect(bilan).toMatchObject({ mode: 'review', lessonCompleted: false });
      expect(bilan.xp.bonus).toBe(0);
      // l'item raté, enfin réussi, rapporte l'XP « première réussite »
      expect(await count('attempts', 'WHERE is_correct = true')).toBe(4 - 1 + 4);
    });
  });

  describe('XP, classement et atomicité', () => {
    test('XP et leaderboard_weekly sont écrits ensemble : le classement (global + univers) égale l’XP gagnée', async () => {
      const r = await c.playLesson(LESSON(1));
      const total = r.summary.body.summary.xp.total;
      const rows = (await t.db.query('SELECT universe_id, xp, week_start FROM leaderboard_weekly ORDER BY universe_id')).rows;
      expect(rows).toHaveLength(2);
      expect(rows.map((x) => Number(x.xp))).toEqual([total, total]);
      expect(rows[0].universe_id).toBe(0);
      expect(Number((await t.db.query('SELECT sum(amount) AS s FROM xp_events')).rows[0].s)).toBe(total);
      expect(Number((await t.db.query('SELECT xp_total FROM user_universes')).rows[0].xp_total)).toBe(total);
    });

    test('plafond anti-grind : au-delà de 600 XP dans la journée locale, l’XP est comptée mais ne crédite plus le classement', async () => {
      const today = localDay(new Date(), 'Europe/Paris');
      await t.db.query('INSERT INTO daily_activity (user_id, day, xp, items_answered, goal_met) VALUES ($1, $2, 590, 0, true)', [c.user.id, today]);
      const r = await c.playLesson(LESSON(1));
      const total = r.summary.body.summary.xp.total;
      expect(total).toBeGreaterThan(100);
      const lb = (await t.db.query('SELECT xp FROM leaderboard_weekly WHERE universe_id = 0')).rows[0];
      expect(Number(lb.xp)).toBe(10); // 600 - 590
      expect(await totalXp()).toBe(total);
    });

    realOnly('atomicité : si l’écriture du classement échoue, la réponse, l’XP et la tentative sont annulées', async () => {
      const failing = {
        ...t.db,
        tx: (fn) => t.db.tx((client) => fn({
          query: (text, params) => (/INSERT INTO leaderboard_weekly/.test(text) ? Promise.reject(new Error('panne simulée')) : client.query(text, params))
        }))
      };
      const { app: brokenApp } = buildApp(failing, { SHOW_DRAFT_UNIVERSES: 'true' });
      const bc = client(brokenApp);
      bc.cookie = c.cookie; // même joueur
      const s = await bc.start(LESSON(1));
      const res = await bc.answer(s.body.session.id, s.body.items[0].key, { known: true });
      expect(res.status).toBe(500);
      expect(await count('attempts')).toBe(0);
      expect(await count('xp_events')).toBe(0);
      expect(await count('daily_activity')).toBe(0);
      expect(await count('user_universes')).toBe(0);
      expect(await totalXp()).toBe(0);
      // la réponse peut être renvoyée ensuite avec la même clé : elle compte une seule fois
      const ok = await c.answer(s.body.session.id, s.body.items[0].key, { known: true });
      expect(ok.status).toBe(200);
      expect(await count('attempts')).toBe(1);
    });

    test('fuseau de l’utilisateur : le jour d’activité est le jour local', async () => {
      const patch = await request(app).patch('/api/v1/me').set('Cookie', c.cookie).set('X-MML', '1').send({ timezone: 'Pacific/Auckland' });
      expect(patch.status).toBe(200);
      await c.playLesson(LESSON(1));
      expect(asDay((await t.db.query('SELECT day FROM daily_activity')).rows[0].day)).toBe(localDay(new Date(), 'Pacific/Auckland'));
      expect((await c.get('/api/v1/progress')).body.today).toBe(localDay(new Date(), 'Pacific/Auckland'));
    });
  });

  describe('concurrence', () => {
    test('deux réponses simultanées avec la MÊME clé : un seul enregistrement, XP comptée une fois, résultats identiques', async () => {
      const s = await c.start(LESSON(1));
      const it = s.body.items.find((i) => i.kind === 'mcq');
      const body = correctResponse(PILOT.items.get(it.key));
      const key = 'cle-concurrente-0001';
      const [a, b] = await Promise.all([c.answer(s.body.session.id, it.key, body, key), c.answer(s.body.session.id, it.key, body, key)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.xp.awarded).toBe(b.body.xp.awarded);
      expect(a.body.correct).toBe(b.body.correct);
      expect([a.body.replayed, b.body.replayed].sort()).toEqual([false, true]);
      expect(await count('attempts')).toBe(1);
      expect(await count('xp_events')).toBe(1);
      expect(await totalXp()).toBe(a.body.xp.awarded);
    });

    test('deux réponses simultanées au même item avec des clés différentes : une seule gagne (409 pour l’autre)', async () => {
      const s = await c.start(LESSON(1));
      const it = s.body.items.find((i) => i.kind === 'mcq');
      const body = correctResponse(PILOT.items.get(it.key));
      const [a, b] = await Promise.all([c.answer(s.body.session.id, it.key, body, 'cle-concurrente-A001'), c.answer(s.body.session.id, it.key, body, 'cle-concurrente-B001')]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await count('attempts')).toBe(1);
      expect(await count('xp_events')).toBe(1);
    });

    realOnly('réponses simultanées à des items différents : aucune mise à jour perdue (XP, streak, classement)', async () => {
      const s = await c.start(LESSON(1));
      const results = await Promise.all(s.body.items.map((it) => c.answer(s.body.session.id, it.key, correctResponse(PILOT.items.get(it.key)))));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      const sum = results.reduce((n, r) => n + r.body.xp.awarded, 0);
      expect(await totalXp()).toBe(sum);
      expect(Number((await t.db.query('SELECT xp FROM daily_activity')).rows[0].xp)).toBe(sum);
      expect(Number((await t.db.query('SELECT xp FROM leaderboard_weekly WHERE universe_id = 0')).rows[0].xp)).toBe(sum);
      expect(await count('streaks')).toBe(1);
      const done = await c.complete(s.body.session.id);
      expect(done.status).toBe(200);
      expect(done.body.summary.xp.answers).toBe(sum);
    });

    realOnly('terminer deux fois en parallèle : le bonus n’est versé qu’une fois', async () => {
      const s = await c.start(LESSON(1));
      for (const it of s.body.items) await c.answer(s.body.session.id, it.key, correctResponse(PILOT.items.get(it.key)));
      const [a, b] = await Promise.all([c.complete(s.body.session.id), c.complete(s.body.session.id)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await count('xp_events', "WHERE reason = 'lesson_complete'")).toBe(1);
      expect(a.body.summary.xp.total).toBe(b.body.summary.xp.total);
    });
  });

  describe('suppression de compte (DELETE /me)', () => {
    test('purge toute la progression de jeu (cascade) sans toucher aux autres joueurs', async () => {
      const other = client(app);
      await other.guest();
      await other.playLesson(LESSON(1));
      await c.playLesson(LESSON(1));
      const before = await count('attempts');
      const del = await c.del('/api/v1/me');
      expect(del.status).toBe(204);
      for (const table of ['play_sessions', 'attempts', 'xp_events', 'user_universes', 'lesson_progress', 'daily_activity', 'streaks', 'leaderboard_weekly']) {
        expect({ table, mine: await count(table, `WHERE user_id = '${c.user.id}'`) }).toEqual({ table, mine: 0 });
      }
      expect(await count('attempts')).toBe(before / 2);
      expect(await count('attempts', `WHERE user_id = '${other.user.id}'`)).toBe(before / 2);
    });
  });

  (REAL ? describe : describe.skip)('vrai Postgres : schéma de la migration 003', () => {
    test('un item de boss peut avoir plusieurs essais, mais jamais deux fois le même numéro d’essai', async () => {
      const s = await c.start(LESSON(1));
      const attempt = (tryNo) => t.db.query(
        `INSERT INTO attempts (user_id, session_id, item_id, is_correct, rating, try_no, is_final) SELECT $1, $2, id, false, 1, $3, false FROM items LIMIT 1`,
        [c.user.id, s.body.session.id, tryNo]
      );
      await attempt(1);
      await attempt(2);
      await expect(attempt(2)).rejects.toThrow(/attempts_session_item_try_uq/);
    });

    test('003 est rejouable telle quelle', async () => {
      const { listMigrations } = require('../src/lib/migrate');
      const sql = listMigrations().find((m) => m.name === '003_game_play.sql').sql;
      await t.db.query(sql);
      await t.db.query(sql);
    });
  });
});
