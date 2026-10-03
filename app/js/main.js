// Point d'entrée : joueur invité, routeur par hash, écrans.
// Modules ES natifs, aucun build, aucun framework, aucun script inline (CSP helmet par défaut).

import { h, clear } from './dom.js';
import { ensureGuest } from './api.js';
import { state } from './store.js';
import { errorBox, button } from './ui.js';
import * as home from './screens/home.js';
import * as map from './screens/map.js';
import * as play from './screens/play.js';
import * as profile from './screens/profile.js';

const root = document.getElementById('app');
let cleanup = null;
let token = 0;

function parseRoute() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/').filter(Boolean).map((p) => {
        try { return decodeURIComponent(p); } catch (_) { return p; }
    });
    return parts;
}

function resolve(parts) {
    if (parts.length === 0) return { screen: home, params: {} };
    if (parts[0] === 'univers' && parts[1]) return { screen: map, params: { slug: parts[1] } };
    // le lessonKey contient un « / » : #/jouer/<univers>/<lecon>
    if (parts[0] === 'jouer' && parts.length >= 3) return { screen: play, params: { lessonKey: `${parts[1]}/${parts[2]}` } };
    if (parts[0] === 'reviser' && parts[1]) return { screen: play, params: { mode: 'review', universe: parts[1] } };
    if (parts[0] === 'defi' && parts[1]) return { screen: play, params: { mode: 'challenge', universe: parts[1] } };
    if (parts[0] === 'profil') return { screen: profile, params: {} };
    return null;
}

async function route() {
    const mine = ++token;
    if (cleanup) { try { cleanup(); } catch (_) { /* nettoyage best effort */ } cleanup = null; }
    clear(root);
    root.setAttribute('aria-busy', 'true');
    window.scrollTo(0, 0);

    const found = resolve(parseRoute());
    const isCurrent = () => mine === token;
    try {
        if (!state.user) state.user = await ensureGuest();
        if (!isCurrent()) return;
        if (!found) {
            window.location.replace('#/');
            return;
        }
        const out = await found.screen.show({ root, params: found.params, isCurrent, go: (hash) => { window.location.hash = hash; } });
        if (!isCurrent()) { if (typeof out === 'function') out(); return; }
        cleanup = typeof out === 'function' ? out : null;
    } catch (err) {
        if (!isCurrent()) return;
        clear(root);
        root.appendChild(h('main', { class: 'shell screen' },
            h('h1', { tabindex: '-1' }, 'Oups, le bureau est fermé'),
            errorBox(err, () => route()),
            h('p', {}, button('Retour à l’accueil', { variant: 'ghost', href: '#/' }))));
    } finally {
        if (isCurrent()) {
            root.setAttribute('aria-busy', 'false');
            const target = root.querySelector('h1') || root;
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }
    }
}

window.addEventListener('hashchange', route);
route();
