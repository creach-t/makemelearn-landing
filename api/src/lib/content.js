'use strict';

/**
 * Pipeline de contenu : data/ (JSON versionné) -> validation (ajv + règles sémantiques) -> Postgres.
 * Utilisé par scripts/validate-content.mjs, scripts/sync-content.mjs et au démarrage de l'API.
 *
 * Format des fichiers : dossier/research/univers/SPEC-FORMAT.md et univers-pedagogie.md section 1.
 *   data/universes/<slug>/universe.json, skills.json, lessons/NN-<slug>.json ; data/quests.json ; data/badges.json
 *   data/schema/*.schema.json
 *
 * Contrat de synchronisation :
 *  - upsert par `key` stable (lessons: '<univers>/<leçon>', items: '<univers>/<leçon>/<item>') ;
 *  - idempotent : si content_hash est inchangé, AUCUNE écriture ;
 *  - jamais de DELETE sur le contenu : un élément retiré des fichiers est archivé (archived_at),
 *    ses attempts / sa progression sont conservés (seuls les liens de prérequis sont recalculés).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Ajv = require('ajv');

const TYPE_TO_KIND = {
  qcm: 'mcq',
  vrai_faux: 'truefalse',
  trous: 'cloze',
  appariement: 'match',
  ordre: 'ordering',
  saisie: 'input',
  flashcard: 'flashcard',
  code: 'code'
};
const STATUS_MAP = { brouillon: 'draft', relecture: 'draft', publie: 'published' };
const HTML_RE = /<\/?[a-zA-Z!][^>]*>/;
const SYNC_LOCK_KEY = 726104002;

// ---------------------------------------------------------------- utilitaires

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const hashOf = (value) => crypto.createHash('sha256').update(stable(value)).digest('hex');

function resolveContentDir(configured) {
  const candidates = configured
    ? [path.resolve(configured)]
    : [path.resolve(__dirname, '../../../data'), path.resolve(process.cwd(), 'data')];
  return candidates.find((c) => fs.existsSync(path.join(c, 'universes'))) || null;
}

// ---------------------------------------------------------------- chargement

function readJson(file, errors, root) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push({ file: path.relative(root, file), path: '', message: `JSON illisible : ${err.message}` });
    return null;
  }
}

/** Charge tout le contenu sans le valider. Les erreurs de lecture sont dans `errors`. */
function loadContent(dir) {
  const root = path.resolve(dir);
  const errors = [];
  const schemas = {};
  const schemaDir = path.join(root, 'schema');
  if (fs.existsSync(schemaDir)) {
    for (const f of fs.readdirSync(schemaDir).filter((n) => n.endsWith('.schema.json'))) {
      schemas[f.replace('.schema.json', '')] = readJson(path.join(schemaDir, f), errors, root);
    }
  }

  const universes = [];
  const uniDir = path.join(root, 'universes');
  const slugs = fs.existsSync(uniDir) ? fs.readdirSync(uniDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  for (const slug of slugs) {
    const dirU = path.join(uniDir, slug);
    const rel = (f) => path.relative(root, f);
    const universe = fs.existsSync(path.join(dirU, 'universe.json')) ? readJson(path.join(dirU, 'universe.json'), errors, root) : null;
    if (!universe && !fs.existsSync(path.join(dirU, 'universe.json'))) errors.push({ file: rel(dirU), path: '', message: 'universe.json manquant' });
    const skills = fs.existsSync(path.join(dirU, 'skills.json')) ? readJson(path.join(dirU, 'skills.json'), errors, root) : null;
    if (!skills && !fs.existsSync(path.join(dirU, 'skills.json'))) errors.push({ file: rel(dirU), path: '', message: 'skills.json manquant' });
    const lessonsDir = path.join(dirU, 'lessons');
    const lessons = [];
    if (fs.existsSync(lessonsDir)) {
      for (const f of fs.readdirSync(lessonsDir).filter((n) => n.endsWith('.json')).sort()) {
        const data = readJson(path.join(lessonsDir, f), errors, root);
        if (data) lessons.push({ file: rel(path.join(lessonsDir, f)), name: f, data });
      }
    }
    universes.push({ slug, dir: dirU, file: rel(path.join(dirU, 'universe.json')), skillsFile: rel(path.join(dirU, 'skills.json')), universe, skills, lessons });
  }

  const optional = (name) => (fs.existsSync(path.join(root, name)) ? readJson(path.join(root, name), errors, root) : null);
  return { root, schemas, universes, quests: optional('quests.json'), badges: optional('badges.json'), errors };
}

// ---------------------------------------------------------------- validation

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function findCycle(nodes, edgesOf) {
  const state = new Map(); // 1 = en cours, 2 = terminé
  const visit = (n, trail) => {
    if (state.get(n) === 2) return null;
    if (state.get(n) === 1) return [...trail.slice(trail.indexOf(n)), n];
    state.set(n, 1);
    for (const m of edgesOf(n)) {
      const c = visit(m, [...trail, n]);
      if (c) return c;
    }
    state.set(n, 2);
    return null;
  };
  for (const n of nodes) {
    const c = visit(n, []);
    if (c) return c;
  }
  return null;
}

function checkItem(item, file, at, add) {
  const t = item.type;
  if (t === 'qcm' && Array.isArray(item.choix)) {
    const ids = item.choix.map((c) => c.id);
    if (new Set(ids).size !== ids.length) add(file, `${at}/choix`, 'identifiants de choix dupliqués');
    if (!ids.includes(item.bonne)) add(file, `${at}/bonne`, `la bonne réponse « ${item.bonne} » ne correspond à aucun choix`);
    for (const c of item.choix) {
      if (c.id !== item.bonne && !(c.distracteur_pourquoi || '').trim()) add(file, `${at}/choix`, `le choix « ${c.id} » (faux) n'a pas de distracteur_pourquoi`);
    }
    if (new Set(item.choix.map((c) => norm(c.texte))).size !== item.choix.length) add(file, `${at}/choix`, 'deux choix ont le même texte');
  }
  if (t === 'trous' && typeof item.texte === 'string' && Array.isArray(item.trous)) {
    const used = [...item.texte.matchAll(/\{\{(\d)\}\}/g)].map((m) => m[1]);
    const declared = item.trous.map((x) => x.id);
    for (const u of used) if (!declared.includes(u)) add(file, `${at}/texte`, `{{${u}}} n'a pas de trou déclaré`);
    for (const d of declared) if (!used.includes(d)) add(file, `${at}/trous`, `le trou « ${d} » n'apparaît pas dans le texte`);
    if (new Set(declared).size !== declared.length) add(file, `${at}/trous`, 'identifiants de trous dupliqués');
    for (const trou of item.trous) {
      if (trou.banque && !trou.banque.some((b) => trou.reponses_acceptees.map(norm).includes(norm(b)))) {
        add(file, `${at}/trous`, `la banque du trou « ${trou.id} » ne contient aucune réponse acceptée`);
      }
    }
  }
  if (t === 'appariement' && Array.isArray(item.paires)) {
    if (new Set(item.paires.map((p) => norm(p.gauche))).size !== item.paires.length) add(file, `${at}/paires`, 'éléments de gauche dupliqués');
    if (new Set(item.paires.map((p) => norm(p.droite))).size !== item.paires.length) add(file, `${at}/paires`, 'éléments de droite dupliqués (appariement 1-1)');
  }
  if (t === 'ordre' && Array.isArray(item.elements) && new Set(item.elements.map(norm)).size !== item.elements.length) {
    add(file, `${at}/elements`, 'éléments à ordonner dupliqués');
  }
  if (t === 'saisie' && Array.isArray(item.reponses_acceptees) && new Set(item.reponses_acceptees).size !== item.reponses_acceptees.length) {
    add(file, `${at}/reponses_acceptees`, 'réponses acceptées dupliquées');
  }
  // Pas de HTML brut dans les textes (le code d'un exercice `code` est exempté)
  const scan = (value, p) => {
    if (typeof value === 'string') {
      if (HTML_RE.test(value)) add(file, p, 'HTML brut interdit (Markdown limité)');
    } else if (Array.isArray(value)) value.forEach((v, i) => scan(v, `${p}/${i}`));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (t === 'code' && ['code_depart', 'solution', 'tests'].includes(k)) continue;
        scan(v, `${p}/${k}`);
      }
    }
  };
  scan(item, at);
}

