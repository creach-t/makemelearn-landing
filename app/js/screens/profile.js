import { h, announce } from '../dom.js';
import { api, ensureGuest } from '../api.js';
import { state, forgetAll } from '../store.js';
import { mascot } from '../mascot.js';
import { topbar, footerLegal, statsRow, dailyGoalBlock, meter, button } from '../ui.js';

const GOALS = [30, 50, 100];

function formatDate(day) {
    try {
        return new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch (_) { return day; }
}

export async function show({ root, isCurrent, go }) {
    const [progress, me] = await Promise.all([api.progress(), api.me()]);
    if (!isCurrent()) return undefined;
    state.progress = progress;
    document.title = 'Ton profil – MakeMeLearn';

    const lv = progress.level;
    const s = progress.streak;
    const status = h('p', { class: 'muted', role: 'status' });

    const goalSelect = h('select', {
        class: 'field', id: 'goal', 'aria-describedby': 'goal-help',
        onChange: async (e) => {
            status.textContent = '';
            try {
                await api.patchMe({ dailyGoalXp: Number(e.target.value) });
                status.textContent = 'Objectif enregistré.';
                announce('Objectif quotidien enregistré');
            } catch (err) { status.textContent = err.message; }
        }
    }, ...GOALS.map((g) => h('option', { value: String(g), selected: me.user.dailyGoalXp === g }, `${g} XP par jour${g === 30 ? ' (une leçon)' : ''}`)));
    if (!GOALS.includes(me.user.dailyGoalXp)) goalSelect.appendChild(h('option', { value: String(me.user.dailyGoalXp), selected: true }, `${me.user.dailyGoalXp} XP par jour`));

    const dialog = h('dialog', { 'aria-labelledby': 'del-title' },
        h('h2', { id: 'del-title' }, 'Supprimer ma progression ?'),
        h('p', { class: 'muted' }, 'Ton XP, ta série et tes leçons terminées seront effacés définitivement de nos serveurs. Tu pourras recommencer de zéro quand tu veux.'),
        h('div', { class: 'actions' },
            button('Oui, tout supprimer', { variant: 'danger', id: 'confirm-delete', onClick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                try {
                    await api.deleteMe();
                    forgetAll();
                    state.user = null;
                    state.progress = null;
                    state.user = await ensureGuest(true);
                    dialog.close();
                    announce('Progression supprimée');
                    go('#/');
                } catch (err) {
                    btn.disabled = false;
                    dialog.close();
                    status.textContent = err.message;
                }
            } }),
            button('Non, je garde tout', { variant: 'ghost', onClick: () => dialog.close() })));

    const main = h('main', { class: 'shell screen' }, topbar('profile'),
        h('section', { class: 'stack' },
            h('div', { class: 'universe-head' }, mascot('idle'), h('div', {}, h('h1', {}, 'Ton profil'), h('p', { class: 'muted' }, me.user.isAnonymous ? 'Joueur invité : aucune donnée personnelle.' : 'Compte enregistré'))),
            statsRow(progress),
            h('div', { class: 'card flat' },
                h('div', { class: 'meter-label' }, h('span', {}, `Niveau ${lv.level}`), h('span', {}, `${lv.xpToNext} XP avant le niveau ${lv.level + 1}`)),
                meter(lv.xpIntoLevel, lv.nextLevelXp - lv.floorXp, { label: `Progression vers le niveau ${lv.level + 1}` })),
            h('div', { class: 'card flat' }, dailyGoalBlock(progress))),
        h('section', { class: 'card stack', 'aria-labelledby': 'streak-title' },
            h('h2', { id: 'streak-title' }, 'Ta série'),
            h('dl', { class: 'kv' },
                h('dt', {}, 'Série en cours'), h('dd', {}, `${s.current} jour${s.current > 1 ? 's' : ''}`),
                h('dt', {}, 'Record'), h('dd', {}, `${s.longest} jour${s.longest > 1 ? 's' : ''}`),
                h('dt', {}, 'Leçons terminées'), h('dd', {}, String(progress.lessonsCompleted)),
                h('dt', {}, 'Gel gratuit'), h('dd', {}, s.freezesAvailable > 0 ? 'Disponible' : (s.nextFreezeOn ? `Revient le ${formatDate(s.nextFreezeOn)}` : 'Utilisé'))),
            h('p', { class: 'muted' }, `Une journée compte à partir de ${s.thresholdXp} XP. Si tu oublies un jour, un gel gratuit (1 par semaine) protège ta série automatiquement. Pas de pression : l’important, c’est ce que tu retiens.`)),
        h('section', { class: 'card stack', 'aria-labelledby': 'goal-title' },
            h('h2', { id: 'goal-title' }, 'Objectif du jour'),
            h('label', { for: 'goal', class: 'muted' }, 'Combien d’XP veux-tu viser chaque jour ?'),
            goalSelect,
            h('p', { id: 'goal-help', class: 'muted' }, 'Ça ne change que la barre d’objectif : ta série reste validée à 30 XP.'),
            status),
        h('section', { class: 'card stack', 'aria-labelledby': 'data-title' },
            h('h2', { id: 'data-title' }, 'Mes données'),
            h('p', { class: 'muted' }, 'Ta progression est liée à un cookie technique anonyme (pas de nom, pas d’e-mail, pas de suivi publicitaire). Tu peux tout effacer à tout moment.'),
            h('p', {}, button('Supprimer mon compte et ma progression', { variant: 'danger', id: 'delete-btn', onClick: () => dialog.showModal() })),
            h('p', { class: 'muted' }, h('a', { href: '../pages/privacy.html' }, 'Lire la politique de confidentialité'))),
        dialog,
        footerLegal());
    root.appendChild(main);
    return undefined;
}

