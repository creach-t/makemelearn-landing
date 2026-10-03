'use strict';

const request = require('supertest');
const express = require('express');
const { safe } = require('../src/lib/safe');
const { HttpError } = require('../src/lib/errors');
const { errorHandler, notFoundHandler } = require('../src/middleware/errorHandler');

function appWith(register) {
  const app = express();
  register(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('safe()', () => {
  test('un handler async qui rejette renvoie 500 JSON sans tuer le process', async () => {
    const app = appWith((a) => {
      a.get('/boom', safe(async () => { throw new Error('secret interne'); }));
      a.get('/ok', safe(async (req, res) => res.json({ ok: true })));
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body.error).toBe('Erreur interne du serveur'); // le message interne n'est pas exposé
    expect(JSON.stringify(res.body)).not.toContain('secret interne');
    // le serveur répond encore
    expect((await request(app).get('/ok')).body).toEqual({ ok: true });
  });

  test('une exception synchrone dans le handler est aussi capturée', async () => {
    const app = appWith((a) => a.get('/sync', safe(() => { throw new Error('x'); })));
    expect((await request(app).get('/sync')).status).toBe(500);
  });

  test('un HttpError garde son statut et son code', async () => {
    const app = appWith((a) => a.get('/nf', safe(async () => { throw new HttpError(404, 'X_NOT_FOUND', 'absent'); })));
    const res = await request(app).get('/nf');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('X_NOT_FOUND');
  });
});
