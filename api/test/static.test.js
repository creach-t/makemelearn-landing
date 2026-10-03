'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createTestDb } = require('./helpers/testdb');
const { buildApp } = require('./helpers/app');

describe('site statique servi par l’app (image unique, lot 10)', () => {
  let t;
  let dir;
  beforeAll(async () => {
    t = await createTestDb();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mml-static-'));
    fs.mkdirSync(path.join(dir, 'pages'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<h1>accueil</h1>');
    fs.writeFileSync(path.join(dir, 'pages', 'faq.html'), '<h1>faq</h1>');
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1');
  });
  afterAll(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    await t.close();
  });

  test('sert l’accueil, une page et une URL sans extension', async () => {
    const { app } = buildApp(t.db, { STATIC_DIR: dir });
    expect((await request(app).get('/')).text).toContain('accueil');
    expect((await request(app).get('/pages/faq.html')).text).toContain('faq');
    expect((await request(app).get('/pages/faq')).status).toBe(200);
  });

  test('ne sert pas les fichiers cachés ni ce qui sort du dossier', async () => {
    const { app } = buildApp(t.db, { STATIC_DIR: dir });
    expect((await request(app).get('/.env')).status).toBe(404);
    expect((await request(app).get('/../package.json')).status).toBe(404);
    expect((await request(app).get('/docker-compose.yml')).status).toBe(404);
  });

  test('l’API prime sur le statique et /api/* inconnu reste un 404 JSON', async () => {
    const { app } = buildApp(t.db, { STATIC_DIR: dir });
    expect((await request(app).get('/healthz')).body.status).toBe('ok');
    const res = await request(app).get('/api/inconnu');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  test('sans STATIC_DIR, aucune route statique', async () => {
    const { app } = buildApp(t.db);
    expect((await request(app).get('/')).status).toBe(404);
  });
});
