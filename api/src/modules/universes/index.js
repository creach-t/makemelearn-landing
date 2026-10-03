'use strict';

const express = require('express');

const { safe } = require('../../lib/safe');
const { statusClause, toUniverse, findUniverse, lessonMap } = require('../../lib/catalog');

const publicLesson = ({ id, ...rest }) => rest; // l'id interne reste côté serveur : l'API parle en `key`

/** État d'une compétence = synthèse de l'état des leçons qui la travaillent. */
function skillStates(skills, lessons) {
  return skills.map((s) => {
    const ls = lessons.filter((l) => l.competences.includes(s.id));
    let state = 'unlocked';
    if (ls.length > 0) {
      if (ls.every((l) => l.state === 'completed')) state = 'completed';
      else if (ls.every((l) => l.state === 'locked')) state = 'locked';
    }
    return { ...s, lessons: ls.map((l) => l.key), state };
  });
}

/**
 * GET /universes        : liste (univers publiés ; + brouillons marqués beta si SHOW_DRAFT_UNIVERSES)
 * GET /universes/:slug  : carte (chapitres, leçons verrouillées / débloquées / terminées, compétences)
 * Lecture publique : sans utilisateur, la progression est simplement vide.
 */
function createUniversesRouter({ db, env }) {
  const router = express.Router();

  router.get('/', safe(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, slug, title, tagline, description, status, theme, meta FROM universes WHERE ${statusClause(env)} ORDER BY sort_order, title`
    );
    const universes = [];
    for (const row of rows) {
      const lessons = await lessonMap(db, row.id, req.user && req.user.id);
      const u = toUniverse(row);
      universes.push({
        slug: u.slug,
        title: u.title,
        tagline: u.tagline,
        description: u.description,
        beta: u.beta,
        theme: u.theme,
        mascot: u.mascot,
        lessonCount: lessons.length,
        completedCount: lessons.filter((l) => l.state === 'completed').length,
        nextLessonKey: (lessons.find((l) => l.state === 'unlocked') || {}).key || null
      });
    }
    res.json({ universes });
  }));

  router.get('/:slug', safe(async (req, res) => {
    const row = await findUniverse(db, env, req.params.slug);
    const lessons = await lessonMap(db, row.id, req.user && req.user.id);
    const u = toUniverse(row);
    let xp = 0;
    if (req.user) {
      const r = await db.query('SELECT xp_total FROM user_universes WHERE user_id = $1 AND universe_id = $2', [req.user.id, row.id]);
      xp = r.rows.length ? Number(r.rows[0].xp_total) : 0;
    }
    const chapters = u.chapters.map((c) => ({ ...c, lessons: lessons.filter((l) => l.chapter === c.id).map(publicLesson) }));
    res.json({
      universe: { ...u, skills: undefined, chapters: undefined },
      chapters,
      skills: skillStates(u.skills, lessons),
      progress: {
        xp,
        lessonsCompleted: lessons.filter((l) => l.state === 'completed').length,
        lessonsTotal: lessons.length,
        nextLessonKey: (lessons.find((l) => l.state === 'unlocked') || {}).key || null
      }
    });
  }));

  return router;
}

module.exports = { createUniversesRouter, skillStates };
