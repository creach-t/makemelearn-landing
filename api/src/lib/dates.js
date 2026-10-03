'use strict';

// Jours « locaux » : un jour = une date calendaire dans le fuseau de l'utilisateur (users.timezone).
// Toutes les dates manipulées ici sont des chaînes 'YYYY-MM-DD' (comparables lexicographiquement).

const DAY_MS = 24 * 60 * 60 * 1000;

function isValidTimezone(tz) {
  try { new Intl.DateTimeFormat('fr-FR', { timeZone: tz }); return true; } catch (_) { return false; }
}

/** Date calendaire locale de l'instant `date` dans le fuseau `tz` (repli Europe/Paris si le fuseau est inconnu). */
function localDay(date, tz) {
  const timeZone = isValidTimezone(tz) ? tz : 'Europe/Paris';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const toMs = (day) => Date.parse(`${day}T00:00:00Z`);
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);

const addDays = (day, n) => fromMs(toMs(day) + n * DAY_MS);
const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY_MS); // b - a

/** Lundi de la semaine contenant `day` (semaine ISO). */
function mondayOf(day) {
  const dow = new Date(toMs(day)).getUTCDay(); // 0 = dimanche
  return addDays(day, -((dow + 6) % 7));
}

/** Prochain lundi strictement après `day`. */
const nextMonday = (day) => addDays(mondayOf(day), 7);

/** Lundi (UTC) de la semaine de l'instant `date` : clé de leaderboard_weekly. */
const weekStartUtc = (date) => mondayOf(date.toISOString().slice(0, 10));

module.exports = { isValidTimezone, localDay, addDays, diffDays, mondayOf, nextMonday, weekStartUtc };
