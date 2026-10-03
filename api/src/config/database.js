'use strict';

// Façade historique (routes health/stats) au-dessus de lib/db : une seule couche d'accès.
const logger = require('../utils/logger');
const { getDb } = require('../lib/db');

async function testConnection() {
  const result = await getDb().query('SELECT NOW() AS current_time, version() AS postgres_version');
  logger.info('Test de connexion PostgreSQL réussi', { version: String(result.rows[0].postgres_version).split(' ')[1] });
  return true;
}

const query = (text, params = []) => getDb().query(text, params);
const withTransaction = (fn) => getDb().tx(fn);

// Ne fait jamais échouer la requête principale pour une erreur de stats.
async function incrementStat(metric, incrementBy = 1, date = null) {
  try {
    if (date) {
      await query(
        `INSERT INTO stats (metric_name, metric_value, date) VALUES ($1, $2, $3)
         ON CONFLICT (metric_name, date) DO UPDATE SET metric_value = stats.metric_value + $2`,
        [metric, incrementBy, date]
      );
    } else {
      await query('SELECT increment_stat($1, $2)', [metric, incrementBy]);
    }
  } catch (error) {
    logger.error(`Erreur lors de l'incrémentation de la statistique ${metric}`, { error: error.message });
  }
}

async function performMaintenance() {
  logger.info('Démarrage de la maintenance de la base de données');
  await query('SELECT cleanup_old_data()');
  const pool = getDb().pool;
  const poolStats = pool ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } : {};
  logger.info('Maintenance terminée', poolStats);
  return { poolStats };
}

module.exports = {
  get pool() { return getDb().pool; },
  query,
  testConnection,
  withTransaction,
  incrementStat,
  performMaintenance
};
