'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_DIR = path.resolve(__dirname, '../../db/migrations');
// Clé arbitraire (constante) pour pg_advisory_lock : un seul runner à la fois (plusieurs conteneurs au boot).
const LOCK_KEY = 726104001;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Découpe un script SQL en instructions (gère '...', "...", $$...$$ et les commentaires --).
function splitSql(sql) {
  const out = [];
  let cur = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      cur += '\n';
      continue;
    }
    if (c === "'" || c === '"') {
      cur += c;
      i++;
      while (i < sql.length) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) { cur += c + c; i += 2; continue; } // quote doublée
          break;
        }
        cur += sql[i];
        i++;
      }
      cur += c;
      continue;
    }
    if (c === '$' && sql[i + 1] === '$') {
      const end = sql.indexOf('$$', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      cur += sql.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (c === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function listMigrations(dir = DEFAULT_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

/**
 * Applique les migrations manquantes, chacune dans sa transaction.
 * Les migrations sont idempotentes (IF NOT EXISTS) : sur la base de prod existante,
 * 001_legacy est un no-op. Retourne la liste des migrations appliquées lors de cet appel.
 *
 * options.transform : (sql, name) => sql, hook de test (pg-mem ne supporte ni plpgsql ni `~`).
 * options.split : exécute instruction par instruction (pg-mem compile un lot entier avant de l'exécuter).
 * options.lock : verrou consultatif (par défaut seulement avec un vrai Pool pg).
 */
async function migrate(db, options = {}) {
  const { dir = DEFAULT_DIR, transform = (sql) => sql, lock = db.kind === 'pg', split = false } = options;
  const migrations = listMigrations(dir);
  const applied = [];

  // Le verrou consultatif est lié à une connexion : on le tient sur un client dédié.
  let lockClient = null;
  if (lock) {
    lockClient = await db.pool.connect();
    await lockClient.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
  }
  try {
    // Pas de CREATE TABLE IF NOT EXISTS : la création est protégée par le verrou consultatif ci-dessus.
    const exists = await db.query("SELECT 1 AS present FROM information_schema.tables WHERE table_name = 'schema_migrations'");
    if (exists.rows.length === 0) {
      await db.query(`CREATE TABLE schema_migrations (
        name       text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    }
    const done = new Map((await db.query('SELECT name, checksum FROM schema_migrations')).rows.map((r) => [r.name, r.checksum]));

    for (const m of migrations) {
      const checksum = sha(m.sql);
      if (done.has(m.name)) {
        if (done.get(m.name) !== checksum) {
          throw new Error(`Migration ${m.name} modifiée après application (checksum différent) : créer une nouvelle migration`);
        }
        continue;
      }
      await db.tx(async (tx) => {
        const sql = transform(m.sql, m.name);
        for (const stmt of split ? splitSql(sql) : [sql]) await tx.query(stmt);
        await tx.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [m.name, checksum]);
      });
      applied.push(m.name);
    }
  } finally {
    if (lockClient) {
      try {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
      } finally {
        lockClient.release();
      }
    }
  }
  return applied;
}

module.exports = { migrate, listMigrations, splitSql, DEFAULT_DIR };