function checkUniverse(u, add) {
  const { universe, skills, lessons } = u;
  if (!universe) return;
  if (universe.slug !== u.slug) add(u.file, '/slug', `le slug « ${universe.slug} » doit correspondre au dossier « ${u.slug} »`);
  const chapters = new Set((universe.chapitres || []).map((c) => c.id));
  if (chapters.size !== (universe.chapitres || []).length) add(u.file, '/chapitres', 'identifiants de chapitres dupliqués');

  // compétences
  const skillIds = new Set();
  if (skills && Array.isArray(skills.competences)) {
    for (const s of skills.competences) {
      if (skillIds.has(s.id)) add(u.skillsFile, '/competences', `compétence dupliquée : ${s.id}`);
      skillIds.add(s.id);
      if (!s.id.startsWith(`${universe.id}.`)) add(u.skillsFile, '/competences', `${s.id} : le préfixe doit être « ${universe.id}. »`);
      if (!chapters.has(s.chapitre)) add(u.skillsFile, '/competences', `${s.id} : chapitre « ${s.chapitre} » inconnu`);
    }
    const byId = new Map(skills.competences.map((s) => [s.id, s]));
    for (const s of skills.competences) {
      for (const p of s.prerequis) {
        if (!byId.has(p)) add(u.skillsFile, '/competences', `${s.id} : prérequis inconnu « ${p} »`);
        if (p === s.id) add(u.skillsFile, '/competences', `${s.id} : prérequis sur lui-même`);
      }
    }
    const cycle = findCycle([...byId.keys()], (n) => (byId.get(n).prerequis || []).filter((p) => byId.has(p)));
    if (cycle) add(u.skillsFile, '/competences', `cycle dans les compétences : ${cycle.join(' -> ')}`);
  }

  // leçons
  const lessonIds = new Map();
  const slugs = new Set();
  const positions = new Set();
  const itemIds = new Set();
  for (const { file, name, data: l } of lessons) {
    if (!l.id || !l.slug) continue;
    if (!l.id.startsWith(`${universe.id}.`)) add(file, '/id', `l'id doit commencer par « ${universe.id}. »`);
    if (lessonIds.has(l.id)) add(file, '/id', `leçon dupliquée : ${l.id}`);
    lessonIds.set(l.id, l);
    if (slugs.has(l.slug)) add(file, '/slug', `slug de leçon dupliqué : ${l.slug}`);
    slugs.add(l.slug);
    if (positions.has(l.position)) add(file, '/position', `position dupliquée : ${l.position}`);
    positions.add(l.position);
    if (name !== `${String(l.position).padStart(2, '0')}-${l.slug}.json`) add(file, '', `le nom de fichier doit être « ${String(l.position).padStart(2, '0')}-${l.slug}.json »`);
    if (!chapters.has(l.chapitre)) add(file, '/chapitre', `chapitre « ${l.chapitre} » absent de universe.json`);
    for (const c of l.competences || []) if (!skillIds.has(c)) add(file, '/competences', `compétence inconnue : ${c}`);
    (l.items || []).forEach((item, i) => {
      const at = `/items/${i}`;
      if (!item.id) return;
      if (!item.id.startsWith(`${l.id}.i`)) add(file, `${at}/id`, `l'id d'item doit commencer par « ${l.id}.i »`);
      if (itemIds.has(item.id)) add(file, `${at}/id`, `item dupliqué dans l'univers : ${item.id}`);
      itemIds.add(item.id);
      if (!skillIds.has(item.competence)) add(file, `${at}/competence`, `compétence inconnue : ${item.competence}`);
      else if (!(l.competences || []).includes(item.competence)) add(file, `${at}/competence`, `${item.competence} n'est pas déclarée dans les compétences de la leçon`);
      checkItem(item, file, at, add);
    });
    for (const k of ['micro_cours', 'recap']) if (HTML_RE.test(l[k] || '')) add(file, `/${k}`, 'HTML brut interdit (Markdown limité)');
  }
  for (const { file, data: l } of lessons) {
    for (const p of l.prerequis || []) {
      if (p === l.id) add(file, '/prerequis', 'une leçon ne peut pas être son propre prérequis');
      else if (!lessonIds.has(p)) add(file, '/prerequis', `prérequis inconnu : ${p}`);
    }
  }
  const cycle = findCycle([...lessonIds.keys()], (n) => (lessonIds.get(n).prerequis || []).filter((p) => lessonIds.has(p)));
  if (cycle) add(u.file, '/', `cycle de prérequis entre leçons : ${cycle.join(' -> ')}`);
}

