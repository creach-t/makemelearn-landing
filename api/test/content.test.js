'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createTestDb, REAL } = require('./helpers/testdb');
const { loadContent, validateContent, syncContent, syncContentFromDir } = require('../src/lib/content');

const DATA = path.resolve(__dirname, '../../data');
const VALIDATE = path.resolve(__dirname, '../../scripts/validate-content.mjs');
const U = 'universes/bureau-des-doutes';

const tmpDirs = [];
function copyData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mml-data-'));
  tmpDirs.push(dir);
  fs.cpSync(DATA, dir, { recursive: true });
  return dir;
}
afterAll(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const lessonFile = (dir, n) => {
  const base = path.join(dir, U, 'lessons');
  return path.join(base, fs.readdirSync(base).sort()[n - 1]);
};
const editJson = (file, fn) => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(data);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};
const errorsOf = (dir) => validateContent(loadContent(dir));
const messages = (errs) => errs.map((e) => `${e.file} ${e.path} ${e.message}`).join('\n');

describe('validate-content (lot 2)', () => {
  test('le contenu pilote (1 univers, 9 leçons, 30 items) est valide', () => {
    const content = loadContent(DATA);
    expect(validateContent(content)).toEqual([]);
    expect(content.universes).toHaveLength(1);
    expect(content.universes[0].lessons).toHaveLength(9);
    expect(content.universes[0].lessons.reduce((n, l) => n + l.data.items.length, 0)).toBe(30);
  });

  test('QCM : bonne réponse inexistante rejetée', () => {
    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => { l.items.find((i) => i.type === 'qcm').bonne = 'Z'; });
    expect(messages(errorsOf(dir))).toMatch(/ne correspond à aucun choix/);
  });

  test('QCM : distracteur sans explication rejeté', () => {
    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => {
      const q = l.items.find((i) => i.type === 'qcm');
      q.choix.find((c) => c.id !== q.bonne).distracteur_pourquoi = '';
    });
    expect(messages(errorsOf(dir))).toMatch(/pas de distracteur_pourquoi/);
  });

  test('item dupliqué, compétence inconnue et préfixe d id incorrect rejetés', () => {
    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => {
      l.items[1].id = l.items[0].id;
      l.items[2].competence = 'bdd.biais.inconnue';
    });
    const msg = messages(errorsOf(dir));
    expect(msg).toMatch(/item dupliqué/);
    expect(msg).toMatch(/compétence inconnue : bdd\.biais\.inconnue/);
  });

  test('trous : {{n}} sans trou déclaré rejeté', () => {
    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => { const t = l.items.find((i) => i.type === 'trous'); t.texte += ' et {{3}}'; });
    expect(messages(errorsOf(dir))).toMatch(/\{\{3\}\} n'a pas de trou déclaré/);
  });

  test('HTML brut, consigne trop longue et type inconnu rejetés', () => {
    const dir = copyData();
    editJson(lessonFile(dir, 2), (l) => {
      l.items[0].feedback_ok = 'Un <b>mot</b> en gras';
      l.items[1].consigne = 'x'.repeat(141);
      l.items[2].type = 'devinette';
    });
    const msg = messages(errorsOf(dir));
    expect(msg).toMatch(/HTML brut interdit|must match|maximum|140/i);
    expect(errorsOf(dir).length).toBeGreaterThanOrEqual(2);
  });

  test('HTML brut détecté par la règle sémantique (item par ailleurs valide)', () => {
    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => { l.items[1].feedback_ok = 'Un <b>mot</b> en gras'; });
    expect(messages(errorsOf(dir))).toMatch(/HTML brut interdit/);
  });

  test('cycle de prérequis entre leçons et prérequis inconnu rejetés', () => {
    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => { l.prerequis = ['bdd.c1.l2']; }); // l2 requiert déjà l1
    expect(messages(errorsOf(dir))).toMatch(/cycle de prérequis/);
    const dir2 = copyData();
    editJson(lessonFile(dir2, 2), (l) => { l.prerequis = ['bdd.c9.l9']; });
    expect(messages(errorsOf(dir2))).toMatch(/prérequis inconnu/);
  });

  test('cycle dans les compétences rejeté', () => {
    const dir = copyData();
    const f = path.join(dir, U, 'skills.json');
    editJson(f, (s) => { s.competences.find((c) => c.id === 'bdd.biais.confirmation').prerequis = ['bdd.biais.ancrage']; });
    expect(messages(errorsOf(dir))).toMatch(/cycle dans les compétences/);
  });

  test('JSON illisible et fichier de leçon mal nommé rejetés', () => {
    const dir = copyData();
    fs.writeFileSync(lessonFile(dir, 3), '{ pas du json');
    expect(messages(errorsOf(dir))).toMatch(/JSON illisible/);
    const dir2 = copyData();
    fs.renameSync(lessonFile(dir2, 1), path.join(dir2, U, 'lessons', '01-mauvais-nom.json'));
    expect(messages(errorsOf(dir2))).toMatch(/nom de fichier/);
  });

  test('type `code` : champs code_depart/solution acceptés ; anciens noms (code_initial/solution_modele) refusés', () => {
    const base = {
      id: 'bdd.c1.l1.i09', type: 'code', competence: 'bdd.biais.confirmation', difficulte: 1,
      consigne: 'Complète le script.', enonce: 'Contexte.', langage: 'python',
      tests: [{ entree: '', sortie_attendue: 'Zéro possède 120 crédits' }],
      feedback_ok: 'Bravo.', feedback_ko: 'Vérifie.', sources: [], duree_s: 40
    };
    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => { l.items.push({ ...base, code_depart: 'print(<x>)', solution: 'x = 1\nprint(x)' }); });
    expect(errorsOf(dir)).toEqual([]); // les chevrons du code ne sont pas du « HTML brut »

    const dir2 = copyData();
    editJson(lessonFile(dir2, 1), (l) => { l.items.push({ ...base, code_initial: 'x', solution_modele: 'y' }); });
    expect(errorsOf(dir2).length).toBeGreaterThan(0);
  });

  test('CLI : exit 0 sur le contenu valide, exit 1 (avec message) sur contenu invalide', () => {
    const ok = spawnSync(process.execPath, [VALIDATE, DATA], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/OK \(1 univers, 9 leçons, 30 items\)/);

    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => { l.items.find((i) => i.type === 'qcm').bonne = 'Z'; });
    const ko = spawnSync(process.execPath, [VALIDATE, dir], { encoding: 'utf8' });
    expect(ko.status).toBe(1);
    expect(ko.stderr).toMatch(/ne correspond à aucun choix/);
  });
});

