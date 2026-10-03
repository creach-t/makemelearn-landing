'use strict';

require('dotenv').config();

const logger = require('./utils/logger');
const { loadEnv } = require('./config/env');

// Erreurs non capturées : un rejet de promesse est loggé SANS arrêter le process (un seul
// handler défaillant ne doit pas tuer l'API) ; une exception synchrone non capturée laisse
// le process dans un état inconnu : log + exit(1), Docker (restart: unless-stopped) relance.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: reason instanceof Error ? reason.stack : String(reason) });
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.stack });
  process.exit(1);
});

async function startServer() {
  const env = loadEnv(process.env); // lève si SESSION_SECRET / DATABASE_URL manquent en production

  const { createPgDb } = require('./lib/db');
  const { migrate } = require('./lib/migrate');
  const { createApp } = require('./app');

  const db = createPgDb(env.DATABASE_URL);
  await db.query('SELECT 1');
  logger.info('Connexion à la base de données établie');

  const applied = await migrate(db);
  if (applied.length) logger.info('Migrations appliquées', { applied });

  if (env.SYNC_CONTENT) {
    const { syncContentFromDir, resolveContentDir } = require('./lib/content');
    const dir = resolveContentDir(env.CONTENT_DIR);
    if (dir) {
      const report = await syncContentFromDir(db, dir);
      logger.info('Contenu synchronisé', report);
    } else {
      logger.warn('Répertoire de contenu introuvable (CONTENT_DIR) : synchronisation ignorée');
    }
  }

  const app = createApp({ db, env });
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`API MakeMeLearn démarrée sur le port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} reçu, arrêt du serveur`);
    server.close(() => db.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
  logger.error('Erreur au démarrage du serveur', { error: error.message });
  process.exit(1);
});
