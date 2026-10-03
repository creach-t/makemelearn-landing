import { h } from '../dom.js';
import { icon } from '../ui.js';

// QCM et vrai/faux : groupe de boutons radio natifs (navigation clavier : flèches, Espace ; raccourcis 1-4 / V-F).

function choiceNode(group, id, value, label, keyLabel) {
    const input = h('input', { type: 'radio', name: group, id, value: String(value) });
    const lab = h('label', { for: id }, h('span', { class: 'key', 'aria-hidden': 'true' }, keyLabel), h('span', {}, label));
    return { wrap: h('div', { class: 'choice' }, input, lab), input, lab };
}

function build(item, { onChange }, entries, extraClass) {
    const group = `q-${Math.random().toString(36).slice(2, 8)}`;
    const nodes = entries.map((e, i) => ({ ...e, ...choiceNode(group, `${group}-${i}`, e.value, e.label, e.keyLabel) }));
    const el = h('div', { class: `choices ${extraClass || ''}`.trim(), role: 'radiogroup', 'aria-label': 'Réponses possibles' }, ...nodes.map((n) => n.wrap));
    nodes.forEach((n) => n.input.addEventListener('change', () => onChange()));
    const selected = () => nodes.find((n) => n.input.checked);
    return {
        el,
        nodes,
        selected,
        ready: () => Boolean(selected()),
        lock() { nodes.forEach((n) => { n.input.disabled = true; }); },
        focus() { (nodes[0] && nodes[0].input).focus(); },
        mark(node, ok) {
            node.wrap.classList.add(ok ? 'is-correct' : 'is-wrong');
            node.lab.appendChild(h('span', { class: 'sr-only' }, ok ? ' (bonne réponse)' : ' (ta réponse, incorrecte)'));
            node.lab.appendChild(icon(ok ? 'check' : 'close'));
        }
    };
}

export function createMcq(item, ctx) {
    const entries = item.choices.map((c, i) => ({ value: c.id, label: c.text, keyLabel: String(i + 1) }));
    const b = build(item, ctx, entries);
    return {
        el: b.el,
        inline: false,
        ready: b.ready,
        response: () => ({ choice: b.selected().input.value }),
        lock: b.lock,
        focus: b.focus,
        key(e) {
            const n = Number(e.key);
            if (n >= 1 && n <= b.nodes.length) { b.nodes[n - 1].input.checked = true; b.nodes[n - 1].input.focus(); ctx.onChange(); return true; }
            return false;
        },
        reveal(result) {
            const chosen = b.selected();
            if (result.solution) b.nodes.forEach((n) => { if (n.value === result.solution.choice) b.mark(n, true); });
            if (!result.correct && chosen && !(result.solution && chosen.value === result.solution.choice)) b.mark(chosen, false);
            if (result.correct && chosen && !chosen.wrap.classList.contains('is-correct')) b.mark(chosen, true);
        }
    };
}

export function createTrueFalse(item, ctx) {
    const entries = [{ value: 'true', label: 'Vrai', keyLabel: 'V' }, { value: 'false', label: 'Faux', keyLabel: 'F' }];
    const b = build(item, ctx, entries, 'tf');
    const wrap = h('div', {}, h('p', { class: 'context' }, '« ', item.statement, ' »'), b.el);
    return {
        el: wrap,
        inline: false,
        ready: b.ready,
        response: () => ({ value: b.selected().input.value === 'true' }),
        lock: b.lock,
        focus: b.focus,
        key(e) {
            const k = e.key.toLowerCase();
            const idx = k === 'v' ? 0 : k === 'f' ? 1 : -1;
            if (idx < 0) return false;
            b.nodes[idx].input.checked = true;
            b.nodes[idx].input.focus();
            ctx.onChange();
            return true;
        },
        reveal(result) {
            const chosen = b.selected();
            if (result.solution) b.nodes.forEach((n) => { if ((n.value === 'true') === result.solution.value) b.mark(n, true); });
            if (!result.correct && chosen) b.mark(chosen, false);
        }
    };
}
