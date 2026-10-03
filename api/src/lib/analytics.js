'use strict';

const logger = require('../utils/logger');

// Liste blanche identique à la contrainte CHECK de analytics_events.name
const EVENTS = new Set([
  'guest_created', 'account_upgraded', 'session_started', 'session_finished', 'review_started',
  'lesson_completed', 'streak_extended', 'quest_completed', 'share_clicked'
]);

/** Événement analytique interne (aucun tiers). Ne fait jamais échouer la requête. Aucune donnée personnelle dans props. */
async function track(runner, userId, name, props = {}) {
  if (!EVENTS.has(name)) throw new Error(`Événement analytique non autorisé : ${name}`);
  try {
    await runner.query('INSERT INTO analytics_events (user_id, name, props) VALUES ($1, $2, $3)', [userId, name, JSON.stringify(props)]);
  } catch (err) {
    logger.warn('analytics_events : écriture échouée', { name, error: err.message });
  }
}

module.exports = { track, EVENTS };
