'use strict';

const crypto = require('crypto');
const request = require('supertest');
const { createTestDb, REAL } = require('./helpers/testdb');
const { buildApp, createMailCapture } = require('./helpers/app');

const sha = (s) => crypto.createHash('sha256').update(s).digest();
const cookieOf = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('mml_sid=')) || null;
const cookieHeader = (res) => cookieOf(res).split(';')[0];
const tokenFromMail = (mailer, i = mailer.sent.length - 1) => /token=([\w-]+)/.exec(mailer.sent[i].text)[1];

describe('auth invité + lien magique + /me (lot 3)', () => {
  let t;
  let app;
  let mailer;
  let env;

  beforeEach(async () => {
    t = await createTestDb();
    mailer = createMailCapture();
    ({ app, env } = buildApp(t.db, { TRUST_PROXY_HOPS: '1' }, { mailer }));
  });
  afterEach(async () => { await t.close(); });

  const count = async (table, where = '') => Number((await t.db.query(`SELECT count(*) AS n FROM ${table} ${where}`)).rows[0].n);
  const post = (url, body, cookie, extra = {}) => {
    let r = request(app).post(url).set('X-MML', '1');
    if (cookie) r = r.set('Cookie', cookie);
    for (const [k, v] of Object.entries(extra)) r = r.set(k, v);
    return r.send(body);
  };
  const guest = async () => {
    const res = await post('/api/v1/auth/guest', {});
    return { res, cookie: cookieHeader(res), user: res.body.user };
  };
  const link = (email, cookie, extraBody = {}) => post('/api/v1/auth/magic-link', { email, ageDeclaration: true, ...extraBody }, cookie);
  const verify = (token, cookie) => {
    let r = request(app).get(`/api/v1/auth/verify?token=${token}&format=json`);
    if (cookie) r = r.set('Cookie', cookie);
    return r;
  };

  describe('invité', () => {
    test('POST /auth/guest pose un cookie HttpOnly / Secure / SameSite=Lax ; seul le hash du jeton est stocké', async () => {
      const res = await post('/api/v1/auth/guest', {});
      expect(res.status).toBe(201);
      expect(res.body.user.isAnonymous).toBe(true);
      expect(res.body.user.email).toBeNull();

      const raw = cookieOf(res);
      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/Secure/i);
      expect(raw).toMatch(/SameSite=Lax/i);
      expect(raw).toMatch(/Path=\//);
      expect(raw).toMatch(/Max-Age=15552000/); // 180 jours

      const token = decodeURIComponent(raw.split(';')[0].split('=')[1]);
      expect(token.length).toBeGreaterThanOrEqual(40); // 256 bits
      const rows = (await t.db.query('SELECT token_hash FROM auth_sessions')).rows;
      expect(rows).toHaveLength(1);
      if (REAL) expect(Buffer.compare(rows[0].token_hash, sha(token))).toBe(0); // pg-mem restitue les bytea autrement
      // le jeton en clair n'apparaît nulle part dans la base
      const dump = JSON.stringify((await t.db.query('SELECT * FROM auth_sessions')).rows) + JSON.stringify((await t.db.query('SELECT * FROM users')).rows);
      expect(dump).not.toContain(token);
      // et n'est pas renvoyé dans le corps
      expect(JSON.stringify(res.body)).not.toContain(token);
    });

    test('idempotent : avec un cookie valide, aucun nouvel utilisateur', async () => {
      const { cookie, user } = await guest();
      const again = await post('/api/v1/auth/guest', {}, cookie);
      expect(again.status).toBe(200);
      expect(again.body.user.id).toBe(user.id);
      expect(await count('users')).toBe(1);
      expect(await count('auth_sessions')).toBe(1);
    });

    test('un cookie inconnu ou falsifié ne donne pas accès', async () => {
      expect((await request(app).get('/api/v1/me').set('Cookie', 'mml_sid=n-importe-quoi')).status).toBe(401);
      expect((await request(app).get('/api/v1/me')).status).toBe(401);
    });
  });

  describe('CSRF', () => {
    test('mutation sans en-tête X-MML -> 403', async () => {
      const res = await request(app).post('/api/v1/auth/guest').send({});
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_HEADER_REQUIRED');
      expect(await count('users')).toBe(0);
    });

    test('mutation avec une Origin étrangère -> 403 ; Origin de l application acceptée', async () => {
      const bad = await post('/api/v1/auth/guest', {}, null, { Origin: 'https://evil.example' });
      expect(bad.status).toBe(403);
      expect(bad.body.code).toBe('BAD_ORIGIN');
      const ok = await post('/api/v1/auth/guest', {}, null, { Origin: 'http://localhost:3000' });
      expect(ok.status).toBe(201);
    });

    test('mutations de /me protégées de la même façon', async () => {
      const { cookie } = await guest();
      expect((await request(app).patch('/api/v1/me').set('Cookie', cookie).send({ displayName: 'X' })).status).toBe(403);
      expect((await request(app).delete('/api/v1/me').set('Cookie', cookie)).status).toBe(403);
      expect(await count('users')).toBe(1);
    });
  });

  describe('lien magique', () => {
    test('202 + e-mail envoyé ; seul le hash du jeton est stocké ; expiration à 15 min', async () => {
      const res = await link('Lea@Example.org');
      expect(res.status).toBe(202);
      expect(res.body.status).toBe('sent');
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0].to).toBe('lea@example.org');
      expect(mailer.sent[0].text).toContain('/api/v1/auth/verify?token=');
      expect(mailer.sent[0].text).toContain('15 minutes');

      const token = tokenFromMail(mailer);
      const row = (await t.db.query('SELECT token_hash, expires_at, created_at FROM login_tokens')).rows[0];
      if (REAL) expect(Buffer.compare(row.token_hash, sha(token))).toBe(0);
      const ttl = new Date(row.expires_at).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(14 * 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000);
      expect(JSON.stringify((await t.db.query('SELECT * FROM login_tokens')).rows)).not.toContain(token);
    });

    test('réponse 202 identique que l e-mail soit connu ou non (anti-énumération)', async () => {
      // crée un compte existant
      const g = await guest();
      await link('connu@example.org', g.cookie);
      expect((await verify(tokenFromMail(mailer), g.cookie)).status).toBe(200);

      const known = await link('connu@example.org');
      const unknown = await link('inconnu@example.org');
      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(known.body).toEqual(unknown.body);
    });

    test('un échec d envoi SMTP ne change pas la réponse (202) et n expose rien', async () => {
      const failing = { configured: true, sent: [], send: async () => { throw new Error('smtp: 535 auth failed'); } };
      const { app: app2 } = buildApp(t.db, {}, { mailer: failing });
      const res = await request(app2).post('/api/v1/auth/magic-link').set('X-MML', '1').send({ email: 'x@example.org', ageDeclaration: true });
      expect(res.status).toBe(202);
      expect(JSON.stringify(res.body)).not.toMatch(/smtp|535/);
    });

    test('e-mail invalide -> 400', async () => {
      expect((await link('pas-un-email')).status).toBe(400);
      expect(mailer.sent).toHaveLength(0);
    });

    test('verify : usage unique (2e usage refusé), même user_id conservé, session tournée', async () => {
      const g = await guest();
      // progression d'invité rattachée à son user_id
      await t.db.query("INSERT INTO daily_activity (user_id, day, xp) VALUES ($1, '2026-10-03', 42)", [g.user.id]);

      await link('promu@example.org', g.cookie);
      const token = tokenFromMail(mailer);
      const ok = await verify(token, g.cookie);
      expect(ok.status).toBe(200);
      expect(ok.body.upgraded).toBe(true);
      expect(ok.body.user.id).toBe(g.user.id); // MÊME user_id
      expect(ok.body.user.isAnonymous).toBe(false);
      expect(ok.body.user.email).toBe('promu@example.org');
      expect(await count('users')).toBe(1);
      expect(await count('daily_activity', `WHERE user_id = '${g.user.id}'`)).toBe(1); // progression conservée
      const u = (await t.db.query('SELECT age_declared_15_at, email_verified_at FROM users')).rows[0];
      expect(u.age_declared_15_at).not.toBeNull();
      expect(u.email_verified_at).not.toBeNull();

      // rotation : nouveau cookie, l'ancien est révoqué
      const newCookie = cookieHeader(ok);
      expect(newCookie).not.toBe(g.cookie);
      expect((await request(app).get('/api/v1/me').set('Cookie', g.cookie)).status).toBe(401);
      const me = await request(app).get('/api/v1/me').set('Cookie', newCookie);
      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe('promu@example.org');

      // usage unique
      const again = await verify(token);
      expect(again.status).toBe(400);
      expect(again.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    test('verify : lien expiré (> 15 min) refusé', async () => {
      await link('lent@example.org');
      await t.db.query("UPDATE login_tokens SET expires_at = now() - interval '1 minute'");
      const res = await verify(tokenFromMail(mailer));
      expect(res.status).toBe(400);
      expect(await count('users')).toBe(0);
    });

    test('verify : jeton inconnu / mal formé refusé', async () => {
      expect((await verify('x'.repeat(43))).status).toBe(400);
      expect((await verify('court')).status).toBe(400);
    });

    test('verify en navigateur (sans Accept JSON) : redirection vers /jouer/, cookie posé', async () => {
      await link('nav@example.org');
      const res = await request(app).get(`/api/v1/auth/verify?token=${tokenFromMail(mailer)}`).set('Accept', 'text/html');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:3000/jouer/?connexion=ok');
      expect(cookieOf(res)).toMatch(/HttpOnly/);
      const bad = await request(app).get('/api/v1/auth/verify?token=zzzzzzzzzzzzzzzzzzzzzzzzzzzz').set('Accept', 'text/html');
      expect(bad.status).toBe(302);
      expect(bad.headers.location).toBe('http://localhost:3000/jouer/?connexion=erreur');
    });

    test('compte existant : un autre appareil se connecte au même user_id', async () => {
      const g1 = await guest();
      await link('multi@example.org', g1.cookie);
      const first = await verify(tokenFromMail(mailer), g1.cookie);

      const g2 = await guest(); // autre appareil, autre invité
      await link('multi@example.org', g2.cookie);
      const second = await verify(tokenFromMail(mailer), g2.cookie);
      expect(second.status).toBe(200);
      expect(second.body.upgraded).toBe(false);
      expect(second.body.user.id).toBe(first.body.user.id);
      expect(await count('users', 'WHERE email IS NOT NULL')).toBe(1);
    });

    (REAL ? test : test.skip)('deux vérifications simultanées du même lien : une seule réussit', async () => {
      await link('course@example.org');
      const token = tokenFromMail(mailer);
      const [a, b] = await Promise.all([verify(token), verify(token)]);
      expect([a.status, b.status].sort()).toEqual([200, 400]);
      expect(await count('users')).toBe(1);
    });
  });

  describe('mineurs : déclaration d âge >= 15 ans', () => {
    test('sans déclaration : 403, aucune donnée personnelle lue, stockée ni envoyée ; l utilisateur reste invité', async () => {
      const g = await guest();
      for (const body of [{ email: 'enfant@example.org' }, { email: 'enfant@example.org', ageDeclaration: false }, { email: 'enfant@example.org', ageDeclaration: 'true' }]) {
        const res = await post('/api/v1/auth/magic-link', body, g.cookie);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('AGE_DECLARATION_REQUIRED');
        expect(JSON.stringify(res.body)).not.toContain('enfant@example.org');
      }
      expect(mailer.sent).toHaveLength(0);
      expect(await count('login_tokens')).toBe(0);
      expect(await count('users', 'WHERE email IS NOT NULL')).toBe(0);
      // il continue de jouer en invité
      const me = await request(app).get('/api/v1/me').set('Cookie', g.cookie);
      expect(me.status).toBe(200);
      expect(me.body.user.isAnonymous).toBe(true);
      expect(me.body.user.email).toBeNull();
    });

    test('le refus passe avant la validation de l e-mail (rien n est traité sans déclaration)', async () => {
      const res = await post('/api/v1/auth/magic-link', { email: 'pas-un-email' });
      expect(res.status).toBe(403);
    });
  });

  describe('rate limits', () => {
    test('par IP : 11e demande de lien depuis la même IP -> 429, une autre IP passe', async () => {
      let last;
      for (let i = 0; i < 11; i++) {
        last = await post('/api/v1/auth/magic-link', { email: `ip${i}@example.org`, ageDeclaration: true }, null, { 'X-Forwarded-For': '203.0.113.50' });
      }
      expect(last.status).toBe(429);
      const other = await post('/api/v1/auth/magic-link', { email: 'autre-ip@example.org', ageDeclaration: true }, null, { 'X-Forwarded-For': '198.51.100.60' });
      expect(other.status).toBe(202);
    });

    test('par e-mail : 4e demande pour la même adresse -> 429 même depuis des IP différentes', async () => {
      const statuses = [];
      for (let i = 0; i < 4; i++) {
        const res = await post('/api/v1/auth/magic-link', { email: 'Cible@Example.org', ageDeclaration: true }, null, { 'X-Forwarded-For': `192.0.2.${i + 1}` });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([202, 202, 202, 429]);
      expect(mailer.sent).toHaveLength(3);
    });

    test('création d invités limitée par IP', async () => {
      let last;
      for (let i = 0; i < 31; i++) last = await post('/api/v1/auth/guest', {}, null, { 'X-Forwarded-For': '203.0.113.99' });
      expect(last.status).toBe(429);
    });
  });

  describe('sessions', () => {
    test('logout : session révoquée, cookie effacé', async () => {
      const g = await guest();
      const out = await post('/api/v1/auth/logout', {}, g.cookie);
      expect(out.status).toBe(200);
      expect(cookieOf(out)).toMatch(/mml_sid=;/);
      expect((await request(app).get('/api/v1/me').set('Cookie', g.cookie)).status).toBe(401);
      const row = (await t.db.query('SELECT revoked_at FROM auth_sessions')).rows[0];
      expect(row.revoked_at).not.toBeNull();
    });

    test('session expirée refusée', async () => {
      const g = await guest();
      await t.db.query("UPDATE auth_sessions SET expires_at = now() - interval '1 second'");
      expect((await request(app).get('/api/v1/me').set('Cookie', g.cookie)).status).toBe(401);
    });

    test('expiration glissante : une session inactive depuis > 1 jour est prolongée', async () => {
      const g = await guest();
      await t.db.query("UPDATE auth_sessions SET last_used_at = now() - interval '3 days', expires_at = now() + interval '10 days'");
      const res = await request(app).get('/api/v1/me').set('Cookie', g.cookie);
      expect(res.status).toBe(200);
      expect(cookieOf(res)).not.toBeNull(); // cookie ré-émis
      const row = (await t.db.query('SELECT expires_at FROM auth_sessions')).rows[0];
      expect(new Date(row.expires_at).getTime() - Date.now()).toBeGreaterThan(170 * 24 * 3600 * 1000);
    });
  });

  describe('/me', () => {
    test('GET /me : profil sans e-mail pour un invité', async () => {
      const g = await guest();
      const res = await request(app).get('/api/v1/me').set('Cookie', g.cookie);
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ isAnonymous: true, email: null, dailyGoalXp: 30, leaderboardOptIn: false, marketingOptIn: false, timezone: 'Europe/Paris' });
    });

    test('PATCH /me : pseudo, fuseau, objectif quotidien, opt-in', async () => {
      const g = await guest();
      const res = await request(app).patch('/api/v1/me').set('X-MML', '1').set('Cookie', g.cookie)
        .send({ displayName: '  Inès  ', handle: 'ines_42', timezone: 'America/Montreal', dailyGoalXp: 60, leaderboardOptIn: true });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ displayName: 'Inès', handle: 'ines_42', timezone: 'America/Montreal', dailyGoalXp: 60, leaderboardOptIn: true, marketingOptIn: false });
    });

    test('PATCH /me : validations (fuseau, objectif, pseudo, champ inconnu, corps vide)', async () => {
      const g = await guest();
      const patch = (body) => request(app).patch('/api/v1/me').set('X-MML', '1').set('Cookie', g.cookie).send(body);
      expect((await patch({ timezone: 'Mars/Olympus' })).status).toBe(400);
      expect((await patch({ dailyGoalXp: 5 })).status).toBe(400);
      expect((await patch({ dailyGoalXp: 501 })).status).toBe(400);
      expect((await patch({ handle: 'Pseudo Invalide!' })).status).toBe(400);
      expect((await patch({ email: 'x@example.org' })).status).toBe(400); // l'e-mail ne se modifie pas ici
      expect((await patch({ isAnonymous: false })).status).toBe(400);
      expect((await patch({})).status).toBe(400);
    });

    (REAL ? test : test.skip)('PATCH /me : pseudo déjà pris -> 409', async () => {
      const a = await guest();
      const b = await guest();
      const patch = (cookie, body) => request(app).patch('/api/v1/me').set('X-MML', '1').set('Cookie', cookie).send(body);
      expect((await patch(a.cookie, { handle: 'unique_1' })).status).toBe(200);
      const dup = await patch(b.cookie, { handle: 'unique_1' });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('HANDLE_TAKEN');
    });

    test('DELETE /me purge tout (cascade) sans toucher aux autres utilisateurs', async () => {
      // utilisateur A : compte complet avec des données dans plusieurs tables
      const a = await guest();
      await link('rgpd@example.org', a.cookie);
      const ver = await verify(tokenFromMail(mailer), a.cookie);
      const cookieA = cookieHeader(ver);
      const idA = ver.body.user.id;
      await t.db.query("INSERT INTO daily_activity (user_id, day, xp) VALUES ($1, '2026-10-03', 42)", [idA]);
      await t.db.query('INSERT INTO streaks (user_id, current_days) VALUES ($1, 3)', [idA]);
      await t.db.query("INSERT INTO xp_events (user_id, amount, reason, ref) VALUES ($1, 10, 'answer', 'a1')", [idA]);
      await t.db.query("INSERT INTO leaderboard_weekly (week_start, user_id, xp) VALUES ('2026-09-28', $1, 10)", [idA]);
      await t.db.query("INSERT INTO analytics_events (user_id, name) VALUES ($1, 'session_started')", [idA]);
      // un lien magique en attente pour la même adresse (purgé aussi : donnée personnelle)
      await link('rgpd@example.org');

      // utilisateur B : ne doit pas être affecté
      const b = await guest();
      await t.db.query("INSERT INTO daily_activity (user_id, day, xp) VALUES ($1, '2026-10-03', 7)", [b.user.id]);

      const del = await request(app).delete('/api/v1/me').set('X-MML', '1').set('Cookie', cookieA);
      expect(del.status).toBe(204);
      expect(cookieOf(del)).toMatch(/mml_sid=;/);

      expect(await count('users', `WHERE id = '${idA}'`)).toBe(0);
      for (const table of ['auth_sessions', 'daily_activity', 'streaks', 'xp_events', 'leaderboard_weekly']) {
        expect(await count(table, `WHERE user_id = '${idA}'`)).toBe(0);
      }
      expect(await count('login_tokens', "WHERE lower(email) = 'rgpd@example.org'")).toBe(0);
      // analytics : l'événement reste, anonymisé
      expect(await count('analytics_events', "WHERE name = 'session_started' AND user_id IS NULL")).toBe(1);
      // l'ancien cookie ne donne plus rien
      expect((await request(app).get('/api/v1/me').set('Cookie', cookieA)).status).toBe(401);
      // B intact
      expect(await count('daily_activity', `WHERE user_id = '${b.user.id}'`)).toBe(1);
      expect((await request(app).get('/api/v1/me').set('Cookie', b.cookie)).status).toBe(200);
    });

    test('un cookie volé après suppression ne ressuscite rien : /me 401 et aucun compte recréé', async () => {
      const g = await guest();
      await request(app).delete('/api/v1/me').set('X-MML', '1').set('Cookie', g.cookie);
      const res = await post('/api/v1/auth/guest', {}, g.cookie);
      expect(res.status).toBe(201); // cookie invalide => nouvel invité vierge
      expect(res.body.user.id).not.toBe(g.user.id);
    });
  });

  test('env de test : cookie Secure par défaut hors développement', () => {
    expect(env.COOKIE_SECURE).toBe(true);
  });
});
