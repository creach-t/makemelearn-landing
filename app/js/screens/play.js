import { h, clear, announce, pick, reducedMotion } from '../dom.js';
import { api, ApiError, newKey } from '../api.js';
import { state } from '../store.js';
import { mascot } from '../mascot.js';
import { icon, meter, button, errorBox } from '../ui.js';
import { createExercise, KIND_LABEL } from '../exercises/index.js';
import { renderSummary } from './summary.js';

const OK_LINES = ['Bien vu !', 'Tu as le nez fin.', 'Dossier classé !', 'Excellent réflexe.', 'Voilà de l’esprit critique.'];
const KO_LINES = ['Pas tout à fait.', 'Bonne piste, mais ça ne tient pas.', 'Le doute, ça s’entraîne.', 'Un indice t’a échappé.'];
const BOSS_LINES = ['Presque ! Respire, réfléchis et retente.', 'Le boss est coriace. Il te reste de la marge.'];

function solutionNode(item, result) {
    if (result.correct || !result.solution) return null;
    const s = result.solution;
    switch (item.kind) {
        case 'mcq': return h('p', { class: 'solution' }, 'Bonne réponse : ', h('strong', {}, s.text || s.choice));
        case 'truefalse': return h('p', { class: 'solution' }, 'La bonne réponse : ', h('strong', {}, s.value ? 'Vrai' : 'Faux'));
        case 'cloze': return h('p', { class: 'solution' }, 'Réponses attendues : ', h('strong', {}, Object.entries(s.answers).map(([id, a]) => `trou ${id} → ${a}`).join(' · ')));
        case 'input': return h('p', { class: 'solution' }, 'Réponse attendue : ', h('strong', {}, s.text));
        case 'match': return h('div', { class: 'solution' }, h('p', {}, 'Les bonnes associations :'), h('ul', {}, ...s.pairs.map((p) => h('li', {}, `${p.left} → `, h('strong', {}, p.right)))));
        case 'ordering': return h('div', { class: 'solution' }, h('p', {}, `Ordre attendu${s.criterion ? ` (${s.criterion.toLowerCase()})` : ''} :`), h('ol', {}, ...s.order.map((o) => h('li', {}, o))));
        default: return null;
    }
}

