import { h, clear, announce } from '../dom.js';
import { mascot } from '../mascot.js';
import { meter, statBox, dailyGoalBlock, button } from '../ui.js';

// Écran de fin de session : XP gagnée, précision, série, niveau, et une vraie sortie (« Terminer pour aujourd’hui »).
export function renderSummary(shell, sum, ctx) {
    clear(shell);
    document.title = 'Bilan – MakeMeLearn';
    const pct = Math.round(sum.accuracy * 100);
    const bossLost = sum.bossDefeated === false;
    const title = bossLost ? 'Le boss résiste… pour l’instant'
        : sum.mode === 'review' ? 'Révision terminée'
            : sum.mode === 'challenge' ? 'Défi terminé'
                : sum.perfect ? 'Dossier parfait !' : 'Enquête terminée !';
    const mood = bossLost ? 'think' : 'cheer';

    const lines = [];
    if (sum.bossDefeated === true) lines.push(h('p', { class: 'callout good' }, 'Boss vaincu : bien joué, ton esprit critique est en pleine forme.'));
    if (bossLost) lines.push(h('p', { class: 'callout' }, 'Pas de souci : tu peux retenter tout de suite, gratuitement. La correction est dans les explications que tu viens de lire.'));
    if (sum.levelUp) lines.push(h('p', { class: 'callout good' }, `Niveau ${sum.level.level} atteint !`));
    if (sum.streak.doneToday) lines.push(h('p', { class: 'callout good' }, sum.streak.current > 1 ? `Série validée : ${sum.streak.current} jours de suite.` : 'Ta journée est validée : ta série est lancée.'));
    if (sum.dailyGoal.met) lines.push(h('p', { class: 'callout' }, 'Objectif du jour atteint. Tu peux t’arrêter là, ou continuer si tu en as envie.'));

    const actions = [];
    if (sum.lessonCompleted && sum.next) {
        actions.push(button(`Leçon suivante : ${sum.next.title}`, { large: true, id: 'next-lesson', onClick: () => ctx.goNext(sum.next.key) }));
    } else if (bossLost || (sum.mode === 'lesson' && !sum.lessonCompleted)) {
        actions.push(button('Retenter la leçon', { large: true, id: 'again-btn', onClick: () => ctx.again() }));
    }
    if (sum.lessonCompleted || sum.mode !== 'lesson') actions.push(button('Rejouer', { variant: 'ghost', id: 'replay-btn', onClick: () => ctx.again() }));
    actions.push(button('Retour à la carte', { variant: 'ghost', id: 'map-btn', onClick: () => ctx.goMap() }));
    actions.push(button('Terminer pour aujourd’hui', { variant: 'ghost', id: 'done-btn', onClick: () => ctx.goHome() }));

    shell.appendChild(h('section', { class: 'summary stack-lg screen' },
        h('div', {}, mascot(mood, 'lg'),
            h('h1', {}, title),
            ctx.lessonTitle ? h('p', { class: 'muted' }, ctx.lessonTitle) : null),
        h('div', {},
            h('div', { class: 'xp-big', 'aria-label': `${sum.xp.total} points d’expérience gagnés` }, `+${sum.xp.total} XP`),
            h('p', { class: 'muted' }, sum.xp.bonus > 0 ? `${sum.xp.answers} XP de réponses + ${sum.xp.bonus} XP de bonus de mission` : `${sum.xp.answers} XP de réponses`)),
        h('div', { class: 'grid' },
            statBox('check', `${pct} %`, `${sum.correct} / ${sum.total} justes`),
            statBox('flame', sum.streak.current, sum.streak.current > 1 ? 'jours de suite' : 'jour de série'),
            statBox('trophy', sum.level.level, 'niveau')),
        h('div', { class: 'card flat' },
            h('div', { class: 'meter-label' }, h('span', {}, `Niveau ${sum.level.level}`), h('span', {}, `${sum.level.xpToNext} XP avant le niveau ${sum.level.level + 1}`)),
            meter(sum.level.xpIntoLevel, sum.level.nextLevelXp - sum.level.floorXp, { label: 'Progression du niveau' }),
            h('div', { class: 'stack' }, dailyGoalBlock({ dailyGoal: sum.dailyGoal }))),
        ...lines,
        h('div', { class: 'actions' }, ...actions)));
    announce(`${title} Tu gagnes ${sum.xp.total} XP, ${pct} pour cent de réussite.`);
}
