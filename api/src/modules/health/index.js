'use strict';

const express = require('express');
const { safe } = require('../../lib/safe');

// /healthz : liveness, SANS base de données (un Postgres qui redémarre ne doit pas tuer l'API).
// /readyz  : readiness, avec base de données.
function createHealthRouter({ db }) {
  const router = express.Router();

  router.get('/healthz', (req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
  });

  router.get('/readyz', safe(async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ready' });
    } catch (e) {
      res.status(503).json({ status: 'not_ready' });
    }
  }));

  return router;
}

module.exports = { createHealthRouter };
