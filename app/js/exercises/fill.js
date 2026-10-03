import { h } from '../dom.js';

// Texte à trous : liste déroulante si une banque de mots est fournie, sinon champ texte.

export function createCloze(item, { onChange, submit }) {
    const controls = new Map();
    const nodes = [];
    const parts = item.text.split(/(\{\{\d\}\})/);
    for (const part of parts) {
        const m = /^\{\{(\d)\}\}$/.exec(part);
        if (!m) { nodes.push(part); continue; }
        const blank = item.blanks.find((b) => b.id === m[1]);
        let control;
        const label = `Trou numéro ${m[1]}`;
        if (blank && blank.bank) {
            control = h('select', { 'aria-label': label },
                h('option', { value: '' }, '…'),
                ...blank.bank.map((w) => h('option', { value: w }, w)));
            control.addEventListener('change', () => onChange());
        } else {
            control = h('input', { type: 'text', 'aria-label': label, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
            control.addEventListener('input', () => onChange());
            control.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        }
        controls.set(m[1], control);
        nodes.push(control);
    }
    const el = h('p', { class: 'cloze' }, ...nodes);
    const all = () => [...controls.values()];
    return {
        el,
        inline: false,
        ready: () => all().every((c) => c.value.trim() !== ''),
        response: () => ({ answers: Object.fromEntries([...controls].map(([id, c]) => [id, c.value])) }),
        lock() { all().forEach((c) => { c.disabled = true; }); },
        focus() { const c = all()[0]; if (c) c.focus(); },
        key: () => false,
        reveal(result) {
            const blanks = (result.detail && result.detail.blanks) || {};
            for (const [id, c] of controls) c.classList.add(blanks[id] ? 'is-correct' : 'is-wrong');
        }
    };
}

export function createInput(item, { onChange, submit }) {
    const input = h('input', { class: 'field', type: 'text', id: 'answer-field', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: 'text' });
    input.addEventListener('input', () => onChange());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    const el = h('div', {}, h('label', { for: 'answer-field', class: 'muted' }, 'Ta réponse'), input);
    return {
        el,
        inline: false,
        ready: () => input.value.trim() !== '',
        response: () => ({ text: input.value }),
        lock() { input.disabled = true; },
        focus() { input.focus(); },
        key: () => false,
        reveal(result) { input.classList.add(result.correct ? 'is-correct' : 'is-wrong'); }
    };
}