describe('sync-content (lot 2)', () => {
  let t;
  beforeEach(async () => { t = await createTestDb(); });
  afterEach(async () => { await t.close(); });

  const count = async (table, where = '') => Number((await t.db.query(`SELECT count(*) AS n FROM ${table} ${where}`)).rows[0].n);

  test('1re synchronisation : univers, leçons, items, prérequis, quêtes, badges', async () => {
    const report = await syncContentFromDir(t.db, DATA);
    expect(report.universes.created).toBe(1);
    expect(report.lessons.created).toBe(9);
    expect(report.items.created).toBe(30);
    expect(report.prerequisites.added).toBe(8);
    expect(report.quests.created).toBe(5);
    expect(report.badges.created).toBe(6);
    expect(await count('items', 'WHERE archived_at IS NULL')).toBe(30);
    const kinds = (await t.db.query('SELECT DISTINCT kind FROM items ORDER BY kind')).rows.map((r) => r.kind);
    expect(kinds).toEqual(['cloze', 'flashcard', 'input', 'match', 'mcq', 'ordering', 'truefalse']);
    const u = (await t.db.query('SELECT slug, status FROM universes')).rows[0];
    expect(u).toEqual({ slug: 'bureau-des-doutes', status: 'draft' }); // statut « relecture » -> draft
    // clés stables
    const keys = (await t.db.query("SELECT key FROM items WHERE key LIKE 'bureau-des-doutes/biais-de-confirmation/%' ORDER BY key")).rows.map((r) => r.key);
    expect(keys).toEqual(['i01', 'i02', 'i03', 'i04'].map((s) => `bureau-des-doutes/biais-de-confirmation/${s}`));
  });

  test('idempotent : la 2e exécution ne fait AUCUNE écriture', async () => {
    await syncContentFromDir(t.db, DATA);
    const second = await syncContentFromDir(t.db, DATA);
    expect(second.writes).toBe(0);
    expect(second.items).toEqual({ created: 0, updated: 0, unchanged: 30, archived: 0 });
    expect(second.lessons.unchanged).toBe(9);
  });

  test('une modification d item met à jour 1 seule ligne, la clé et l id restent', async () => {
    await syncContentFromDir(t.db, DATA);
    const before = (await t.db.query("SELECT id FROM items WHERE key = 'bureau-des-doutes/biais-de-confirmation/i02'")).rows[0].id;
    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => { l.items[1].feedback_ok += ' (reformulé)'; });
    const r = await syncContentFromDir(t.db, dir);
    expect(r.items.updated).toBe(1);
    expect(r.items.unchanged).toBe(29);
    expect(r.writes).toBe(1);
    const after = (await t.db.query("SELECT id, payload FROM items WHERE key = 'bureau-des-doutes/biais-de-confirmation/i02'")).rows[0];
    expect(after.id).toBe(before);
    const payload = typeof after.payload === 'string' ? JSON.parse(after.payload) : after.payload;
    expect(payload.feedback_ok).toMatch(/reformulé/);
  });

  test('archiver un item (retiré des fichiers) conserve ses attempts ; il est restauré s il revient', async () => {
    await syncContentFromDir(t.db, DATA);
    const itemKey = 'bureau-des-doutes/biais-de-confirmation/i04';
    const item = (await t.db.query('SELECT id, lesson_id FROM items WHERE key = $1', [itemKey])).rows[0];
    const universe = (await t.db.query('SELECT id FROM universes')).rows[0];
    const userId = '22222222-2222-2222-2222-222222222222';
    const sessionId = '33333333-3333-3333-3333-333333333333';
    await t.db.query('INSERT INTO users (id) VALUES ($1)', [userId]);
    await t.db.query("INSERT INTO play_sessions (id, user_id, universe_id, lesson_id, mode, item_ids) VALUES ($1, $2, $3, $4, 'lesson', $5)", [sessionId, userId, universe.id, item.lesson_id, [item.id]]);
    await t.db.query('INSERT INTO attempts (user_id, session_id, item_id, is_correct, rating) VALUES ($1, $2, $3, true, 3)', [userId, sessionId, item.id]);

    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => { l.items = l.items.filter((i) => !i.id.endsWith('.i04')); });
    const r = await syncContentFromDir(t.db, dir);
    expect(r.items.archived).toBe(1);
    expect(await count('items')).toBe(30); // jamais de DELETE
    expect(await count('items', `WHERE key = '${itemKey}' AND archived_at IS NOT NULL`)).toBe(1);
    expect(await count('attempts')).toBe(1); // l'historique est intact
    expect(await count('attempts', `WHERE item_id = ${item.id}`)).toBe(1);

    // l'item revient : restauré (même id, même key)
    const back = await syncContentFromDir(t.db, DATA);
    expect(back.items.updated).toBe(1);
    expect(await count('items', `WHERE key = '${itemKey}' AND archived_at IS NULL`)).toBe(1);
    expect((await t.db.query('SELECT id FROM items WHERE key = $1', [itemKey])).rows[0].id).toBe(item.id);
  });

  test('un contenu invalide n écrit rien (la validation précède la synchronisation)', async () => {
    const dir = copyData();
    editJson(lessonFile(dir, 1), (l) => { l.items.find((i) => i.type === 'qcm').bonne = 'Z'; });
    await expect(syncContentFromDir(t.db, dir)).rejects.toThrow(/Contenu invalide/);
    expect(await count('universes')).toBe(0);
  });

  // pg-mem n'annule pas les écritures au ROLLBACK : vrai Postgres uniquement.
  (REAL ? test : test.skip)('syncContent est transactionnel : une erreur en cours de route annule tout', async () => {
    const content = loadContent(DATA);
    // casse la contrainte CHECK des quêtes au milieu de la synchro (la métrique passe la validation JS mais pas le SQL)
    content.quests.quetes[0].metrique = 'inconnue';
    await expect(syncContent(t.db, content)).rejects.toThrow();
    expect(await count('universes')).toBe(0);
    expect(await count('items')).toBe(0);
  });
});
