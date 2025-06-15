const { Pool } = require('pg');
const logger = require('../utils/logger');

// Configuration de la pool de connexions PostgreSQL
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  // SSL désactivé pour les containers locaux, activé seulement pour les bases externes
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('@postgres:') 
    ? false 
    : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum de connexions dans la pool
  idleTimeoutMillis: 30000, // Fermeture des connexions inactives après 30s
  connectionTimeoutMillis: 2000, // Timeout de connexion à 2s
  acquireTimeoutMillis: 60000, // Timeout d'acquisition de connexion à 60s
  application_name: 'makemelearn-api'
};

// Création de la pool de connexions
const pool = new Pool(poolConfig);

// Gestion des événements de la pool
pool.on('connect', (client) => {
  logger.debug(`Nouvelle connexion PostgreSQL établie (PID: ${client.processID})`);
});

pool.on('acquire', (client) => {
  logger.debug(`Connexion acquise depuis la pool (PID: ${client.processID})`);
});

pool.on('remove', (client) => {
  logger.debug(`Connexion supprimée de la pool (PID: ${client.processID})`);
});

pool.on('error', (err, client) => {
  logger.error('Erreur inattendue sur la connexion PostgreSQL:', err);
  if (client) {
    logger.error(`Client PID: ${client.processID}`);
  }
});

// Fonction de test de connexion
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as postgres_version');
    client.release();
    
    logger.info('Test de connexion PostgreSQL réussi:', {
      timestamp: result.rows[0].current_time,
      version: result.rows[0].postgres_version.split(' ')[0]
    });
    
    return true;
  } catch (error) {
    logger.error('Échec du test de connexion PostgreSQL:', error.message);
    throw error;
  }
}

// Fonction d'exécution de requête avec gestion d'erreurs
async function query(text, params = []) {
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Requête SQL exécutée:', {
      query: text,
      duration: `${duration}ms`,
      rows: result.rowCount
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    
    logger.error('Erreur lors de l\'exécution de la requête SQL:', {
      query: text,
      params,
      duration: `${duration}ms`,
      error: error.message,
      code: error.code
    });
    
    throw error;
  }
}

// Fonction pour exécuter des requêtes dans une transaction
async function withTransaction(callback) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    
    logger.debug('Transaction PostgreSQL committée avec succès');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction PostgreSQL rollbackée:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Fonction pour incrémenter les statistiques
async function incrementStat(metric, incrementBy = 1, date = null) {
  const statDate = date || new Date().toISOString().split('T')[0];
  
  try {
    await query(
      'SELECT increment_stat($1, $2, $3)',
      [metric, incrementBy, statDate]
    );
    
    logger.debug(`Statistique incrémentée: ${metric} (+${incrementBy})`);
  } catch (error) {
    logger.error(`Erreur lors de l'incrémentation de la statistique ${metric}:`, error.message);
    // Ne pas faire échouer la requête principale pour une erreur de stats
  }
}

// Fonction de nettoyage et maintenance
async function performMaintenance() {
  try {
    logger.info('Démarrage de la maintenance de la base de données...');
    
    // Nettoyage des inscriptions non vérifiées anciennes
    const cleanupResult = await query('SELECT cleanup_old_data()');
    
    logger.info('Maintenance terminée avec succès');
    
    // Statistiques de la pool
    const poolStats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    };
    
    logger.info('Statistiques de la pool PostgreSQL:', poolStats);
    
    return { poolStats };
  } catch (error) {
    logger.error('Erreur lors de la maintenance:', error.message);
    throw error;
  }
}

// Fermeture propre de la pool
async function closePool() {
  try {
    await pool.end();
    logger.info('Pool de connexions PostgreSQL fermée');
  } catch (error) {
    logger.error('Erreur lors de la fermeture de la pool:', error.message);
  }
}

// Gestion de l'arrêt du processus
process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);

module.exports = {
  pool,
  query,
  testConnection,
  withTransaction,
  incrementStat,
  performMaintenance,
  closePool
};