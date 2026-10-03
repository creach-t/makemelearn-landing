'use strict';

// Couche d'accès aux données derrière une interface minimale :
//   db.query(text, params) -> { rows, rowCount }
//   db.tx(async (client) => ...) -> BEGIN/COMMIT/ROLLBACK, client.query(text, params)
//   db.end()
// Une implémentation = un Pool compatible `pg` (vrai Pool, ou celui de pg-mem en test).

function fromPool(pool, { kind = 'pg' } = {}) {
  return {
    kind,
    pool,
    query: (text, params = []) => pool.query(text, params),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn({ query: (t, p = []) => client.query(t, p) });
        await client.query('COMMIT');
        return out;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* connexion déjà perdue */ }
        throw err;
      } finally {
        client.release();
      }
    },
    end: () => pool.end()
  };
}

function createPgDb(connectionString, options = {}) {
  const { Pool } = require('pg');
  const internal = connectionString && /@(postgres|db|localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const pool = new Pool({
    connectionString,
    ssl: options.ssl !== undefined ? options.ssl : (process.env.NODE_ENV === 'production' && !internal ? { rejectUnauthorized: false } : false),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: 'makemelearn-api'
  });
  pool.on('error', (err) => require('../utils/logger').error('Erreur inattendue sur le pool PostgreSQL', { error: err.message }));
  return fromPool(pool);
}

// Singleton « courant » pour les routes historiques (config/database.js) : injectable en test.
let current = null;
const setDb = (db) => { current = db; };
const getDb = () => {
  if (!current) throw new Error('Base de données non initialisée (setDb non appelé)');
  return current;
};

module.exports = { fromPool, createPgDb, setDb, getDb };
