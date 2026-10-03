#!/usr/bin/env node
// Valide data/ (schémas JSON + règles sémantiques). Exit 1 si le contenu est invalide.
// Usage : node scripts/validate-content.mjs [répertoire-data]   (défaut : data/)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
// Les dépendances (ajv) vivent dans api/node_modules
const require = createRequire(path.join(root, 'api', 'package.json'));
const { loadContent, validateContent, formatErrors } = require('./src/lib/content.js');

const dir = path.resolve(process.argv[2] || path.join(root, 'data'));
const content = loadContent(dir);
const errors = validateContent(content);
const nItems = content.universes.reduce((n, u) => n + u.lessons.reduce((m, l) => m + ((l.data && l.data.items) || []).length, 0), 0);

if (errors.length) {
  console.error(`validate-content : ${errors.length} erreur(s) dans ${dir}\n${formatErrors(errors)}`);
  process.exit(1);
}
console.log(`validate-content : OK (${content.universes.length} univers, ${content.universes.reduce((n, u) => n + u.lessons.length, 0)} leçons, ${nItems} items)`);
