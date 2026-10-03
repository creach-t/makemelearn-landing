'use strict';

const { loadEnv } = require('../src/config/env');

describe('config/env', () => {
  test('refuse de démarrer en production sans SESSION_SECRET ni DATABASE_URL', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })).toThrow(/SESSION_SECRET/);
    expect(() => loadEnv({ NODE_ENV: 'production', SESSION_SECRET: 'a'.repeat(32) })).toThrow(/DATABASE_URL/);
  });

  test('refuse un SESSION_SECRET trop court', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', SESSION_SECRET: 'court' })).toThrow(/32/);
  });

  test('accepte une configuration de production complète et applique les défauts', () => {
    const env = loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', SESSION_SECRET: 'a'.repeat(40) });
    expect(env.PORT).toBe(3000);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.APP_URL).toBe('https://makemelearn.fr');
    expect(env.MAIL_FROM).toBe('no-reply@makemelearn.fr');
  });

  test('SHOW_DRAFT_UNIVERSES : faux par défaut, true ou 1 pour l’activer', () => {
    expect(loadEnv({ NODE_ENV: 'development' }).SHOW_DRAFT_UNIVERSES).toBe(false);
    expect(loadEnv({ NODE_ENV: 'development', SHOW_DRAFT_UNIVERSES: 'true' }).SHOW_DRAFT_UNIVERSES).toBe(true);
    expect(loadEnv({ NODE_ENV: 'development', SHOW_DRAFT_UNIVERSES: '1' }).SHOW_DRAFT_UNIVERSES).toBe(true);
    expect(loadEnv({ NODE_ENV: 'development', SHOW_DRAFT_UNIVERSES: 'false' }).SHOW_DRAFT_UNIVERSES).toBe(false);
    expect(loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', SESSION_SECRET: 'a'.repeat(40) }).SHOW_DRAFT_UNIVERSES).toBe(false);
  });

  test('en développement : démarre sans secret, cookie non Secure', () => {
    const env = loadEnv({ NODE_ENV: 'development' });
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });
});
