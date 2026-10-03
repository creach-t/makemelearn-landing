'use strict';

const { baseXp, answerXp, missionBonus, levelThreshold, levelFor, leaderboardCredit, DAILY_CAP, STREAK_XP } = require('../src/lib/xp');
const { recordGoalMet, effectiveStreak, emptyState } = require('../src/lib/streak');
const { localDay, addDays, diffDays, mondayOf, nextMonday, weekStartUtc } = require('../src/lib/dates');

describe('formules XP (game-design.md 4.1)', () => {
  test('base = 5 + 2 x difficulté (7 à 15)', () => {
    expect([1, 2, 3, 4, 5].map(baseXp)).toEqual([7, 9, 11, 13, 15]);
  });

  test('pondération : qualité, indice, première fois, faux = 0', () => {
    expect(answerXp({ difficulty: 3, correct: true, firstTime: true }).amount).toBe(Math.round(11 * 1.5)); // 17
    expect(answerXp({ difficulty: 3, correct: true, firstTime: false }).amount).toBe(11);
    expect(answerXp({ difficulty: 3, correct: true, hintUsed: true, firstTime: false }).amount).toBe(Math.round(11 * 0.6)); // 7
    expect(answerXp({ difficulty: 3, correct: true, retried: true, firstTime: false }).amount).toBe(7);
    expect(answerXp({ difficulty: 5, correct: false }).amount).toBe(0);
    expect(answerXp({ difficulty: 1, correct: true, firstTime: true, kind: 'flashcard' }).amount).toBe(Math.round(7 * 1.5 * 0.5)); // auto-évaluée : x0.5
  });

  test('bonus de mission = XP de la leçon + 5 x floor(précision x 10)', () => {
    expect(missionBonus(1)).toBe(70);
    expect(missionBonus(0.75)).toBe(55);
    expect(missionBonus(0)).toBe(20);
    expect(missionBonus(1, 30)).toBe(80);
  });

  test('niveau : seuil cumulé round(100 x n^1.5)', () => {
    expect([1, 2, 5, 10, 50].map(levelThreshold)).toEqual([100, 283, 1118, 3162, 35355]);
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(282).level).toBe(1);
    expect(levelFor(283).level).toBe(2);
    expect(levelFor(1117).level).toBe(4);
    expect(levelFor(1118).level).toBe(5);
    expect(levelFor(600)).toMatchObject({ level: 3, floorXp: 520, nextLevelXp: 800, xpIntoLevel: 80, xpToNext: 200 });
  });

  test('plafond anti-grind : le classement n’est crédité que jusqu’à 600 XP / jour', () => {
    expect(DAILY_CAP).toBe(600);
    expect(leaderboardCredit(0, 50)).toBe(50);
    expect(leaderboardCredit(580, 50)).toBe(20);
    expect(leaderboardCredit(600, 50)).toBe(0);
    expect(leaderboardCredit(900, 50)).toBe(0);
  });
});

