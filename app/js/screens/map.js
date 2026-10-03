import { h } from '../dom.js';
import { api } from '../api.js';
import { mascot } from '../mascot.js';
import { topbar, footerLegal, icon, button, meter } from '../ui.js';

const lessonHash = (key) => `#/jouer/${key.split('/').map(encodeURIComponent).join('/')}`;
const STATE_LABEL = { locked: 'Verrouillée', unlocked: 'Disponible', completed: 'Terminée' };

function lessonCard(lesson, byKey) {
    const meta = [
        `${lesson.itemCount} exercices`,
        lesson.durationMin ? `environ ${lesson.durationMin} min` : null,
        `+${lesson.xpReward} XP`
    ].filter(Boolean).join(' · ');
    const nodeIcon = lesson.state === 'completed' ? 'check' : lesson.state === 'locked' ? 'lock' : 'play';
    const body = [
        h('span', { class: 'node' }, icon(nodeIcon)),
        h('span', {},
            h('span', { class: 'sr-only' }, `${STATE_LABEL[lesson.state]} : `),
            h('span', { class: 'title' }, lesson.title),
            h('br'),
            h('span', { class: 'meta' }, meta),
            lesson.hasBoss ? h('span', { class: 'meta' }, ' · ', h('span', { class: 'tag-boss' }, 'Épreuve de boss')) : null,
            lesson.state === 'completed' ? h('span', { class: 'meta' }, ` · meilleur score ${Math.round(lesson.bestScore)} %`) : null,
            lesson.state === 'locked'
                ? h('span', { class: 'lock-note' }, h('br'), `Termine d’abord « ${(byKey.get(lesson.requires[0]) || {}).title || 'la leçon précédente'} » pour débloquer.`)
                : null)
    ];
    if (lesson.state === 'locked') return h('li', {}, h('div', { class: 'lesson locked', 'aria-disabled': 'true' }, ...body));
    return h('li', {}, h('a', { class: `lesson ${lesson.state}`, href: lessonHash(lesson.key) }, ...body));
}

export async function show({ root, params, isCurrent }) {
    const data = await api.universe(params.slug);
    if (!isCurrent()) return;
    const { universe, chapters, skills, progress } = data;
    document.title = `${universe.title} – carte des leçons`;
    if (universe.theme && universe.theme.color) document.documentElement.style.setProperty('--accent', universe.theme.color);

    const byKey = new Map(chapters.flatMap((c) => c.lessons).map((l) => [l.key, l]));
    const main = h('main', { class: 'shell screen' }, topbar('home'));

    main.appendChild(h('section', { class: 'stack' },
        h('div', { class: 'universe-head' },
            mascot('idle'),
            h('div', {},
                h('h1', {}, universe.title),
                universe.beta ? h('span', { class: 'badge' }, 'Bêta · contenu en relecture') : null)),
        h('p', { class: 'muted' }, universe.lore.monde || universe.description),
        h('div', {},
            h('div', { class: 'meter-label' }, h('span', {}, 'Progression du dossier'), h('span', {}, `${progress.lessonsCompleted} / ${progress.lessonsTotal} leçons`)),
            meter(progress.lessonsCompleted, progress.lessonsTotal, { label: 'Progression du dossier', done: progress.lessonsCompleted === progress.lessonsTotal && progress.lessonsTotal > 0 })),
        h('div', { class: 'row' },
            progress.nextLessonKey ? button(progress.lessonsCompleted > 0 ? 'Continuer' : 'Jouer', { href: lessonHash(progress.nextLessonKey), iconName: 'play', id: 'play-btn' }) : null,
            progress.lessonsCompleted > 0 ? button('Réviser mes ratés', { variant: 'ghost', href: `#/reviser/${universe.slug}` }) : null,
            progress.lessonsCompleted > 0 ? button('Défi des boss', { variant: 'ghost', href: `#/defi/${universe.slug}` }) : null)));

    for (const chapter of chapters) {
        main.appendChild(h('section', { class: 'chapter', 'aria-labelledby': `ch-${chapter.id}` },
            h('h2', { id: `ch-${chapter.id}` }, chapter.title),
            h('p', {}, chapter.summary),
            h('ul', { class: 'path' }, ...chapter.lessons.map((l) => lessonCard(l, byKey)))));
    }

    main.appendChild(h('details', { class: 'skills' },
        h('summary', {}, `Compétences (${skills.filter((s) => s.state === 'completed').length} / ${skills.length} acquises)`),
        h('ul', { class: 'chips' }, ...skills.map((s) => h('li', { class: `chip ${s.state}` }, s.state === 'completed' ? '✓ ' : '', s.name)))));

    main.appendChild(footerLegal());
    root.appendChild(main);
    return () => document.documentElement.style.removeProperty('--accent');
}
