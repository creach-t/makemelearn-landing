'use strict';

// Formules XP / niveau (dossier/research/game-design.md section 4). Fonctions pures, sans base de données.

const DAILY_CAP = 600; // XP « utile » par jour local : au-delà l'XP est comptée mais ne crédite plus le classement
const STREAK_XP = 30; // XP à atteindre dans la journée locale pour valider le jour de streak
const KIND_FACTOR = { flashcard: 0.5 }; // auto-évaluée : moins rémunératrice (anti-grind)

const baseXp = (difficulty) => 5 + 2 * Math.min(5, Math.max(1, difficulty));

/**
 * XP d'une réponse = base(difficulté) x qualité x première fois.
 *  - qualité : 1.0 correct sans indice, 0.6 avec indice (ou boss réussi après un échec), 0 si faux
 *  - première fois : x1.5 si l'utilisateur n'a encore jamais réussi cet item, sinon x1.0 (révision)
 * Pas de bonus de rapidité : récompenser la vitesse pousserait à répondre au hasard.
 */
function answerXp({ difficulty, correct, hintUsed = false, retried = false, firstTime = true, kind = null }) {
  const base = baseXp(difficulty);
  const quality = !correct ? 0 : hintUsed || retried ? 0.6 : 1;
  const first = firstTime ? 1.5 : 1;
  const factor = KIND_FACTOR[kind] || 1;
  return { base, quality, firstTime: first, amount: Math.round(base * quality * first * factor) };
}

/** Bonus de mission (leçon terminée) = XP de la leçon (20 par défaut) + 5 x floor(précision x 10). */
const missionBonus = (accuracy, lessonXp = 20) => lessonXp + 5 * Math.floor(Math.min(1, Math.max(0, accuracy)) * 10);

/** XP cumulée requise pour atteindre le niveau n : round(100 x n^1.5). */
const levelThreshold = (n) => Math.round(100 * Math.pow(n, 1.5));

/** Niveau = plus grand n >= 1 tel que levelThreshold(n) <= xp (niveau 1 dès le départ). */
function levelFor(xp) {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  while (levelThreshold(level + 1) <= total) level++;
  const floor = level === 1 ? 0 : levelThreshold(level); // le niveau 1 couvre [0, 283[
  const next = levelThreshold(level + 1);
  return { level, xp: total, floorXp: floor, nextLevelXp: next, xpIntoLevel: total - floor, xpToNext: next - total, progress: Math.min(1, (total - floor) / (next - floor)) };
}

/** Part d'une XP gagnée qui crédite encore le classement hebdomadaire (plafond quotidien). */
const leaderboardCredit = (dailyBefore, amount) => Math.max(0, Math.min(amount, DAILY_CAP - dailyBefore));

module.exports = { DAILY_CAP, STREAK_XP, baseXp, answerXp, missionBonus, levelThreshold, levelFor, leaderboardCredit };
