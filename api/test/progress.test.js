'use strict';

const request = require('supertest');
const { createTestDb } = require('./helpers/testdb');
const { setupGame, client, LESSON, PILOT, correctResponse } = require('./helpers/game');
const { localDay, addDays } = require('../src/lib/dates');
const { asDay } = require('../src/lib/ledger');

const TZ = 'Europe/Paris';

describe('progression : XP, niveau, streak, objectif du jour (lot 4 / base lot 6)', () => {
  let t;
  let app;
  let c;
  const today = () => localDay(new Date(), TZ);
  const seedStreak = (patch) => {
    const s = { current: 5, longest: 8, last: null, freezes: 1, refill: null, ...patch };
    return t.db.query(
      'INSERT INTO streaks (user_id, current_days, longest_days, last_active_day, freezes_available, freeze_refill_on) VALUES ($1, $2, $3, $4, $5, $6)',
      [c.user.id, s.current, s.longest, s.last, s.freezes, s.refill]
    );
  };
  const streakRow = async () => (await t.db.query('SELECT current_days, longest_days, last_active_day, freezes_available, freeze_refill_on FROM streaks')).rows[0];
  const progress = async () => (await c.get('/api/v1/progress')).body;

  beforeEach(async () => {
    t = await createTestDb();
    ({ app } = await setupGame(t));
    c = client(app);
    await c.guest();
  });
  afterEach(async () => { await t.close(); });

  test('exige un joueur (401 sans cookie)', async () => {
    expect((await request(app).get('/api/v1/progress')).status).toBe(401);
  });

  test('nouveau joueur : rien, niveau 1, objectif du jour de 30 XP, aucune activité', async () => {
    const p = await progress();
    expect(p).toMatchObject({
      xp: { total: 0, today: 0, dailyCap: 600 },
      level: { level: 1, xp: 0, xpToNext: 283 },
      dailyGoal: { xp: 30, done: 0, met: false },
      streak: { current: 0, longest: 0, doneToday: false, freezesAvailable: 1, thresholdXp: 30 },
      lastActivityAt: null,
      lessonsCompleted: 0,
      universes: []
    });
    expect(p.today).toBe(today());
  });

  test('après une leçon : XP, niveau, objectif atteint, streak de 1, dernière activité, XP par univers', async () => {
    const r = await c.playLesson(LESSON(1));
    const total = r.summary.body.summary.xp.total;
    const p = await progress();
    expect(p.xp).toMatchObject({ total, today: total });
    expect(p.level.level).toBe(total >= 283 ? 2 : 1);
    expect(p.dailyGoal).toMatchObject({ done: total, met: true, itemsAnswered: 4 });
    expect(p.streak).toMatchObject({ current: 1, longest: 1, doneToday: true, lastActiveDay: today() });
    expect(new Date(p.lastActivityAt).getTime()).toBeGreaterThan(Date.now() - 60000);
    expect(p.lessonsCompleted).toBe(1);
    expect(p.universes).toEqual([{ slug: 'bureau-des-doutes', xp: total, lastPlayedAt: expect.any(String) }]);
  });

  test('le streak n’est validé qu’à 30 XP dans la journée : 14 XP ne suffisent pas, la suite oui', async () => {
    const s = await c.start(LESSON(1));
    const [fc, qcm, tf] = s.body.items;
    const a1 = await c.answer(s.body.session.id, qcm.key, correctResponse(PILOT.items.get(qcm.key)));
    expect(a1.body.progress.streak.doneToday).toBe(false);
    expect((await progress()).streak.current).toBe(0);
    expect(Number((await t.db.query('SELECT count(*) AS n FROM streaks')).rows[0].n)).toBe(0);
    const a2 = await c.answer(s.body.session.id, tf.key, correctResponse(PILOT.items.get(tf.key)));
    const a3 = await c.answer(s.body.session.id, fc.key, { known: true });
    expect(a1.body.xp.awarded + a2.body.xp.awarded).toBeGreaterThanOrEqual(28);
    expect(a3.body.progress.streak).toMatchObject({ current: 1, doneToday: true });
    expect(a3.body.streakExtended || a2.body.streakExtended).toBe(true);
  });

  test('jour suivant : la série passe à N+1 ; hier validé = série vivante avant même de rejouer', async () => {
    await seedStreak({ current: 5, longest: 8, last: addDays(today(), -1) });
    expect((await progress()).streak).toMatchObject({ current: 5, doneToday: false });
    await c.playLesson(LESSON(1));
    const row = await streakRow();
    expect(row.current_days).toBe(6);
    expect(row.longest_days).toBe(8);
    expect(asDay(row.last_active_day)).toBe(today());
    expect((await progress()).streak).toMatchObject({ current: 6, doneToday: true });
  });

  test('un jour manqué est comblé par le gel gratuit (consommé, rechargé le lundi suivant)', async () => {
    await seedStreak({ current: 5, last: addDays(today(), -2), freezes: 1 });
    expect((await progress()).streak).toMatchObject({ current: 5, freezeWillApply: true });
    await c.playLesson(LESSON(1));
    const row = await streakRow();
    expect(row.current_days).toBe(6);
    expect(row.freezes_available).toBe(0);
    expect(asDay(row.freeze_refill_on) > today()).toBe(true);
    expect(new Date(`${asDay(row.freeze_refill_on)}T00:00:00Z`).getUTCDay()).toBe(1); // un lundi
  });

  test('sans gel disponible, un jour manqué remet la série à 1 sans perte d’XP ni du record', async () => {
    await seedStreak({ current: 5, longest: 8, last: addDays(today(), -2), freezes: 0, refill: addDays(today(), 3) });
    expect((await progress()).streak.current).toBe(0);
    const r = await c.playLesson(LESSON(1));
    expect((await streakRow())).toMatchObject({ current_days: 1, longest_days: 8 });
    expect((await progress()).xp.total).toBe(r.summary.body.summary.xp.total);
  });

  test('deux jours manqués : série remise à 1 même avec un gel', async () => {
    await seedStreak({ current: 9, longest: 9, last: addDays(today(), -3), freezes: 1 });
    await c.playLesson(LESSON(1));
    expect((await streakRow())).toMatchObject({ current_days: 1, longest_days: 9, freezes_available: 1 });
  });

  test('un seul incrément par jour : une 2e leçon le même jour ne touche pas la série', async () => {
    await seedStreak({ current: 5, last: addDays(today(), -1) });
    await c.playLesson(LESSON(1));
    await c.playLesson(LESSON(2));
    expect((await streakRow()).current_days).toBe(6);
  });

  test('montée de niveau signalée dans la réponse et dans le bilan', async () => {
    await t.db.query('INSERT INTO user_universes (user_id, universe_id, xp_total) SELECT $1, id, 270 FROM universes', [c.user.id]);
    const s = await c.start(LESSON(1));
    const qcm = s.body.items.find((i) => i.kind === 'mcq');
    const res = await c.answer(s.body.session.id, qcm.key, correctResponse(PILOT.items.get(qcm.key)));
    expect(res.body.levelUp).toBe(true); // 270 + 14 = 284 >= 283 : niveau 2
    expect(res.body.progress.level.level).toBe(2);
    const next = await c.answer(s.body.session.id, s.body.items[2].key, correctResponse(PILOT.items.get(s.body.items[2].key)));
    expect(next.body.levelUp).toBe(false);
  });

  test('objectif quotidien réglable (PATCH /me) : la barre « objectif du jour » suit', async () => {
    const patch = await request(app).patch('/api/v1/me').set('Cookie', c.cookie).set('X-MML', '1').send({ dailyGoalXp: 100 });
    expect(patch.status).toBe(200);
    const s = await c.start(LESSON(1));
    const a = await c.answer(s.body.session.id, s.body.items[1].key, correctResponse(PILOT.items.get(s.body.items[1].key)));
    expect(a.body.progress.dailyGoal).toMatchObject({ xp: 100, met: false });
    expect(a.body.progress.streak.thresholdXp).toBe(30); // le streak reste validé à 30 XP
  });
});
