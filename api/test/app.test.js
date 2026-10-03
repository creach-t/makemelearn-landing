'use strict';

const request = require('supertest');
const { createTestDb } = require('./helpers/testdb');
const { buildApp, createMailCapture } = require('./helpers/app');
const { unsubscribeToken } = require('../src/modules/waitlist');

describe('socle API (lot 1)', () => {
  let t;
  beforeAll(async () => { t = await createTestDb(); });
  afterAll(async () => { await t.close(); });

  describe('sondes', () => {
    test('/healthz répond sans toucher la base (liveness indépendante de la DB)', async () => {
      const brokenDb = {
        kind: 'broken',
        query: async () => { throw new Error('db down'); },
        tx: async () => { throw new Error('db down'); }
      };
      const { app } = buildApp(brokenDb);
      expect((await request(app).get('/healthz')).status).toBe(200);
      expect((await request(app).get('/api/v1/healthz')).body.status).toBe('ok');
      const ready = await request(app).get('/readyz');
      expect(ready.status).toBe(503);
    });

    test('/readyz est OK quand la base répond', async () => {
      const { app } = buildApp(t.db);
      const res = await request(app).get('/readyz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });

    test('routes inconnues : 404 JSON, jamais de stack', async () => {
      const { app } = buildApp(t.db);
      const res = await request(app).get('/nope');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ROUTE_NOT_FOUND');
      expect(res.body.stack).toBeUndefined();
    });

    test('routes de maintenance historiques : refusées sans jeton, même sans MAINTENANCE_TOKEN défini', async () => {
      const { app } = buildApp(t.db); // MAINTENANCE_TOKEN absent
      expect((await request(app).get('/health/detailed')).status).toBe(401);
      expect((await request(app).get('/health/detailed').set('Authorization', 'Bearer undefined')).status).toBe(401);
      expect((await request(app).post('/health/maintenance').set('Authorization', 'Bearer ')).status).toBe(401);
    });

    test('X-Powered-By absent', async () => {
      const { app } = buildApp(t.db);
      expect((await request(app).get('/healthz')).headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('waitlist (ex-registrations)', () => {
    test('inscription : 201 puis doublon 409 sur /api/v1/waitlist', async () => {
      const { app } = buildApp(t.db);
      const ok = await request(app).post('/api/v1/waitlist').send({ email: 'Alice@Example.org', source: 'blog' });
      expect(ok.status).toBe(201);
      expect(ok.body.code).toBe('REGISTRATION_SUCCESS');
      expect(ok.body.data.email).toBe('alice@example.org');
      const row = (await t.db.query('SELECT email, source, is_verified FROM registrations')).rows;
      expect(row).toEqual([{ email: 'alice@example.org', source: 'blog', is_verified: false }]);

      // non vérifiée -> on renvoie la vérification (comportement historique), 200
      const again = await request(app).post('/api/v1/waitlist').send({ email: 'alice@example.org' });
      expect(again.status).toBe(200);
      expect(again.body.code).toBe('VERIFICATION_RESENT');
    });

    test('anciens chemins (alias) : /registrations et /api/registrations', async () => {
      const { app } = buildApp(t.db);
      expect((await request(app).post('/registrations').send({ email: 'legacy1@example.org' })).status).toBe(201);
      expect((await request(app).post('/api/registrations').send({ email: 'legacy2@example.org' })).status).toBe(201);
    });

    test('validation : email invalide, source inconnue, domaine jetable -> 400', async () => {
      const { app } = buildApp(t.db);
      const bad = await request(app).post('/api/v1/waitlist').send({ email: 'pas-un-email' });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
      expect((await request(app).post('/api/v1/waitlist').send({ email: 'a@example.org', source: 'x' })).status).toBe(400);
      expect((await request(app).post('/api/v1/waitlist').send({ email: 'a@tempmail.com' })).status).toBe(400);
    });

    test('vérification par jeton : succès, rejouée = 404, jeton mal formé = 400', async () => {
      const { app } = buildApp(t.db);
      await request(app).post('/api/v1/waitlist').send({ email: 'verif@example.org' });
      const token = (await t.db.query("SELECT verification_token FROM registrations WHERE email = 'verif@example.org'")).rows[0].verification_token;
      expect((await request(app).get(`/api/v1/waitlist/verify/${token}`)).status).toBe(200);
      expect((await request(app).get(`/api/v1/waitlist/verify/${token}`)).status).toBe(404);
      expect((await request(app).get('/api/v1/waitlist/verify/pas-un-uuid')).status).toBe(400);
    });

    test('désinscription : jeton signé obligatoire (plus de désinscription anonyme)', async () => {
      const { app, env } = buildApp(t.db);
      await request(app).post('/api/v1/waitlist').send({ email: 'unsub@example.org' });
      const url = '/api/v1/waitlist/unsubscribe/unsub@example.org';
      expect((await request(app).delete(url)).status).toBe(403);
      expect((await request(app).delete(`${url}?token=forge`)).status).toBe(403);
      // le jeton d'un autre e-mail ne marche pas
      const other = unsubscribeToken(env.SESSION_SECRET, 'autre@example.org');
      expect((await request(app).delete(`${url}?token=${other}`)).status).toBe(403);
      const good = unsubscribeToken(env.SESSION_SECRET, 'unsub@example.org');
      expect((await request(app).delete(`${url}?token=${good}`)).status).toBe(200);
      const row = (await t.db.query("SELECT unsubscribed_at FROM registrations WHERE email = 'unsub@example.org'")).rows[0];
      expect(row.unsubscribed_at).not.toBeNull();
    });

    test('quotas par IP : deux IP distinctes (X-Forwarded-For) ont des quotas distincts', async () => {
      const { app } = buildApp(t.db, { TRUST_PROXY_HOPS: '1' });
      let last;
      for (let i = 0; i < 6; i++) {
        last = await request(app).post('/api/v1/waitlist').set('X-Forwarded-For', '203.0.113.7').send({ email: `quota${i}@example.org` });
      }
      expect(last.status).toBe(429);
      expect(last.body.code).toBe('REGISTRATION_LIMIT_EXCEEDED');
      const other = await request(app).post('/api/v1/waitlist').set('X-Forwarded-For', '198.51.100.9').send({ email: 'quota-other@example.org' });
      expect(other.status).toBe(201);
    });

    test('une erreur SQL dans une route renvoie 500 JSON et le serveur continue de répondre', async () => {
      const flaky = {
        kind: t.db.kind,
        pool: t.db.pool,
        tx: t.db.tx,
        query: async (text, params) => {
          if (/FROM registrations WHERE email/.test(text)) throw new Error('connexion perdue: détail interne');
          return t.db.query(text, params);
        }
      };
      const { app } = buildApp(flaky);
      const res = await request(app).post('/api/v1/waitlist').send({ email: 'boom@example.org' });
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('détail interne');
      expect((await request(app).get('/healthz')).status).toBe(200);
    });

    test('corps trop gros (> 32 kb) refusé en 413', async () => {
      const { app } = buildApp(t.db);
      const res = await request(app).post('/api/v1/waitlist').send({ email: 'big@example.org', metadata: { blob: 'x'.repeat(40 * 1024) } });
      expect(res.status).toBe(413);
    });
  });

  describe('contact', () => {
    const valid = { name: 'Camille', email: 'camille@example.org', subject: 'Une question', message: 'Bonjour, ceci est un message assez long.' };

    test('envoie un e-mail (échappé) et répond CONTACT_SUCCESS', async () => {
      const mailer = createMailCapture();
      const { app } = buildApp(t.db, {}, { mailer });
      const res = await request(app).post('/api/v1/contact').send({ ...valid, name: '<script>alert(1)</script>Zoé' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('CONTACT_SUCCESS');
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0].to).toBe('hello@makemelearn.fr');
      expect(mailer.sent[0].html).not.toContain('<script>');
      expect(mailer.sent[0].html).toContain('&lt;script&gt;');
    });

    test('alias /contact et /api/contact', async () => {
      const mailer = createMailCapture();
      const { app } = buildApp(t.db, {}, { mailer });
      expect((await request(app).post('/contact').send(valid)).status).toBe(200);
      expect((await request(app).post('/api/contact').send(valid)).status).toBe(200);
      expect(mailer.sent).toHaveLength(2);
    });

    test('validation 400 ; en-tête injecté dans le sujet neutralisé', async () => {
      const mailer = createMailCapture();
      const { app } = buildApp(t.db, {}, { mailer });
      expect((await request(app).post('/api/v1/contact').send({ ...valid, message: 'court' })).status).toBe(400);
      await request(app).post('/api/v1/contact').send({ ...valid, subject: 'Sujet\r\nBcc: evil@example.org' });
      expect(mailer.sent[0].subject).not.toMatch(/[\r\n]/);
    });

    test('service e-mail non configuré -> 503 EMAIL_SERVICE_UNAVAILABLE ; échec d envoi -> 502', async () => {
      const { app } = buildApp(t.db, {}, { mailer: { configured: false, send: async () => {} } });
      const res = await request(app).post('/api/v1/contact').send(valid);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('EMAIL_SERVICE_UNAVAILABLE');

      const failing = { configured: true, send: async () => { throw new Error('smtp down'); } };
      const { app: app2 } = buildApp(t.db, {}, { mailer: failing });
      expect((await request(app2).post('/api/v1/contact').send(valid)).status).toBe(502);
    });
  });
});
