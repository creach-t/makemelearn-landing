#!/usr/bin/env node
// Échoue (exit 1) si une route Express 4 reçoit une fonction `async` NON enveloppée dans safe().
// Express 4 n'attrape pas les rejets des handlers async : un rejet non géré fait tomber le process.
//
// Usage : node scripts/check-safe.mjs [répertoire|fichier ...]   (défaut : api/src)
//
// Détecte, pour <obj>.(get|post|put|patch|delete|all|use|param)(...) :
//   - un argument directement `async (...) => ...` ou `async function ...`
//   - un identifiant qui désigne une fonction déclarée async dans le même fichier
// Les arguments passés à safe(...) sont ignorés (ils sont enveloppés).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTE_RE = /\b([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|all|use|param)\s*\(/g;

// Remplace commentaires et littéraux (chaînes, gabarits) par des espaces en conservant la longueur
// et les retours à la ligne : les positions et les parenthèses restent exploitables.
function blank(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const keep = (c) => (c === '\n' || c === '\r' ? c : ' ');
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += keep(src[i]); i++; }
      out += '  '; i += 2;
    } else if (c === "'" || c === '"') {
      out += c; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') { out += ' '; i++; } out += ' '; i++; }
      out += c; i++;
    } else if (c === '`') {
      // Gabarit : le contenu des ${...} peut contenir du code, mais jamais de définition de route ici.
      out += c; i++;
      let depth = 0;
      while (i < n && !(src[i] === '`' && depth === 0)) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { depth++; out += '  '; i += 2; continue; }
        if (src[i] === '}' && depth > 0) { depth--; out += ' '; i++; continue; }
        out += keep(src[i]); i++;
      }
      out += c; i++;
    } else {
      out += c; i++;
    }
  }
  return out;
}

// Retourne le texte entre la parenthèse ouvrante (index `open`) et sa parenthèse fermante.
function balanced(clean, open) {
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    const c = clean[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return { end: i, inner: clean.slice(open + 1, i) };
    }
  }
  return null;
}

// Découpe `inner` en arguments de premier niveau (profondeur 0).
function splitArgs(inner) {
  const args = [];
  let depth = 0;
  let cur = '';
  for (const c of inner) {
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { args.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) args.push(cur);
  return args.map((a) => a.trim());
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

export function checkSource(src, file = '<source>') {
  const clean = blank(src);
  const violations = [];

  // Fonctions async nommées du fichier
  const asyncNames = new Set();
  for (const m of clean.matchAll(/\basync\s+function\s+([A-Za-z_$][\w$]*)/g)) asyncNames.add(m[1]);
  for (const m of clean.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*async\b/g)) asyncNames.add(m[1]);

  for (const m of clean.matchAll(ROUTE_RE)) {
    const [full, obj, method] = m;
    const open = m.index + full.length - 1;
    const b = balanced(clean, open);
    if (!b) continue;
    // Ignorer les appels qui ne sont pas des routes (ex. map.get('x'), cache.get(k)) : on n'inspecte que
    // les arguments ; un `.get('clé')` sans fonction ne produit aucune violation.
    for (const arg of splitArgs(b.inner)) {
      const direct = /^async\b/.test(arg);
      const named = /^[A-Za-z_$][\w$]*$/.test(arg) && asyncNames.has(arg);
      if (direct || named) {
        violations.push({
          file,
          line: lineOf(src, open),
          route: `${obj}.${method}(…)`,
          reason: direct ? 'handler async non enveloppé dans safe()' : `handler async « ${arg} » non enveloppé dans safe()`
        });
      }
    }
  }
  return violations;
}

function* walk(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) { if (/\.(c|m)?js$/.test(target)) yield target; return; }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    yield* walk(path.join(target, entry.name));
  }
}

export function checkPaths(targets) {
  const violations = [];
  let files = 0;
  for (const t of targets) {
    for (const f of walk(t)) {
      files++;
      violations.push(...checkSource(fs.readFileSync(f, 'utf8'), f));
    }
  }
  return { files, violations };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(root, 'api', 'src')];
  const { files, violations } = checkPaths(targets);
  for (const v of violations) console.error(`${path.relative(process.cwd(), v.file)}:${v.line}  ${v.route}  ${v.reason}`);
  if (violations.length) {
    console.error(`\ncheck-safe : ${violations.length} route(s) async non enveloppée(s) dans safe() (${files} fichiers analysés)`);
    process.exit(1);
  }
  console.log(`check-safe : OK (${files} fichiers analysés, aucune route async non enveloppée)`);
}
