'use strict';

const express = require('express');

const { safe } = require('../../lib/safe');
const { snapshot } = require('../../lib/ledger');

/** GET /progress : XP, niveau, objectif du jour, streak, dernière activité. */
function createProgressRouter({ db, auth }) {
  const router = express.Router();
  router.use(auth.requireUser);

  router.get('/', safe(async (req, res) => {
    const snap = await snapshot(db, req.user);
    const universes = await db.query(
      `SELECT u.slug, uu.xp_total, uu.last_played_at FROM user_universes uu JOIN universes u ON u.id = uu.universe_id WHERE uu.user_id = $1 ORDER BY uu.last_played_at DESC`,
      [req.user.id]
    );
    const lessons = await db.query(`SELECT count(*) AS n FROM lesson_progress WHERE user_id = $1 AND status IN ('completed', 'mastered')`, [req.user.id]);
    res.json({
      ...snap,
      lessonsCompleted: Number(lessons.rows[0].n),
      universes: universes.rows.map((r) => ({ slug: r.slug, xp: Number(r.xp_total), lastPlayedAt: new Date(r.last_played_at).toISOString() }))
    });
  }));

  return router;
}

module.exports = { createProgressRouter };
