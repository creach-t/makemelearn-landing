'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createTestDb } = require('./helpers/testdb');
const { buildApp } = require('./helpers/app');

const ROOT = path.resolve(__dirname, '../..');
const APP = path.join(ROOT, 'app');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}
const jsFiles = walk(path.join(APP, 'js')).filter((f) => f.endsWith('.js'));
const read = (f) => fs.readFileSync(f, 'utf8');

describe('front du jeu (/app/) : règles de sécurité et d’intégration', () => {
  test('aucun innerHTML / outerHTML / insertAdjacentHTML / document.write / eval / new Function dans le JS', () => {
    expect(jsFiles.length).toBeGreaterThan(10);
    const banned = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new\s+Function|setTimeout\s*\(\s*['"`])/;
    for (const f of jsFiles) {
      const code = read(f).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      expect({ file: path.relative(ROOT, f), hit: (banned.exec(code) || [])[0] || null }).toEqual({ file: path.relative(ROOT, f), hit: null });
    }
  });

  test('pas de style inline posé en attribut, ni de gestionnaire on*= : styles dans app.css uniquement', () => {
    for (const f of jsFiles) {
      const code = read(f);
      expect({ f: path.basename(f), style: /\bstyle\s*:\s*['"`]/.test(code) }).toEqual({ f: path.basename(f), style: false });
      expect({ f: path.basename(f), on: /setAttribute\(\s*['"]on/.test(code) }).toEqual({ f: path.basename(f), on: false });
    }
    const html = read(path.join(APP, 'index.html'));
    expect(html).not.toMatch(/\sstyle\s*=/);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/<style[\s>]/i);
  });

  test('index.html : noindex, aucun script inline, un seul module chargé depuis /app/', () => {
    const html = read(path.join(APP, 'index.html'));
    expect(html).toMatch(/<meta name="robots" content="noindex/);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0][1]).toMatch(/type="module"/);
    expect(scripts[0][1]).toMatch(/src="js\/main\.js"/);
    expect(scripts[0][2].trim()).toBe('');
    expect(html).toMatch(/<link rel="stylesheet" href="css\/app\.css">/);
  });

  test('tous les imports relatifs des modules existent', () => {
    for (const f of jsFiles) {
      for (const m of read(f).matchAll(/from\s+'(\.[^']+)'/g)) {
        expect({ from: path.relative(ROOT, f), target: m[1], ok: fs.existsSync(path.resolve(path.dirname(f), m[1])) }).toEqual({ from: path.relative(ROOT, f), target: m[1], ok: true });
      }
    }
  });

  test('prefers-reduced-motion est respecté dans app.css', () => {
    expect(read(path.join(APP, 'css/app.css'))).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  test('un exercice par type d’item du pilote (mcq, truefalse, cloze, match, ordering, input, flashcard)', () => {
    const idx = read(path.join(APP, 'js/exercises/index.js'));
    for (const k of ['mcq', 'truefalse', 'cloze', 'match', 'ordering', 'input', 'flashcard']) expect(idx).toMatch(new RegExp(`\\b${k}:`));
  });

  test('landing : bouton « Jouer maintenant » vers /app/ ; robots.txt interdit /app/ ; image Docker embarque app/', () => {
    const index = read(path.join(ROOT, 'index.html'));
    expect(index).toMatch(/<a href="\/app\/" class="btn btn-play"[\s\S]*?Jouer maintenant/);
    expect(read(path.join(ROOT, 'css/style.css'))).toMatch(/\.btn-play\s*\{/);
    const robots = read(path.join(ROOT, 'robots.txt'));
    expect(robots).toMatch(/^Disallow: \/app\/\s*$/m);
    // les groupes nommés (Googlebot...) ignorent le groupe * : /app/ doit y figurer aussi
    for (const bot of ['Googlebot', 'Bingbot', 'Slurp']) expect(new RegExp(`User-agent: ${bot}\\s+Allow: /\\s+Disallow: /app/`).test(robots)).toBe(true);
    expect(read(path.join(ROOT, 'Dockerfile'))).toMatch(/^COPY app \/app\/public\/app$/m);
    const compose = read(path.join(ROOT, 'docker-compose.prod.yml'));
    expect(compose).toMatch(/SHOW_DRAFT_UNIVERSES: "true"/);
    expect(compose).toMatch(/A RETIRER quand le pilote passe en « publie »/);
    expect(read(path.join(ROOT, '.dockerignore'))).not.toMatch(/^app\/?$/m);
  });
});

describe('/app/ servi par Express avec la CSP helmet par défaut', () => {
  let t;
  let dir;
  beforeAll(async () => {
    t = await createTestDb();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mml-front-'));
    fs.mkdirSync(path.join(dir, 'app'));
    fs.cpSync(APP, path.join(dir, 'app'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<h1>accueil</h1>');
  });
  afterAll(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    await t.close();
  });

  test('/app/, /app/js/main.js et /app/css/app.css répondent ; la CSP interdit scripts inline et eval', async () => {
    const { app } = buildApp(t.db, { STATIC_DIR: dir });
    const page = await request(app).get('/app/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('noindex');
    const csp = page.headers['content-security-policy'];
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    expect(csp).toMatch(/object-src 'none'/);
    const js = await request(app).get('/app/js/main.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toMatch(/javascript/);
    const css = await request(app).get('/app/css/app.css');
    expect(css.status).toBe(200);
    expect(css.headers['cache-control']).toBe('no-cache'); // pas de noms hachés : revalidation à chaque chargement
    expect((await request(app).get('/index.html')).headers['cache-control']).toMatch(/max-age=3600/);
    expect((await request(app).get('/app/js/screens/play.js')).status).toBe(200);
  });

  test('quotas : le site et l’API du jeu ne consomment pas le quota global (100 / 15 min) ; chaque périmètre a le sien', async () => {
    const { app } = buildApp(t.db, { STATIC_DIR: dir, RATE_LIMIT_MAX_REQUESTS: '3', RATE_LIMIT_GAME_MAX: '5' });
    // un chargement du jeu = ~20 fichiers : jamais bloqué par le quota global
    for (let i = 0; i < 12; i++) expect((await request(app).get('/app/js/main.js')).status).toBe(200);
    // le quota global historique reste actif pour le reste de l'API
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await request(app).get('/api/v1/inconnu')).status);
    expect(statuses).toEqual([404, 404, 404, 429, 429]);
    // l'API du jeu a son propre quota (large), indépendant du global déjà épuisé
    const game = [];
    for (let i = 0; i < 7; i++) game.push((await request(app).get('/api/v1/universes')).status);
    expect(game).toEqual([200, 200, 200, 200, 200, 429, 429]);
    expect((await request(app).get('/api/v1/universes')).body.code).toBe('GAME_RATE_LIMIT_EXCEEDED');
  });
});
