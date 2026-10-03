'use strict';

const request = require('supertest');
const { createTestDb } = require('./helpers/testdb');
const { setupGame, client, LESSON, SLUG } = require('./helpers/game');

describe('univers : liste et carte des leçons (lot 4)', () => {
  let t;
  beforeEach(async () => { t = await createTestDb(); });
  afterEach(async () => { await t.close(); });

  test('univers draft : masqués par défaut (liste, carte, session), listés avec beta:true si SHOW_DRAFT_UNIVERSES', async () => {
    const hidden = await setupGame(t, { SHOW_DRAFT_UNIVERSES: 'false' });
    const c = client(hidden.app);
    await c.guest();
    expect((await c.get('/api/v1/universes')).body.universes).toEqual([]);
    expect((await c.get(`/api/v1/universes/${SLUG}`)).status).toBe(404);
    expect((await c.start(LESSON(1))).status).toBe(404);

    const shown = client(setupGameApp(t, { SHOW_DRAFT_UNIVERSES: 'true' }));
    await shown.guest();
    const list = (await shown.get('/api/v1/universes')).body.universes;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ slug: SLUG, beta: true, lessonCount: 9, completedCount: 0, theme: { color: '#6C5CE7' } });
    expect(list[0].mascot).toMatchObject({ id: 'pie', name: 'Pie' });
    expect((await shown.start(LESSON(1))).status).toBe(201);
  });

  test('un univers publié est listé sans indicateur beta, même sans SHOW_DRAFT_UNIVERSES', async () => {
    const { app } = await setupGame(t, { SHOW_DRAFT_UNIVERSES: 'false' });
    await t.db.query("UPDATE universes SET status = 'published'");
    const list = (await request(app).get('/api/v1/universes')).body.universes;
    expect(list).toHaveLength(1);
    expect(list[0].beta).toBe(false);
  });

  test('la liste est publique (sans cookie) ; la carte aussi, avec une progression vide', async () => {
    const { app } = await setupGame(t);
    const res = await request(app).get(`/api/v1/universes/${SLUG}`);
    expect(res.status).toBe(200);
    expect(res.body.progress).toMatchObject({ xp: 0, lessonsCompleted: 0, lessonsTotal: 9 });
  });

  test('carte : chapitres, lore, personnages ; seule la 1re leçon est débloquée ; prérequis exposés ; aucune solution', async () => {
    const { app } = await setupGame(t);
    const c = client(app);
    await c.guest();
    const res = await c.get(`/api/v1/universes/${SLUG}`);
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.universe.title).toBe('Le Bureau des Doutes');
    expect(b.universe.beta).toBe(true);
    expect(b.universe.characters.map((x) => x.id)).toEqual(['mirabelle', 'pie']);
    expect(b.universe.lore.monde).toMatch(/Brumelune/);
    expect(b.chapters.map((x) => x.id)).toEqual(['c01', 'c02', 'c03']);
    const lessons = b.chapters.flatMap((ch) => ch.lessons);
    expect(lessons).toHaveLength(9);
    expect(lessons.map((l) => l.state)).toEqual(['unlocked', ...Array(8).fill('locked')]);
    expect(lessons[1].requires).toEqual([lessons[0].key]);
    expect(lessons[0]).toMatchObject({ itemCount: 4, hasBoss: false, xpReward: 20, chapter: 'c01' });
    expect(lessons[2].hasBoss).toBe(true);
    expect(lessons[0]).not.toHaveProperty('id');
    // compétences : prérequis + état dérivé des leçons
    const skill = b.skills.find((s) => s.id === 'bdd.biais.confirmation');
    expect(skill).toMatchObject({ requires: [], state: 'unlocked', lessons: [lessons[0].key] });
    expect(b.skills.find((s) => s.id === 'bdd.biais.ancrage').requires).toEqual(['bdd.biais.confirmation']);
    // jamais de solution dans la carte
    const json = JSON.stringify(b);
    for (const f of ['bonne', 'feedback_ok', 'reponses_acceptees', 'micro_cours']) expect(json).not.toContain(`"${f}"`);
  });

  test('terminer une leçon débloque la suivante et met à jour la progression', async () => {
    const { app } = await setupGame(t);
    const c = client(app);
    await c.guest();
    const r = await c.playLesson(LESSON(1));
    expect(r.summary.status).toBe(200);
    const b = (await c.get(`/api/v1/universes/${SLUG}`)).body;
    const states = b.chapters.flatMap((ch) => ch.lessons).map((l) => l.state);
    expect(states.slice(0, 3)).toEqual(['completed', 'unlocked', 'locked']);
    expect(b.progress).toMatchObject({ lessonsCompleted: 1, lessonsTotal: 9 });
    expect(b.progress.xp).toBeGreaterThan(0);
    expect(b.progress.nextLessonKey).toBe(LESSON(2));
    expect(b.skills.find((s) => s.id === 'bdd.biais.confirmation').state).toBe('completed');
    const list = (await c.get('/api/v1/universes')).body.universes[0];
    expect(list).toMatchObject({ completedCount: 1, nextLessonKey: LESSON(2) });
  });

  test('un autre joueur ne voit pas la progression du premier', async () => {
    const { app } = await setupGame(t);
    const a = client(app);
    await a.guest();
    await a.playLesson(LESSON(1));
    const b = client(app);
    await b.guest();
    const res = await b.get(`/api/v1/universes/${SLUG}`);
    expect(res.body.progress.lessonsCompleted).toBe(0);
  });

  test('univers inconnu : 404 JSON', async () => {
    const { app } = await setupGame(t);
    const res = await request(app).get('/api/v1/universes/inconnu');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('UNIVERSE_NOT_FOUND');
  });
});

// Application supplémentaire sur la même base (variante d'environnement)
function setupGameApp(t, env) {
  const { buildApp } = require('./helpers/app');
  return buildApp(t.db, env).app;
}
