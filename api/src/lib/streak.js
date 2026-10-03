'use strict';

const { addDays, diffDays, nextMonday } = require('./dates');

// Streak : un jour est « validé » quand l'XP du jour LOCAL atteint 30 (STREAK_XP).
// 1 gel gratuit par semaine : un seul jour manqué est comblé automatiquement par le gel ;
// il se reconstitue le lundi suivant (local). Deux jours manqués d'affilée remettent la série à 1 (aucune XP perdue).
// État : { current, longest, lastActiveDay, freezes, refillOn, frozenDays } — fonctions pures.

const MAX_FREEZES = 1;

const emptyState = () => ({ current: 0, longest: 0, lastActiveDay: null, freezes: MAX_FREEZES, refillOn: null, frozenDays: [] });

/** Reconstitue le gel hebdomadaire si la date de recharge est passée. */
function refill(s, today) {
  if (s.freezes < MAX_FREEZES && s.refillOn && today >= s.refillOn) return { ...s, freezes: MAX_FREEZES, refillOn: null };
  return s;
}

/** Enregistre « objectif de streak atteint aujourd'hui ». Retourne { state, extended, usedFreeze }. */
function recordGoalMet(state, today) {
  let s = refill({ ...emptyState(), ...state, frozenDays: [...(state.frozenDays || [])] }, today);
  if (s.lastActiveDay === today) return { state: s, extended: false, usedFreeze: false };
  let usedFreeze = false;
  let current;
  if (!s.lastActiveDay) current = 1;
  else {
    const gap = diffDays(s.lastActiveDay, today);
    if (gap <= 0) return { state: s, extended: false, usedFreeze: false }; // horloge/fuseau en retard : on ne touche à rien
    if (gap === 1) current = s.current + 1;
    else if (gap === 2 && s.freezes > 0) {
      usedFreeze = true;
      current = s.current + 1;
      s = { ...s, freezes: s.freezes - 1, refillOn: nextMonday(today), frozenDays: [...s.frozenDays, addDays(today, -1)].slice(-30) };
    } else current = 1;
  }
  const next = { ...s, current, longest: Math.max(s.longest, current), lastActiveDay: today };
  return { state: next, extended: true, usedFreeze };
}

/** Vue en lecture (sans écriture) : la série affichée aujourd'hui. */
function effectiveStreak(state, today) {
  const s = refill({ ...emptyState(), ...state }, today);
  const doneToday = s.lastActiveDay === today;
  let current = 0;
  let freezeWillApply = false;
  if (s.lastActiveDay) {
    const gap = diffDays(s.lastActiveDay, today);
    if (gap <= 1) current = s.current;
    else if (gap === 2 && s.freezes > 0) { current = s.current; freezeWillApply = true; }
  }
  return { current, longest: Math.max(s.longest, current), doneToday, freezesAvailable: s.freezes, freezeWillApply, nextFreezeOn: s.freezes < MAX_FREEZES ? s.refillOn : null, lastActiveDay: s.lastActiveDay };
}

module.exports = { MAX_FREEZES, emptyState, refill, recordGoalMet, effectiveStreak };
