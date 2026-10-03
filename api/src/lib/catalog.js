'use strict';

/**
 * Lecture du catalogue (universes, lessons, items) : visibilité, carte de leçons avec verrouillage par prérequis.
 * Les solutions ne sortent jamais d'ici : seules des métadonnées sont exposées (voir grading.publicItem pour les items).
 */

const { HttpError } = require('./errors');

const parseJson = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return fallback; } }
  return v;
};

/** Statuts d'univers visibles : published ; + draft si SHOW_DRAFT_UNIVERSES (marqués beta:true). */
const visibleStatuses = (env) => (env.SHOW_DRAFT_UNIVERSES ? ['published', 'draft'] : ['published']);
const statusClause = (env) => `status IN (${visibleStatuses(env).map((s) => `'${s}'`).join(', ')})`;

function toUniverse(row) {
  const meta = parseJson(row.meta, {});
  const theme = parseJson(row.theme, {});
  const characters = meta.characters || [];
  const mascot = characters.find((c) => c.role === 'sidekick') || characters[0] || null;
  return {
    slug: row.slug,
    title: row.title,
    tagline: row.tagline,
    description: row.description,
    beta: row.status === 'draft',
    theme: { color: theme.color || null, icon: theme.icon || null },
    lore: meta.lore || {},
    characters,
    mascot,
    chapters: meta.chapters || [],
    skills: meta.skills || [],
    license: meta.license || null
  };
}

async function findUniverse(db, env, slug) {
  const { rows } = await db.query(`SELECT id, slug, title, tagline, description, status, theme, meta FROM universes WHERE slug = $1 AND ${statusClause(env)}`, [slug]);
  if (rows.length === 0) throw new HttpError(404, 'UNIVERSE_NOT_FOUND', 'Univers introuvable');
  return rows[0];
}

/**
 * Leçons d'un univers avec leur état pour `userId` (ou aucun utilisateur) :
 *   completed  = leçon terminée ; unlocked = tous les prérequis terminés ; locked sinon.
 */
async function lessonMap(db, universeId, userId) {
  const [lessons, counts, prereqs, progress] = await Promise.all([
    db.query(
      `SELECT id, key, slug, title, summary, position, xp_reward, meta FROM lessons
        WHERE universe_id = $1 AND archived_at IS NULL AND status = 'published' ORDER BY position`,
      [universeId]
    ),
    db.query(
      `SELECT i.lesson_id, i.is_boss, count(*) AS n FROM items i JOIN lessons l ON l.id = i.lesson_id
        WHERE l.universe_id = $1 AND i.archived_at IS NULL AND i.kind <> 'code' GROUP BY i.lesson_id, i.is_boss`,
      [universeId]
    ),
    db.query(
      `SELECT lp.lesson_id, lp.requires_lesson_id FROM lesson_prereqs lp JOIN lessons l ON l.id = lp.lesson_id WHERE l.universe_id = $1`,
      [universeId]
    ),
    userId
      ? db.query('SELECT lesson_id, status, best_score, runs FROM lesson_progress WHERE user_id = $1', [userId])
      : Promise.resolve({ rows: [] })
  ]);

  const byId = new Map(lessons.rows.map((l) => [l.id, l]));
  const itemCount = new Map();
  const hasBoss = new Set();
  for (const c of counts.rows) {
    itemCount.set(c.lesson_id, (itemCount.get(c.lesson_id) || 0) + Number(c.n));
    if (c.is_boss) hasBoss.add(c.lesson_id);
  }
  const reqs = new Map();
  for (const p of prereqs.rows) {
    if (!reqs.has(p.lesson_id)) reqs.set(p.lesson_id, []);
    reqs.get(p.lesson_id).push(p.requires_lesson_id);
  }
  const prog = new Map(progress.rows.map((p) => [p.lesson_id, p]));
  const done = (id) => {
    const p = prog.get(id);
    return Boolean(p && (p.status === 'completed' || p.status === 'mastered'));
  };

  return lessons.rows.map((l) => {
    const meta = parseJson(l.meta, {});
    const p = prog.get(l.id);
    const requires = (reqs.get(l.id) || []).filter((id) => byId.has(id));
    let state = 'locked';
    if (done(l.id)) state = 'completed';
    else if (requires.every(done)) state = 'unlocked';
    return {
      id: l.id,
      key: l.key,
      slug: l.slug,
      title: l.title,
      summary: l.summary,
      position: l.position,
      chapter: meta.chapter || null,
      competences: meta.competences || [],
      durationMin: meta.durationMin || null,
      xpReward: l.xp_reward,
      itemCount: itemCount.get(l.id) || 0,
      hasBoss: hasBoss.has(l.id),
      requires: requires.map((id) => byId.get(id).key),
      state,
      bestScore: p ? Number(p.best_score) : 0,
      runs: p ? Number(p.runs) : 0,
      mastered: Boolean(p && p.status === 'mastered')
    };
  });
}

module.exports = { parseJson, visibleStatuses, statusClause, toUniverse, findUniverse, lessonMap };
