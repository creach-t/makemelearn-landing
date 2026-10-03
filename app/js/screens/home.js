import { h } from '../dom.js';
import { api } from '../api.js';
import { state, recall, remember } from '../store.js';
import { mascot } from '../mascot.js';
import { topbar, footerLegal, statsRow, dailyGoalBlock, button } from '../ui.js';

const lessonHash = (key) => `#/jouer/${key.split('/').map(encodeURIComponent).join('/')}`;

export async function show({ root, isCurrent }) {
    const [progress, listing] = await Promise.all([api.progress(), api.universes()]);
    if (!isCurrent()) return;
    state.progress = progress;
    state.universes = listing.universes;
    document.title = 'Le Bureau des Doutes – MakeMeLearn';

    const universes = listing.universes;
    const brandNew = progress.lessonsCompleted === 0 && progress.xp.total === 0;
    const main = h('main', { class: 'shell screen' }, topbar('home'));

    if (universes.length === 0) {
        main.appendChild(h('section', { class: 'card stack' },
            h('h1', {}, 'Le bureau ouvre bientôt'),
            h('p', { class: 'muted' }, 'Aucun univers n’est disponible pour le moment. Reviens très vite !')));
        main.appendChild(footerLegal());
        root.appendChild(main);
        return undefined;
    }

    const first = universes[0];
    const startKey = first.nextLessonKey;

    if (brandNew) {
        // Onboarding : une seule action possible, première leçon en moins de 60 secondes, sans inscription
        main.appendChild(h('section', { class: 'hero stack' },
            mascot('cheer', 'lg'),
            h('h1', {}, first.title),
            h('p', {}, first.tagline),
            h('ul', { class: 'promise', 'aria-label': 'Ce que tu dois savoir' },
                h('li', {}, 'Sans inscription'), h('li', {}, 'Environ 2 minutes'), h('li', {}, 'Gratuit, sans pub')),
            startKey ? button('Commencer l’enquête', { href: lessonHash(startKey), large: true, block: true, iconName: 'play', id: 'start-btn' }) : null,
            first.beta ? h('p', { class: 'notice' }, 'Version bêta : le contenu est encore en relecture. Dis-nous si quelque chose cloche !') : null,
            h('div', { class: 'bubble-row center-row' },
                mascot('idle', 'sm'),
                h('p', { class: 'bubble' }, h('span', { class: 'who' }, first.mascot ? first.mascot.name : 'Pie'), 'Salut, stagiaire ! L’Agence du Doute a un dossier pour toi. Pas besoin de compte : on commence ?'))));
        remember('seen', true);
    } else {
        main.appendChild(h('section', { class: 'stack' }, statsRow(progress), h('div', { class: 'card flat' }, dailyGoalBlock(progress))));
        for (const u of universes) {
            const done = u.completedCount >= u.lessonCount && u.lessonCount > 0;
            main.appendChild(h('section', { class: 'card universe-card', 'aria-labelledby': `u-${u.slug}` },
                h('div', { class: 'universe-head' },
                    mascot(done ? 'cheer' : 'idle'),
                    h('div', {},
                        h('h2', { id: `u-${u.slug}` }, u.title, ' ', u.beta ? h('span', { class: 'badge' }, 'Bêta') : null),
                        h('p', { class: 'muted' }, `${u.completedCount} / ${u.lessonCount} leçons terminées`))),
                h('p', { class: 'muted' }, u.tagline),
                u.beta ? h('p', { class: 'notice' }, 'Bêta : contenu en relecture avant publication.') : null,
                h('div', { class: 'row' },
                    u.nextLessonKey
                        ? button(progress.lessonsCompleted > 0 ? 'Continuer' : 'Jouer', { href: lessonHash(u.nextLessonKey), large: true, iconName: 'play', id: 'play-btn' })
                        : button('Rejouer une leçon', { href: `#/univers/${u.slug}`, large: true, id: 'play-btn' }),
                    button('Voir la carte', { variant: 'ghost', href: `#/univers/${u.slug}` }),
                    u.completedCount > 0 ? button('Réviser', { variant: 'ghost', href: `#/reviser/${u.slug}` }) : null)));
        }
        if (progress.dailyGoal.met) {
            main.appendChild(h('p', { class: 'callout good' }, 'Objectif du jour atteint. Tu peux t’arrêter là, ta série est validée : à demain, ou encore une enquête si l’envie te prend.'));
        }
        if (!recall('seen')) remember('seen', true);
    }

    main.appendChild(footerLegal());
    root.appendChild(main);
    return undefined;
}