export async function show({ root, params, isCurrent, go }) {
    const isLesson = Boolean(params.lessonKey);
    const body = isLesson ? { lessonKey: params.lessonKey } : { mode: params.mode, universe: params.universe };
    if (!state.universes) {
        try { state.universes = (await api.universes()).universes; } catch (_) { state.universes = []; }
    }
    if (!isCurrent()) return undefined;

    const shell = h('main', { class: 'shell screen play' });
    root.appendChild(shell);

    let session = null;
    let items = [];
    let lesson = null;
    let universeSlug = isLesson ? params.lessonKey.split('/')[0] : params.universe;
    let idx = 0;
    let answered = 0;
    let lives = null;
    let mascotName = 'Pie';
    let busy = false;
    let ex = null;
    let current = null; // { item, hintShown }
    let pendingKey = null;
    let finished = false;
    const results = [];

    const uni = (state.universes || []).find((u) => u.slug === universeSlug);
    if (uni && uni.mascot) mascotName = uni.mascot.name;
    if (uni && uni.theme && uni.theme.color) document.documentElement.style.setProperty('--accent', uni.theme.color);

    const onKey = (e) => {
        if (finished || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = (e.target && e.target.tagName) || '';
        if (!ex) {
            // briefing : Entrée lance l'enquête (le focus est sur le titre de la page)
            const go = shell.querySelector('#go-btn');
            if (e.key === 'Enter' && go && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); go.click(); }
            return;
        }
        if (e.key === 'Enter') {
            if (tag === 'BUTTON' || tag === 'A' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            const next = shell.querySelector('#next-btn');
            if (next) { e.preventDefault(); next.click(); return; }
            if (ex.ready() && !busy) { e.preventDefault(); submit(); }
            return;
        }
        if (tag === 'INPUT' && e.target.type === 'text') return;
        if (tag === 'SELECT' || shell.querySelector('#next-btn')) return;
        if (ex.key(e)) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    const cleanup = () => {
        document.removeEventListener('keydown', onKey);
        document.documentElement.style.removeProperty('--accent');
    };

    // ---------------------------------------------------------------- démarrage
    async function begin({ skipBrief = false } = {}) {
        clear(shell);
        shell.appendChild(h('p', { class: 'boot' }, 'Préparation du dossier…'));
        try {
            const res = await api.startSession(body);
            if (!isCurrent()) return;
            session = res.session;
            items = res.items;
            lesson = res.lesson;
            universeSlug = res.universe;
            idx = 0;
            answered = 0;
            lives = session.lives;
            finished = false;
            results.length = 0;
        } catch (err) {
            if (!isCurrent()) return;
            renderStartError(err);
            return;
        }
        if (!skipBrief) renderBrief();
        else renderQuestion();
    }

    function renderStartError(err) {
        clear(shell);
        const locked = err instanceof ApiError && err.code === 'LESSON_LOCKED';
        const nothing = err instanceof ApiError && err.code === 'NO_ITEMS';
        shell.appendChild(h('div', { class: 'stack' },
            h('div', { class: 'bubble-row' }, mascot(locked || nothing ? 'think' : 'oops', 'sm'), h('p', { class: 'bubble' }, h('span', { class: 'who' }, mascotName), locked ? 'Cette enquête n’est pas encore ouverte.' : nothing ? 'Rien à faire ici pour l’instant.' : 'Aïe, le dossier ne s’ouvre pas.')),
            h('h1', {}, locked ? 'Leçon verrouillée' : nothing ? 'Pas encore de dossier' : 'Impossible de démarrer'),
            errorBox(err, locked || nothing ? null : () => begin()),
            h('p', {}, button('Retour à la carte', { variant: 'ghost', href: `#/univers/${universeSlug}` }))));
    }

    // ---------------------------------------------------------------- briefing
    function renderBrief() {
        clear(shell);
        const isReview = session.mode === 'review';
        const isChallenge = session.mode === 'challenge';
        const title = lesson ? lesson.title : isReview ? 'Révision des dossiers' : 'Défi des boss';
        document.title = `${title} – MakeMeLearn`;
        const intro = lesson && lesson.intro && lesson.intro.texte
            ? lesson.intro.texte
            : isReview ? 'On repasse d’abord les dossiers qui t’ont résisté, puis les plus anciens. Zéro pression.'
                : isChallenge ? 'Les épreuves de boss des leçons que tu as déjà débloquées. Tu as 3 vies, et tu peux réessayer.'
                    : 'Un dossier tout frais ! Lis le résumé, puis on enquête ensemble.';
        const who = lesson && lesson.intro && lesson.intro.personnage ? lesson.intro.personnage : mascotName;
        shell.appendChild(h('div', { class: 'stack-lg brief' },
            h('div', { class: 'play-top' }, h('a', { class: 'icon-btn', href: `#/univers/${universeSlug}`, 'aria-label': 'Retour à la carte' }, icon('close'))),
            h('div', { class: 'bubble-row' }, mascot('think', 'sm'), h('p', { class: 'bubble' }, h('span', { class: 'who' }, who), intro)),
            h('h1', {}, title),
            lesson && lesson.microCourse ? h('section', { class: 'card stack', 'aria-labelledby': 'mc-title' },
                h('h2', { id: 'mc-title' }, 'Le résumé du dossier'),
                h('p', { class: 'micro pre-line' }, lesson.microCourse),
                lesson.recap ? h('p', { class: 'recap' }, `À retenir : ${lesson.recap}`) : null) : null,
            h('p', { class: 'muted' }, `${items.length} exercice${items.length > 1 ? 's' : ''}${lesson && lesson.durationMin ? `, environ ${lesson.durationMin} min` : ''}${items.some((i) => i.isBoss) ? ' · finit par une épreuve de boss : 3 vies, et tu peux réessayer' : ''}.`)));
        const dock = h('div', { class: 'dock' }, h('div', { class: 'dock-inner' }, button('C’est parti !', { large: true, block: true, id: 'go-btn', onClick: () => renderQuestion() })));
        shell.appendChild(dock);
        const goBtn = dock.querySelector('#go-btn');
        goBtn.focus();
    }

    // ---------------------------------------------------------------- question
    function topBar(item) {
        const bar = h('div', { class: 'play-top' },
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitter la session', onClick: () => quit.showModal() }, icon('close')),
            meter(answered, items.length, { label: `Exercices terminés : ${answered} sur ${items.length}` }));
        if (item.isBoss && lives != null) {
            bar.appendChild(h('div', { class: 'lives', role: 'img', 'aria-label': `${lives} vie${lives > 1 ? 's' : ''} restante${lives > 1 ? 's' : ''}` },
                ...[0, 1, 2].map((i) => icon('heart', i < lives ? '' : 'lost'))));
        }
        return bar;
    }

    const quit = h('dialog', { 'aria-labelledby': 'quit-title' },
        h('h2', { id: 'quit-title' }, 'Quitter l’enquête ?'),
        h('p', { class: 'muted' }, 'Les exercices déjà validés sont conservés (XP comprise). Tu pourras reprendre la leçon quand tu veux.'),
        h('div', { class: 'actions' },
            button('Continuer à jouer', { onClick: () => quit.close() }),
            button('Quitter', { variant: 'ghost', onClick: () => { quit.close(); go(`#/univers/${universeSlug}`); } })));
    shell.appendChild(quit);

    function renderQuestion() {
        const item = items[idx];
        document.title = `Exercice ${idx + 1}/${items.length} – MakeMeLearn`;
        pendingKey = null;
        current = { item, hintShown: current && current.item === item ? current.hintShown : false };
        Array.from(shell.children).forEach((c) => { if (c !== quit) shell.removeChild(c); });
        if (!quit.isConnected) shell.appendChild(quit);

        ex = createExercise(item, { onChange: updateDock, submit: (resp) => submit(resp) });
        const hintArea = h('div', { 'aria-live': 'polite' });
        const hintBtn = item.hasHint ? h('button', { type: 'button', class: 'hint-btn', id: 'hint-btn', onClick: async () => {
            hintBtn.disabled = true;
            try {
                const r = await api.hint(session.id, item.key);
                current.hintShown = true;
                if (r.hint) {
                    hintArea.appendChild(h('p', { class: 'hint-box' }, h('strong', {}, 'Indice : '), r.hint, h('br'), h('small', {}, 'Avec un indice, cet exercice rapporte un peu moins d’XP.')));
                    announce(`Indice : ${r.hint}`);
                }
            } catch (err) { hintBtn.disabled = false; hintArea.appendChild(errorBox(err)); }
        } }, 'Un indice ?') : null;

        const question = h('section', { class: 'question', 'aria-labelledby': 'q-title' },
            item.isBoss ? h('div', { class: 'boss-banner' }, icon('shield'), 'Épreuve de boss') : null,
            h('div', { class: 'kind' }, KIND_LABEL[item.kind] || ''),
            h('h2', { id: 'q-title', tabindex: '-1' }, item.prompt),
            item.context ? h('p', { class: 'context' }, item.context) : null,
            ex.el,
            hintBtn ? h('div', {}, hintBtn) : null,
            hintArea);

        shell.appendChild(topBar(item));
        shell.appendChild(h('div', { class: 'play-body screen' }, question));
        const dock = h('div', { class: 'dock', id: 'dock' }, h('div', { class: 'dock-inner', id: 'dock-inner' }));
        shell.appendChild(dock);
        updateDock();
        const title = shell.querySelector('#q-title');
        title.focus({ preventScroll: true });
        announce(`Exercice ${idx + 1} sur ${items.length}. ${item.prompt}`);
    }

    function updateDock() {
        const inner = shell.querySelector('#dock-inner');
        if (!inner || busy || shell.querySelector('#next-btn')) return;
        const dock = shell.querySelector('#dock');
        if (ex.inline) { dock.hidden = true; return; }
        dock.hidden = false;
        clear(inner);
        inner.appendChild(button('Valider', { large: true, block: true, id: 'check-btn', disabled: !ex.ready(), onClick: () => submit() }));
    }

    // ---------------------------------------------------------------- réponse
    async function submit(inlineResponse) {
        if (busy || finished) return;
        const item = items[idx];
        const response = inlineResponse || ex.response();
        if (!response) return;
        busy = true;
        pendingKey = pendingKey || newKey(); // même clé tant que la réponse n'a pas abouti : un renvoi ne compte jamais deux fois
        const dock = shell.querySelector('#dock');
        const inner = shell.querySelector('#dock-inner');
        dock.hidden = false;
        clear(inner);
        inner.appendChild(h('p', { class: 'muted center', role: 'status' }, 'Vérification…'));
        try {
            const result = await api.answer(session.id, item.key, response, pendingKey);
            if (!isCurrent()) return;
            pendingKey = null;
            busy = false;
            showFeedback(item, result);
        } catch (err) {
            busy = false;
            clear(inner);
            const retriable = err instanceof ApiError && (err.status === 0 || err.status >= 500 || err.status === 429);
            inner.appendChild(h('div', { class: 'stack' }, errorBox(err),
                retriable ? button('Renvoyer ma réponse', { id: 'retry-btn', onClick: () => submit(inlineResponse) }) : button('Modifier ma réponse', { variant: 'ghost', onClick: () => { pendingKey = null; updateDock(); } })));
            if (!retriable) pendingKey = null;
        }
    }

    function showFeedback(item, result) {
        ex.lock();
        ex.reveal(result);
        answered = result.session.answered;
        if (result.boss) lives = result.boss.lives;
        if (result.final) results.push(result);

        const retry = !result.final && !result.correct;
        const dock = shell.querySelector('#dock');
        const inner = shell.querySelector('#dock-inner');
        dock.hidden = false;
        dock.className = `dock ${result.correct ? 'ok' : 'ko'}`;
        clear(inner);

        const headline = result.correct ? pick(OK_LINES) : retry ? pick(BOSS_LINES) : pick(KO_LINES);
        const gain = result.xp.awarded > 0 ? h('span', { class: 'gain', 'aria-label': `${result.xp.awarded} points d’expérience gagnés` }, `+${result.xp.awarded} XP`) : null;
        const fb = h('div', { class: 'feedback feedback-scroll' },
            h('h3', {}, result.correct ? icon('check') : icon('close'), headline, gain),
            retry
                ? h('p', {}, `Il te reste ${result.boss.lives} vie${result.boss.lives > 1 ? 's' : ''} : relis l’énoncé et retente, c’est gratuit.`)
                : result.explanation ? h('p', {}, result.explanation) : null,
            result.why ? h('p', { class: 'why' }, result.why) : null,
            solutionNode(item, result),
            result.boss && result.boss.defeated ? h('p', {}, h('strong', {}, 'Boss vaincu !')) : null,
            result.streakExtended ? h('p', {}, '🔥 Série validée pour aujourd’hui.') : null,
            result.levelUp ? h('p', {}, `Niveau ${result.progress.level.level} atteint !`) : null,
            result.sources && result.sources.length
                ? h('details', {}, h('summary', {}, 'Sources'), h('ul', {}, ...result.sources.map((s) => h('li', {}, s))))
                : null);
        const isLast = idx + 1 >= items.length;
        const nextBtn = retry
            ? button('Réessayer', { large: true, block: true, id: 'next-btn', onClick: () => renderQuestion() })
            : button(isLast ? 'Voir le bilan' : 'Continuer', { large: true, block: true, id: 'next-btn', onClick: () => { if (isLast) finish(); else { idx += 1; renderQuestion(); } } });
        inner.appendChild(h('div', { class: 'row' }, mascot(result.correct ? 'cheer' : 'oops', 'sm'), fb));
        inner.appendChild(nextBtn);

        // la barre de progression avance tout de suite
        const bar = shell.querySelector('.play-top .meter');
        if (bar) {
            bar.setAttribute('aria-valuenow', String(answered));
            bar.setAttribute('aria-label', `Exercices terminés : ${answered} sur ${items.length}`);
            bar.firstChild.style.width = `${Math.round((answered / items.length) * 100)}%`;
        }
        const heart = shell.querySelector('.lives');
        if (heart && lives != null) {
            [...heart.children].forEach((svgEl, i) => svgEl.classList.toggle('lost', i >= lives));
            heart.setAttribute('aria-label', `${lives} vie${lives > 1 ? 's' : ''} restante${lives > 1 ? 's' : ''}`);
        }
        if (!result.correct) shell.querySelector('.question').classList.add('shake');
        // le bandeau de feedback ne doit jamais masquer la réponse révélée : on réserve sa hauteur et on la ramène à l'écran
        const body = shell.querySelector('.play-body');
        if (body) body.style.paddingBottom = `${dock.offsetHeight + 24}px`;
        window.requestAnimationFrame(() => ex.el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }));
        announce(`${result.correct ? 'Bonne réponse.' : retry ? 'Pas encore.' : 'Réponse incorrecte.'} ${result.explanation || ''}${result.xp.awarded ? ` Plus ${result.xp.awarded} XP.` : ''}`);
        nextBtn.focus();
    }

    // ---------------------------------------------------------------- bilan
    async function finish() {
        finished = true;
        clear(shell);
        shell.appendChild(h('p', { class: 'boot' }, 'Le dossier est en cours de classement…'));
        try {
            const out = await api.complete(session.id);
            if (!isCurrent()) return;
            state.progress = null;
            renderSummary(shell, out.summary, {
                mascotName,
                lessonTitle: lesson ? lesson.title : null,
                universeSlug,
                again: () => begin({ skipBrief: true }),
                goNext: (key) => go(`#/jouer/${key.split('/').map(encodeURIComponent).join('/')}`),
                goHome: () => go('#/'),
                goMap: () => go(`#/univers/${universeSlug}`)
            });
            const t = shell.querySelector('h1');
            if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
        } catch (err) {
            if (!isCurrent()) return;
            finished = false;
            clear(shell);
            shell.appendChild(h('div', { class: 'stack' }, h('h1', {}, 'Le bilan n’a pas pu être calculé'), errorBox(err, () => finish()),
                button('Retour à la carte', { variant: 'ghost', href: `#/univers/${universeSlug}` })));
        }
    }

    await begin();
    return cleanup;
}