/** @returns {{file: string, path: string, message: string}[]} liste vide = contenu valide. */
function validateContent(content) {
  const errors = [...content.errors];
  const add = (file, p, message) => errors.push({ file, path: p, message });
  const ajv = new Ajv({ allErrors: true, strict: false });
  const compile = (name) => (content.schemas[name] ? ajv.compile(content.schemas[name]) : null);
  const validators = Object.fromEntries(['universe', 'skills', 'lesson', 'quests', 'badges'].map((n) => [n, compile(n)]));
  for (const [n, v] of Object.entries(validators)) if (!v) add('schema', '', `schéma manquant : ${n}.schema.json`);

  const run = (name, data, file) => {
    const v = validators[name];
    if (!v || data == null) return true;
    if (v(data)) return true;
    for (const e of v.errors) {
      // Pour les `if/then`, ajv ajoute une erreur « must match then » peu lisible : on la garde mais en dernier
      add(file, e.instancePath, `${e.message}${e.params && e.params.additionalProperty ? ` (${e.params.additionalProperty})` : ''}${e.params && e.params.missingProperty ? ` (${e.params.missingProperty})` : ''}`);
    }
    return false;
  };

  const slugSet = new Set();
  for (const u of content.universes) {
    slugSet.add(u.slug);
    const okU = run('universe', u.universe, u.file);
    const okS = run('skills', u.skills, u.skillsFile);
    let okL = true;
    for (const l of u.lessons) okL = run('lesson', l.data, l.file) && okL;
    if (okU && okS && okL) checkUniverse(u, add);
  }
  run('quests', content.quests, 'quests.json');
  run('badges', content.badges, 'badges.json');
  const dup = (list, key, file) => {
    const seen = new Set();
    for (const x of list || []) {
      if (seen.has(x[key])) add(file, '', `${key} dupliqué : ${x[key]}`);
      seen.add(x[key]);
    }
  };
  if (content.quests) {
    dup(content.quests.quetes, 'slug', 'quests.json');
    for (const q of content.quests.quetes || []) if (q.univers && !slugSet.has(q.univers)) add('quests.json', '', `quête ${q.slug} : univers inconnu « ${q.univers} »`);
  }
  if (content.badges) dup(content.badges.badges, 'slug', 'badges.json');
  return errors;
}

