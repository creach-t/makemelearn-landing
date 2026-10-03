'use strict';

const { loadEnv } = require('../../src/config/env');
const { createApp } = require('../../src/app');
const { createMailer } = require('../../src/lib/mailer');

/** Mailer de test : capture les messages au lieu de les envoyer. */
function createMailCapture() {
  const sent = [];
  const mailer = {
    configured: true,
    sent,
    async send(msg) {
      sent.push(msg);
      return { messageId: `test-${sent.length}` };
    }
  };
  return mailer;
}

function buildApp(db, overrides = {}, { mailer } = {}) {
  const env = loadEnv({
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-secret-test-secret-test-secret-123456',
    APP_URL: 'http://localhost:3000',
    RATE_LIMIT_MAX_REQUESTS: '10000',
    ...overrides
  });
  const mail = mailer || createMailCapture();
  return { app: createApp({ db, env, mailer: mail }), env, mailer: mail };
}

module.exports = { buildApp, createMailCapture, createMailer };