describe('jours locaux', () => {
  test('localDay suit le fuseau de l’utilisateur', () => {
    const t = new Date('2026-10-03T23:30:00Z');
    expect(localDay(t, 'Europe/Paris')).toBe('2026-10-04'); // 01:30 à Paris
    expect(localDay(t, 'UTC')).toBe('2026-10-03');
    expect(localDay(t, 'America/Los_Angeles')).toBe('2026-10-03');
    expect(localDay(t, 'Pacific/Auckland')).toBe('2026-10-04');
    expect(localDay(t, 'Fuseau/Inconnu')).toBe('2026-10-04'); // repli Europe/Paris
  });

  test('minuit local : 21:59:59Z et 22:00:00Z (Paris, UTC+2 en octobre)', () => {
    expect(localDay(new Date('2026-10-03T21:59:59Z'), 'Europe/Paris')).toBe('2026-10-03');
    expect(localDay(new Date('2026-10-03T22:00:00Z'), 'Europe/Paris')).toBe('2026-10-04');
  });

  test('arithmétique de dates et semaines (lundi)', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(diffDays('2026-10-01', '2026-10-04')).toBe(3);
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // dimanche
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(nextMonday('2026-10-05')).toBe('2026-10-12');
    expect(weekStartUtc(new Date('2026-10-04T23:59:59Z'))).toBe('2026-09-28');
    expect(weekStartUtc(new Date('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
  });
});

describe('streak (30 XP / jour, 1 gel gratuit par semaine)', () => {
  test('seuil de validation = 30 XP', () => expect(STREAK_XP).toBe(30));

  test('premier jour puis jours consécutifs ; même jour = sans effet', () => {
    let r = recordGoalMet(emptyState(), '2026-10-01');
    expect(r.state.current).toBe(1);
    expect(r.extended).toBe(true);
    expect(recordGoalMet(r.state, '2026-10-01').extended).toBe(false);
    r = recordGoalMet(r.state, '2026-10-02');
    r = recordGoalMet(r.state, '2026-10-03');
    expect(r.state).toMatchObject({ current: 3, longest: 3, lastActiveDay: '2026-10-03' });
  });

  test('un jour manqué est comblé par le gel gratuit, qui se reconstitue le lundi suivant', () => {
    let s = recordGoalMet(emptyState(), '2026-10-01').state; // jeudi
    const r = recordGoalMet(s, '2026-10-03'); // samedi : vendredi manqué
    expect(r.usedFreeze).toBe(true);
    expect(r.state).toMatchObject({ current: 2, freezes: 0, refillOn: '2026-10-05', frozenDays: ['2026-10-02'] });
    s = recordGoalMet(r.state, '2026-10-04').state; // dimanche
    expect(s.freezes).toBe(0);
    s = recordGoalMet(s, '2026-10-05').state; // lundi : le gel est de retour
    expect(s).toMatchObject({ freezes: 1, refillOn: null, current: 4 });
  });

  test('deux jours manqués, ou un jour manqué sans gel, remettent la série à 1 (record conservé)', () => {
    const hard = recordGoalMet(recordGoalMet(emptyState(), '2026-10-01').state, '2026-10-04'); // 2 jours manqués
    expect(hard.state).toMatchObject({ current: 1, longest: 1 });
    const long = recordGoalMet({ ...emptyState(), current: 9, longest: 9, lastActiveDay: '2026-10-01' }, '2026-10-06');
    expect(long.state).toMatchObject({ current: 1, longest: 9 });
    // gel déjà consommé cette semaine (recharge le lundi 12) : un jour manqué le 09 casse la série
    const noFreeze = { current: 3, longest: 3, lastActiveDay: '2026-10-07', freezes: 0, refillOn: '2026-10-12', frozenDays: [] };
    const broken = recordGoalMet(noFreeze, '2026-10-09');
    expect(broken.usedFreeze).toBe(false);
    expect(broken.state.current).toBe(1);
  });

  test('effectiveStreak : vivante hier, comblée par le gel avant-hier, cassée au-delà', () => {
    const s = { current: 5, longest: 8, lastActiveDay: '2026-10-03', freezes: 1, refillOn: null, frozenDays: [] };
    expect(effectiveStreak(s, '2026-10-03')).toMatchObject({ current: 5, doneToday: true });
    expect(effectiveStreak(s, '2026-10-04')).toMatchObject({ current: 5, doneToday: false, freezeWillApply: false });
    expect(effectiveStreak(s, '2026-10-05')).toMatchObject({ current: 5, freezeWillApply: true });
    expect(effectiveStreak({ ...s, freezes: 0 }, '2026-10-05').current).toBe(0);
    expect(effectiveStreak(s, '2026-10-06')).toMatchObject({ current: 0, longest: 8 });
    expect(effectiveStreak(emptyState(), '2026-10-06').current).toBe(0);
  });

  test('changement de fuseau : un jour local « en arrière » ne détruit rien', () => {
    const s = { ...emptyState(), current: 4, longest: 4, lastActiveDay: '2026-10-05' };
    const r = recordGoalMet(s, '2026-10-04');
    expect(r.extended).toBe(false);
    expect(r.state.current).toBe(4);
  });
});
