'use strict';

const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const { loadContent, syncContentFromDir } = require('../../src/lib/content');
const { buildApp } = require('./app');

const DATA = path.resolve(__dirname, '../../../data');
const SLUG = 'bureau-des-doutes';

/** Items du contenu pilote indexés par clé (`<univers>/<leçon>/<item>`), avec leur payload (solutions comprises). */
function pilotItems() {
  const content = loadContent(DATA);
  const out = new Map();
  const lessons = [];
  for (const u of content.universes) {
    for (const { data: l } of u.lessons) {
      lessons.push({ key: `${u.slug}/${l.slug}`, data: l });
      for (const item of l.items) out.set(`${u.slug}/${l.slug}/${item.id.split('.').pop()}`, item);
    }
  }
  return { items: out, lessons };
}
const PILOT = pilotItems();

/** Réponse correcte pour un item (depuis le contenu source). */
function correctResponse(item) {
  switch (item.type) {
    case 'qcm': return { choice: item.bonne };
    case 'vrai_faux': return { value: item.reponse };
    case 'trous': return { answers: Object.fromEntries(item.trous.map((t) => [t.id, t.reponses_acceptees[0]])) };
    case 'appariement': return { pairs: item.paires.map((p) => ({ left: p.gauche, right: p.droite })) };
    case 'ordre': return { order: item.elements };
    case 'saisie': return { text: item.reponses_acceptees[0] };
    case 'flashcard': return { known: true };
    default: throw new Error(`type non géré : ${item.type}`);
  }
}

/** Réponse bien formée mais fausse. */
function wrongResponse(item) {
  switch (item.type) {
    case 'qcm': return { choice: item.choix.find((c) => c.id !== item.bonne).id };
    case 'vrai_faux': return { value: !item.reponse };
    case 'trous': return { answers: Object.fromEntries(item.trous.map((t) => [t.id, 'zzz-faux'])) };
    case 'appariement': {
      const rights = item.paires.map((p) => p.droite);
      return { pairs: item.paires.map((p, i) => ({ left: p.gauche, right: rights[(i + 1) % rights.length] })) };
    }
    case 'ordre': return { order: [...item.elements].reverse() };
    case 'saisie': return { text: 'zzz-faux' };
    case 'flashcard': return { known: false };
    default: throw new Error(`type non géré : ${item.type}`);
  }
}

/** Univers pilote synchronisé dans une base de test + application (univers draft visibles). */
async function setupGame(t, envOverrides = {}) {
  await syncContentFromDir(t.db, DATA);
  const built = buildApp(t.db, { SHOW_DRAFT_UNIVERSES: 'true', ...envOverrides });
  return built;
}

const cookieHeader = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('mml_sid=')).split(';')[0];

/** Petit client HTTP avec cookie d'invité. */
function client(app) {
  const c = { cookie: null, user: null };
  const withCookie = (r) => (c.cookie ? r.set('Cookie', c.cookie) : r);
  c.guest = async () => {
    const res = await request(app).post('/api/v1/auth/guest').set('X-MML', '1').send({});
    c.cookie = cookieHeader(res);
    c.user = res.body.user;
    return res;
  };
  c.get = (url) => withCookie(request(app).get(url));
  c.post = (url, body = {}, headers = {}) => {
    let r = withCookie(request(app).post(url)).set('X-MML', '1');
    for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
    return r.send(body);
  };
  c.del = (url) => withCookie(request(app).delete(url)).set('X-MML', '1');
  c.start = (lessonKey) => c.post('/api/v1/sessions', { lessonKey });
  c.answer = (sessionId, itemKey, response, key = crypto.randomUUID()) =>
    c.post(`/api/v1/sessions/${sessionId}/answers`, { itemKey, response }, { 'Idempotency-Key': key });
  c.complete = (sessionId) => c.post(`/api/v1/sessions/${sessionId}/complete`);
  /** Joue une leçon entière ; `wrongKeys` = items à rater volontairement. Retourne { session, answers, summary }. */
  c.playLesson = async (lessonKey, { wrongKeys = [] } = {}) => {
    const started = await c.start(lessonKey);
    if (started.status !== 201) return { started };
    const sid = started.body.session.id;
    const answers = [];
    for (const it of started.body.items) {
      const src = PILOT.items.get(it.key);
      answers.push(await c.answer(sid, it.key, wrongKeys.includes(it.key) ? wrongResponse(src) : correctResponse(src)));
    }
    const summary = await c.complete(sid);
    return { started, sid, answers, summary };
  };
  return c;
}

const LESSON = (n) => PILOT.lessons[n - 1].key;

module.exports = { PILOT, SLUG, LESSON, correctResponse, wrongResponse, setupGame, client };
