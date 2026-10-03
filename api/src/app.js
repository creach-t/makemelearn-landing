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
const { createUniversesRouter } = require('./modules/universes');
const { createSessionsRouter } = require('./modules/sessions');
const { createProgressRouter } = require('./modules/progress');
const legacyHealthRoutes = require('./routes/health');
const legacyStatsRoutes = require('./routes/stats');

const limiterBase = (windowMs, max, code, message, { skip } = {}) =>
  rateLimit({
    windowMs,
    max,
    skip,
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

  // Trois périmètres de quota par IP :
  //  - API « jeu » (/api/v1/universes|sessions|progress|me) : quota large (600 / 15 min) ; les réponses ont en plus un quota par joueur ;
  //  - fichiers statiques (site, /app/) : non limités ici (un chargement du jeu = ~20 fichiers ; Cloudflare est devant) ;
  //  - tout le reste (waitlist, contact, auth, santé, stats historiques) : le quota global historique (100 / 15 min).
  const isGameApi = (req) => /^\/api\/v1\/(universes|sessions|progress|me)(\/|$)/.test(req.path);
  const isApiPath = (req) => /^\/(api|registrations|contact|health|healthz|readyz|stats)(\/|$)/.test(req.path);
  const isStaticAsset = (req) => (req.method === 'GET' || req.method === 'HEAD') && !isApiPath(req);
  app.use(limiterBase(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX_REQUESTS, 'RATE_LIMIT_EXCEEDED', 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.', {
    skip: (req) => isGameApi(req) || isStaticAsset(req)
  }));
  app.use(limiterBase(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_GAME_MAX, 'GAME_RATE_LIMIT_EXCEEDED', 'Trop de requêtes depuis cette IP, veuillez réessayer dans quelques minutes.', {
    skip: (req) => !isGameApi(req)
  }));

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
  // Jeu : catalogue public ; sessions et progression exigent un joueur (invité ou compte) + CSRF sur les mutations
  v1.use('/universes', createUniversesRouter({ db, env }));
  v1.use('/sessions', createSessionsRouter({ db, env, auth }));
  v1.use('/progress', createProgressRouter({ db, auth }));
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
    const staticRoot = path.resolve(env.STATIC_DIR);
    const serveStatic = express.static(staticRoot, {
      index: 'index.html',
      extensions: ['html'],
      dotfiles: 'ignore',
      maxAge: '1h',
      // Le jeu (/app/) n'a pas de noms de fichiers hachés : on revalide à chaque chargement (ETag) pour qu'une mise en
      // production ne serve jamais un mélange d'anciens et de nouveaux modules JS.
      setHeaders: (res, filePath) => {
        if (path.relative(staticRoot, filePath).split(path.sep)[0] === 'app') res.setHeader('Cache-Control', 'no-cache');
      }
    });
    app.use((req, res, next) => (req.path.startsWith('/api/') ? next() : serveStatic(req, res, next)));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
