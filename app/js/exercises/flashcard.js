import { h } from '../dom.js';

// Flashcard : le joueur s'engage (« je m'en souviens » / « pas encore ») AVANT de voir le verso,
// puis la carte se retourne avec la réponse envoyée par le serveur (récupération active).
export function createFlashcard(item, { submit }) {
    const front = h('p', {}, item.front);
    const card = h('div', { class: 'flash-card', role: 'group', 'aria-label': 'Carte mémo' }, front);
    const yes = h('button', { type: 'button', class: 'btn btn-primary', onClick: () => submit({ known: true }) }, 'Je m’en souviens');
    const no = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => submit({ known: false }) }, 'Pas encore');
    const actions = h('div', { class: 'flash-actions' }, yes, no);
    return {
        el: h('div', { class: 'flash' }, card, h('p', { class: 'muted' }, 'Essaie de répondre dans ta tête, puis dis-nous si tu y es arrivé.'), actions),
        inline: true,
        ready: () => false,
        response: () => ({}),
        lock() { yes.disabled = true; no.disabled = true; },
        focus() { yes.focus(); },
        key: () => false,
        reveal(result) {
            actions.hidden = true;
            card.classList.add('flipped');
            const back = result.solution && result.solution.back;
            while (card.firstChild) card.removeChild(card.firstChild);
            card.appendChild(h('div', {}, h('p', {}, back || ''), result.solution && result.solution.mnemonic ? h('small', {}, `Pour s’en souvenir : ${result.solution.mnemonic}`) : null));
        }
    };
}
