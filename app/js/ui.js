import { h, svg, announce } from './dom.js';

// ---------- Icônes (SVG construits par le DOM) ----------
const ICONS = {
    flame: { d: 'M12 2c1.2 4.2-3.6 5.6-3.6 10a5.4 5.4 0 0 0 10.8 0c0-2.2-1-3.6-2.2-4.8 0 2.2-.8 3.4-2 3.8 1.2-3.4-.2-6.4-3-9z', fill: true },
    bolt: { d: 'M13 2 4 14h6l-1 8 10-13h-6z', fill: true },
    heart: { d: 'M12 21s-7.5-4.6-9.6-9.4A5.4 5.4 0 0 1 12 6.6a5.4 5.4 0 0 1 9.6 5C19.5 16.4 12 21 12 21z', fill: true },
    trophy: { d: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3' },
    check: { d: 'M5 13l4 4L19 7', stroke: 3 },
    close: { d: 'M6 6l12 12M18 6 6 18', stroke: 2.6 },
    lock: { d: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z' },
    play: { d: 'M8 5v14l11-7z', fill: true },
    up: { d: 'M6 15l6-6 6 6', stroke: 2.6 },
    down: { d: 'M6 9l6 6 6-6', stroke: 2.6 },
    user: { d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
    home: { d: 'M3 11l9-8 9 8M5 10v11h14V10' },
    shield: { d: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', fill: true },
    star: { d: 'M12 2l3 7 7 .6-5.3 4.7 1.7 7.2L12 17.8 5.6 21.5l1.7-7.2L2 9.6 9 9z', fill: true }
};

export function icon(name, extraClass = '') {
    const def = ICONS[name];
    return svg('svg', {
        class: `icon icon-${name} ${extraClass}`.trim(), viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
        fill: def.fill ? 'currentColor' : 'none', stroke: def.fill ? 'none' : 'currentColor',
        'stroke-width': def.stroke || 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }, svg('path', { d: def.d }));
}

// ---------- Mise en page ----------
export function topbar(active) {
    const link = (href, label, name, key) => h('a', { href, 'aria-current': active === key ? 'page' : null }, icon(name), h('span', {}, label));
    return h('header', { class: 'topbar' },
        h('a', { class: 'brand', href: '#/', 'aria-label': 'MakeMeLearn, accueil du jeu' }, 'MakeMeLearn'),
        h('nav', { class: 'nav', 'aria-label': 'Navigation du jeu' }, link('#/', 'Accueil', 'home', 'home'), link('#/profil', 'Profil', 'user', 'profile')));
}

export function footerLegal() {
    return h('footer', { class: 'legal' },
        h('p', {}, 'Gratuit, sans publicité, sans notification. Le jeu fonctionne sans compte et sans donnée personnelle.'),
        h('p', {}, h('a', { href: '../pages/privacy.html' }, 'Confidentialité'), ' · ', h('a', { href: '../index.html' }, 'Retour au site')));
}

export function meter(value, max, { label, done = false } = {}) {
    const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
    const bar = h('div', {
        class: `meter${done ? ' done' : ''}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max,
        'aria-valuenow': Math.min(value, max), 'aria-label': label || 'Progression'
    }, h('span', {}));
    // la largeur est posée après insertion : la transition CSS joue (sauf prefers-reduced-motion)
    window.requestAnimationFrame(() => { bar.firstChild.style.width = `${pct}%`; });
    return bar;
}

export function statBox(iconName, value, label) {
    return h('div', { class: 'stat' }, h('div', { class: 'value' }, icon(iconName), h('span', {}, String(value))), h('div', { class: 'label' }, label));
}

export function statsRow(progress) {
    const s = progress.streak;
    return h('div', { class: 'stats', role: 'group', 'aria-label': 'Tes statistiques' },
        statBox('flame', s.current, s.current > 1 ? 'jours de suite' : 'jour de série'),
        statBox('bolt', progress.xp.total, 'XP'),
        statBox('trophy', progress.level.level, 'niveau'));
}

export function dailyGoalBlock(progress) {
    const g = progress.dailyGoal;
    return h('div', {},
        h('div', { class: 'meter-label' }, h('span', {}, 'Objectif du jour'), h('span', {}, g.met ? 'Atteint, bravo !' : `${Math.min(g.done, g.xp)} / ${g.xp} XP`)),
        meter(Math.min(g.done, g.xp), g.xp, { label: 'Objectif du jour', done: g.met }));
}

export function button(label, { variant = 'primary', onClick, href, block = false, large = false, disabled = false, iconName, id } = {}) {
    const cls = `btn btn-${variant}${block ? ' btn-block' : ''}${large ? ' btn-lg' : ''}`;
    const kids = [iconName ? icon(iconName) : null, label];
    if (href) return h('a', { class: cls, href, id }, ...kids);
    return h('button', { class: cls, type: 'button', onClick, disabled, id }, ...kids);
}

export function errorBox(err, retry) {
    const msg = err && err.message ? err.message : 'Quelque chose s’est mal passé.';
    return h('div', { class: 'error-box', role: 'alert' },
        h('p', {}, msg),
        retry ? h('p', {}, button('Réessayer', { variant: 'ghost', onClick: retry })) : null);
}

export { announce };
