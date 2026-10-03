'use strict';

/**
 * Base de test.
 *  - TEST_DATABASE_URL défini (URL d'un Postgres jetable AVEC droit CREATEDB, base de maintenance
 *    ex. .../postgres) : une base dédiée est créée par fichier de test puis supprimée -> vrai Postgres.
 *  - sinon : pg-mem (Postgres en mémoire, API pg). pg-mem n'implémente ni plpgsql/triggers ni l'opérateur
 *    `~` : le SQL des migrations est filtré (transformForPgMem), ces parties ne sont donc testées
 *    que sur un vrai Postgres.
 */
const crypto = require('crypto');
const path = require('path');
const { fromPool } = require('../../src/lib/db');
const { migrate } = require('../../src/lib/migrate');

const REAL = Boolean(process.env.TEST_DATABASE_URL);

// pg-mem ne sait pas lire 001_legacy.sql (CURRENT_TIMESTAMP/CURRENT_DATE en défaut, UNIQUE composite, plpgsql) :
// équivalent minimal pour les tables utilisées par les tests. Le vrai 001 n'est testé que sur un vrai Postgres.
const PGMEM_001 = `
CREATE TABLE IF NOT EXISTS registrations (
  id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, source VARCHAR(100) DEFAULT 'website',
  metadata JSONB DEFAULT '{}', is_verified BOOLEAN DEFAULT false, verification_token VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), unsubscribed_at TIMESTAMPTZ DEFAULT NULL);
CREATE TABLE IF NOT EXISTS stats (id SERIAL PRIMARY KEY, metric_name VARCHAR(100) NOT NULL, metric_value INTEGER DEFAULT 0, date DATE, created_at TIMESTAMPTZ DEFAULT now());
`;

function transformForPgMem(sql, name) {
  if (name && name.startsWith('001')) return PGMEM_001;
  return sql
    .replace(/\bsmallserial\b/gi, 'serial')
    .replace(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION[\s\S]*?\$\$\s*language\s+'?plpgsql'?\s*;/gi, '')
    .replace(/CREATE\s+TRIGGER[\s\S]*?;/gi, '')
    .replace(/DROP\s+TRIGGER[\s\S]*?;/gi, '')
    .replace(/COMMENT\s+ON[\s\S]*?;/gi, '')
    .replace(/CREATE\s+OR\s+REPLACE\s+VIEW[\s\S]*?;/gi, '')
    .replace(/^\s*CONSTRAINT\s+users_handle_fmt[^\n]*\n/m, '');
}

const PGMEM_MIGRATE_OPTS = { transform: transformForPgMem, lock: false, split: true };

async function createPgMemDb({ migrateSchema = true } = {}) {
  const { newDb, DataType } = require('pg-mem');
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, implementation: () => crypto.randomUUID(), impure: true });
  mem.public.registerFunction({ name: 'increment_stat', args: [DataType.text, DataType.integer], returns: DataType.integer, implementation: () => 1 });
  const { Pool } = mem.adapters.createPg();
  const base = fromPool(new Pool(), { kind: 'pg-mem' });
  // pg-mem interprète mal les Buffer binaires aléatoires (échecs sporadiques) : on les passe en notation hexadécimale bytea.
  const fix = (params = []) => params.map((p) => (Buffer.isBuffer(p) ? '\\x' + p.toString('hex') : p));
  const db = {
    ...base,
    query: (text, params = []) => base.query(text, fix(params)),
    tx: (fn) => base.tx((client) => fn({ query: (text, params = []) => client.query(text, fix(params)) }))
  };
  if (migrateSchema) await migrate(db, PGMEM_MIGRATE_OPTS);
  return { db, kind: 'pg-mem', close: () => db.end() };
}

async function createRealDb({ migrateSchema = true } = {}) {
  const { Pool } = require('pg');
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const name = `mml_t_${crypto.randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const db = fromPool(new Pool({ connectionString: url.toString(), max: 10 }));
  if (migrateSchema) await migrate(db);
  return {
    db,
    kind: 'pg',
    async close() {
      await db.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    }
  };
}

/** @returns {Promise<{db: object, kind: 'pg'|'pg-mem', close: () => Promise<void>}>} */
const createTestDb = (opts) => (REAL ? createRealDb(opts) : createPgMemDb(opts));

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

module.exports = { createTestDb, transformForPgMem, MIGRATE_OPTS: REAL ? {} : PGMEM_MIGRATE_OPTS, REAL, MIGRATIONS_DIR };