const formatErrors = (errors) => errors.map((e) => `  ${e.file}${e.path ? ` ${e.path}` : ''} : ${e.message}`).join('\n');

// ---------------------------------------------------------------- synchronisation

/**
 * Upsert idempotent du contenu validé. Retourne un rapport ; `writes` = nombre d'ordres INSERT/UPDATE/DELETE exécutés
 * (0 si rien n'a changé).
 */
async function syncContent(db, content) {
  const report = {
    writes: 0,
    universes: { created: 0, updated: 0, unchanged: 0 },
    lessons: { created: 0, updated: 0, unchanged: 0, archived: 0 },
    items: { created: 0, updated: 0, unchanged: 0, archived: 0 },
    prerequisites: { added: 0, removed: 0 },
    quests: { created: 0, updated: 0, unchanged: 0 },
    badges: { created: 0, updated: 0, unchanged: 0 }
  };

  await db.tx(async (tx) => {
    if (db.kind === 'pg') await tx.query('SELECT pg_advisory_xact_lock($1)', [SYNC_LOCK_KEY]);
    const write = (text, params) => {
      report.writes++;
      return tx.query(text, params);
    };

    const universeIds = new Map(); // slug -> id

    for (const u of content.universes) {
      const un = u.universe;
      const row = {
        title: un.titre,
        tagline: un.accroche || '',
        description: un.description || '',
        locale: un.locale || 'fr',
        status: STATUS_MAP[un.statut],
        sort_order: un.ordre || 0,
        theme: { color: (un.theme || {}).couleur, icon: (un.theme || {}).icone }
      };
      const hash = hashOf(un);
      const found = (await tx.query('SELECT id, content_hash FROM universes WHERE slug = $1', [u.slug])).rows[0];
      let uid;
      if (!found) {
        const ins = await write(
          `INSERT INTO universes (slug, title, tagline, description, locale, status, sort_order, theme, content_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [u.slug, row.title, row.tagline, row.description, row.locale, row.status, row.sort_order, JSON.stringify(row.theme), hash]
        );
        uid = ins.rows[0].id;
        report.universes.created++;
      } else {
        uid = found.id;
        if (found.content_hash !== hash) {
          await write(
            `UPDATE universes SET title = $2, tagline = $3, description = $4, locale = $5, status = $6, sort_order = $7, theme = $8, content_hash = $9 WHERE id = $1`,
            [uid, row.title, row.tagline, row.description, row.locale, row.status, row.sort_order, JSON.stringify(row.theme), hash]
          );
          report.universes.updated++;
        } else report.universes.unchanged++;
      }
      universeIds.set(u.slug, uid);

      // ---- leçons
      const existingLessons = new Map(
        (await tx.query('SELECT id, key, content_hash, archived_at FROM lessons WHERE universe_id = $1', [uid])).rows.map((r) => [r.key, r])
      );
      const lessonDbIds = new Map(); // lesson.id (fichier) -> id DB
      const desiredKeys = new Set();
      for (const { data: l } of u.lessons) {
        const key = `${u.slug}/${l.slug}`;
        desiredKeys.add(key);
        const { items: _items, ...rest } = l;
        const lhash = hashOf(rest);
        const lrow = [l.slug, l.titre, l.recap || '', l.micro_cours || '', l.position, l.xp || 20, 'published', lhash];
        const ex = existingLessons.get(key);
        if (!ex) {
          const ins = await write(
            `INSERT INTO lessons (universe_id, key, slug, title, summary, body_md, position, xp_reward, status, content_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [uid, key, ...lrow]
          );
          lessonDbIds.set(l.id, ins.rows[0].id);
          report.lessons.created++;
        } else {
          lessonDbIds.set(l.id, ex.id);
          if (ex.content_hash !== lhash || ex.archived_at) {
            await write(
              `UPDATE lessons SET slug = $2, title = $3, summary = $4, body_md = $5, position = $6, xp_reward = $7, status = $8, content_hash = $9, archived_at = NULL WHERE id = $1`,
              [ex.id, ...lrow]
            );
            report.lessons.updated++;
          } else report.lessons.unchanged++;
        }
      }
      for (const [key, ex] of existingLessons) {
        if (!desiredKeys.has(key) && !ex.archived_at) {
          await write('UPDATE lessons SET archived_at = now() WHERE id = $1', [ex.id]);
          report.lessons.archived++;
        }
      }

      // ---- items
      const existingItems = new Map(
        (
          await tx.query(
            `SELECT i.id, i.key, i.content_hash, i.archived_at FROM items i JOIN lessons l ON l.id = i.lesson_id WHERE l.universe_id = $1`,
            [uid]
          )
        ).rows.map((r) => [r.key, r])
      );
      const desiredItems = new Set();
      for (const { data: l } of u.lessons) {
        const lessonDbId = lessonDbIds.get(l.id);
        const lessonKey = `${u.slug}/${l.slug}`;
        for (let i = 0; i < l.items.length; i++) {
          const item = l.items[i];
          const key = `${lessonKey}/${item.id.split('.').pop()}`;
          desiredItems.add(key);
          const isBoss = /^\s*boss\b/i.test(item.consigne) || /^\s*boss\b/i.test(item.enonce);
          const ihash = hashOf({ item, lessonKey, position: i + 1, isBoss });
          const params = [lessonDbId, TYPE_TO_KIND[item.type], item.difficulte, i + 1, isBoss, JSON.stringify(item), [item.competence], ihash];
          const ex = existingItems.get(key);
          if (!ex) {
            await write(
              `INSERT INTO items (lesson_id, key, kind, difficulty, position, is_boss, payload, tags, content_hash)
               VALUES ($1, $9, $2, $3, $4, $5, $6, $7, $8)`,
              [...params, key]
            );
            report.items.created++;
          } else if (ex.content_hash !== ihash || ex.archived_at) {
            await write(
              `UPDATE items SET lesson_id = $1, kind = $2, difficulty = $3, position = $4, is_boss = $5, payload = $6, tags = $7, content_hash = $8, archived_at = NULL WHERE id = $9`,
              [...params, ex.id]
            );
            report.items.updated++;
          } else report.items.unchanged++;
        }
      }
      for (const [key, ex] of existingItems) {
        if (!desiredItems.has(key) && !ex.archived_at) {
          await write('UPDATE items SET archived_at = now() WHERE id = $1', [ex.id]);
          report.items.archived++;
        }
      }

      // ---- prérequis (liens seulement : ni leçon ni progression n'est supprimée)
      const desiredPairs = new Set();
      for (const { data: l } of u.lessons) {
        for (const p of l.prerequis || []) desiredPairs.add(`${lessonDbIds.get(l.id)}:${lessonDbIds.get(p)}`);
      }
      const existingPairs = (
        await tx.query(
          `SELECT lp.lesson_id, lp.requires_lesson_id FROM lesson_prereqs lp JOIN lessons l ON l.id = lp.lesson_id WHERE l.universe_id = $1`,
          [uid]
        )
      ).rows.map((r) => `${r.lesson_id}:${r.requires_lesson_id}`);
      for (const pair of desiredPairs) {
        if (!existingPairs.includes(pair)) {
          const [a, b] = pair.split(':').map(Number);
          await write('INSERT INTO lesson_prereqs (lesson_id, requires_lesson_id) VALUES ($1, $2)', [a, b]);
          report.prerequisites.added++;
        }
      }
      for (const pair of existingPairs) {
        if (!desiredPairs.has(pair)) {
          const [a, b] = pair.split(':').map(Number);
          await write('DELETE FROM lesson_prereqs WHERE lesson_id = $1 AND requires_lesson_id = $2', [a, b]);
          report.prerequisites.removed++;
        }
      }
    }

    // ---- quêtes
    if (content.quests) {
      const existing = new Map((await tx.query('SELECT slug, period, metric, target, xp_reward, universe_id, active FROM quest_defs')).rows.map((r) => [r.slug, r]));
      for (const q of content.quests.quetes) {
        const universeId = q.univers ? universeIds.get(q.univers) ?? (await tx.query('SELECT id FROM universes WHERE slug = $1', [q.univers])).rows[0]?.id ?? null : null;
        const active = q.actif !== false;
        const ex = existing.get(q.slug);
        if (!ex) {
          await write(
            'INSERT INTO quest_defs (slug, period, metric, target, xp_reward, universe_id, active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [q.slug, q.periode, q.metrique, q.cible, q.xp, universeId, active]
          );
          report.quests.created++;
        } else if (ex.period !== q.periode || ex.metric !== q.metrique || ex.target !== q.cible || ex.xp_reward !== q.xp || (ex.universe_id ?? null) !== universeId || ex.active !== active) {
          await write(
            'UPDATE quest_defs SET period = $2, metric = $3, target = $4, xp_reward = $5, universe_id = $6, active = $7 WHERE slug = $1',
            [q.slug, q.periode, q.metrique, q.cible, q.xp, universeId, active]
          );
          report.quests.updated++;
        } else report.quests.unchanged++;
      }
    }

    // ---- badges
    if (content.badges) {
      const existing = new Map((await tx.query('SELECT slug, title, description, criteria FROM badges')).rows.map((r) => [r.slug, r]));
      for (const b of content.badges.badges) {
        const ex = existing.get(b.slug);
        const desc = b.description || '';
        if (!ex) {
          await write('INSERT INTO badges (slug, title, description, criteria) VALUES ($1, $2, $3, $4)', [b.slug, b.titre, desc, JSON.stringify(b.criteres)]);
          report.badges.created++;
        } else if (ex.title !== b.titre || ex.description !== desc || stable(typeof ex.criteria === 'string' ? JSON.parse(ex.criteria) : ex.criteria) !== stable(b.criteres)) {
          await write('UPDATE badges SET title = $2, description = $3, criteria = $4 WHERE slug = $1', [b.slug, b.titre, desc, JSON.stringify(b.criteres)]);
          report.badges.updated++;
        } else report.badges.unchanged++;
      }
    }
  });

  return report;
}

/** Charge, valide (lève une Error listant les problèmes) puis synchronise. */
async function syncContentFromDir(db, dir) {
  const content = loadContent(dir);
  const errors = validateContent(content);
  if (errors.length) {
    const err = new Error(`Contenu invalide (${errors.length} erreur(s)) :\n${formatErrors(errors)}`);
    err.validationErrors = errors;
    throw err;
  }
  return syncContent(db, content);
}

module.exports = {
  TYPE_TO_KIND,
  STATUS_MAP,
  hashOf,
  resolveContentDir,
  loadContent,
  validateContent,
  formatErrors,
  syncContent,
  syncContentFromDir
};
