#!/usr/bin/env node
// Synchronise data/ vers Postgres (upsert idempotent par key stable ; jamais de DELETE de contenu :
// un élément retiré est archivé). Rejouable en CI sur un Postgres jetable.
//
// Usage : DATABASE_URL=postgres://... node scripts/sync-content.mjs [répertoire-data] [--no-migrate]
//   1. valide le contenu (même validation que validate-content) ;
//   2. applique les migrations manquantes (sauf --no-migrate) ;
//   3. synchronise et affiche le rapport (writes = 0 au 2e passage).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(path.join(root, 'api', 'package.json'));
require('dotenv').config({ path: path.join(root, 'api', '.env') });

const { createPgDb } = require('./src/lib/db.js');
const { migrate } = require('./src/lib/migrate.js');
const { syncContentFromDir, resolveContentDir } = require('./src/lib/content.js');

const args = process.argv.slice(2);
const noMigrate = args.includes('--no-migrate');
const dirArg = args.find((a) => !a.startsWith('--'));

if (!process.env.DATABASE_URL) {
  console.error('sync-content : DATABASE_URL est obligatoire');
  process.exit(2);
}
const dir = dirArg ? path.resolve(dirArg) : resolveContentDir(process.env.CONTENT_DIR);
if (!dir) {
  console.error('sync-content : répertoire de contenu introuvable (argument ou CONTENT_DIR)');
  process.exit(2);
}

const db = createPgDb(process.env.DATABASE_URL, { ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
try {
  if (!noMigrate) {
    const applied = await migrate(db);
    if (applied.length) console.log(`migrations appliquées : ${applied.join(', ')}`);
  }
  const report = await syncContentFromDir(db, dir);
  console.log(JSON.stringify(report, null, 2));
  console.log(report.writes === 0 ? 'sync-content : rien à écrire (déjà à jour)' : `sync-content : ${report.writes} écriture(s)`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
