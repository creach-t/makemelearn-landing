'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { createMailer } = require('./lib/mailer');
const { setDb } = require('./lib/db');
const { createHealthRouter } = require('./modules/health');
const { createWaitlistRouter } = require('./modules/waitlist');
const { createContactRouter } = require('./modules/contact');
const { createAuth } = require('./lib/auth');
const { createAuthRouter } = require('./modules/auth');
const { createMeRouter } = require('./modules/me');
const legacyHealthRoutes = require('./routes/health');
const legacyStatsRoutes = require('./routes/stats');

const limiterBase = (windowMs, max, code, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit dépassé', { ip: req.ip, code });
      res.status(429).json({ error: message, code });
    }
  });

// N'applique le limiteur qu'aux POST (les GET de vérification restent couverts par le limiteur global).
const onlyPost = (limiter) => (req, res, next) => (req.method === 'POST' ? limiter(req, res, next) : next());

/**
 * Fabrique de l'application Express. Tout est injecté (db, env, mailer) : testable sans réseau.
 * @param {{db: object, env: object, mailer?: object, extraRoutes?: (v1: import('express').Router, ctx: object) => void}} deps
 */
function createApp({ db, env, mailer, extraRoutes } = {}) {
  if (!db || !env) throw new Error('createApp: db et env sont obligatoires');
  mailer = mailer || createMailer(env);
  setDb(db); // routes historiques (health/stats) via config/database

  const app = express();
  app.disable('x-powered-by');
  // Derrière Traefik (+ Cloudflare) : nombre de proxys de confiance configurable (req.ip = IP réelle)
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.locals.db = db;
  app.locals.env = env;

  app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } }));
  if (env.CORS_ORIGIN) {
    app.use(cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-MML', 'Idempotency-Key']
    }));
  }
  app.use(compression());
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(requestLogger);

  app.use(limiterBase(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX_REQUESTS, 'RATE_LIMIT_EXCEEDED', 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.'));

  const ctx = { db, env, mailer, limiterBase, onlyPost };

  // Sondes : /healthz sans DB (liveness), /readyz avec DB
  const health = createHealthRouter({ db });
  app.use(health);

  const waitlistLimiter = onlyPost(limiterBase(60 * 60 * 1000, 5, 'REGISTRATION_LIMIT_EXCEEDED', "Trop d'inscriptions depuis cette IP, veuillez réessayer plus tard."));
  const contactLimiter = onlyPost(limiterBase(60 * 60 * 1000, env.RATE_LIMIT_CONTACT, 'CONTACT_LIMIT_EXCEEDED', 'Trop de messages envoyés récemment. Veuillez patienter une heure avant de réessayer.'));
  const waitlist = createWaitlistRouter({ db, env });
  const contact = createContactRouter({ env, mailer });

  // API v1 (same-origin)
  const v1 = express.Router();
  v1.use(health);
  v1.use('/waitlist', waitlistLimiter, waitlist);
  v1.use('/contact', contactLimiter, contact);
  // Identité : invité anonyme -> compte par lien magique (même user_id)
  const auth = createAuth({ db, env });
  v1.use(auth.attachUser);
  v1.use('/auth', createAuthRouter({ db, env, mailer, auth, limiterBase }));
  v1.use('/me', createMeRouter({ db, auth }));
  ctx.auth = auth;
  if (extraRoutes) extraRoutes(v1, ctx);
  app.use('/api/v1', v1);

  // Alias historiques (1 release) : anciens chemins avec et sans préfixe /api (plus de stripprefix Traefik)
  for (const prefix of ['', '/api']) {
    app.use(`${prefix}/registrations`, waitlistLimiter, waitlist);
    app.use(`${prefix}/contact`, contactLimiter, contact);
    app.use(`${prefix}/health`, legacyHealthRoutes);
    app.use(`${prefix}/stats`, legacyStatsRoutes);
  }

  // Site statique (image unique : l'app sert aussi le front). Les chemins /api/* non reconnus restent en 404 JSON.
  if (env.STATIC_DIR && fs.existsSync(env.STATIC_DIR)) {
    const serveStatic = express.static(path.resolve(env.STATIC_DIR), {
      index: 'index.html',
      extensions: ['html'],
      dotfiles: 'ignore',
      maxAge: '1h'
    });
    app.use((req, res, next) => (req.path.startsWith('/api/') ? next() : serveStatic(req, res, next)));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
