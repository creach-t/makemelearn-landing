import { h } from '../dom.js';
import { icon } from '../ui.js';

// Appariement : une liste déroulante par élément (accessible au clavier et au tactile, sans glisser-déposer).
export function createMatch(item, { onChange }) {
    const rows = item.left.map((left, i) => {
        const select = h('select', { id: `m-${i}`, 'aria-label': `Associer : ${left}` },
            h('option', { value: '' }, 'Choisir…'),
            ...item.right.map((r) => h('option', { value: r }, r)));
        const row = h('div', { class: 'pair' }, h('label', { class: 'left', for: `m-${i}` }, left), select);
        return { left, select, row };
    });
    const note = h('p', { class: 'muted', role: 'status' });

    const refresh = () => {
        const used = new Map();
        rows.forEach((r) => { if (r.select.value) used.set(r.select.value, (used.get(r.select.value) || 0) + 1); });
        rows.forEach((r) => {
            [...r.select.options].forEach((o) => { o.disabled = Boolean(o.value) && o.value !== r.select.value && used.has(o.value); });
        });
        note.textContent = rows.every((r) => r.select.value) ? '' : 'Associe chaque élément, chacun ne sert qu’une fois.';
        onChange();
    };
    rows.forEach((r) => r.select.addEventListener('change', refresh));

    return {
        el: h('div', {}, h('div', { class: 'pairs' }, ...rows.map((r) => r.row)), note),
        inline: false,
        ready: () => rows.every((r) => r.select.value) && new Set(rows.map((r) => r.select.value)).size === rows.length,
        response: () => ({ pairs: rows.map((r) => ({ left: r.left, right: r.select.value })) }),
        lock() { rows.forEach((r) => { r.select.disabled = true; }); },
        focus() { rows[0].select.focus(); },
        key: () => false,
        reveal(result) {
            const detail = (result.detail && result.detail.pairs) || [];
            rows.forEach((r) => {
                const d = detail.find((x) => x.left === r.left);
                const ok = d ? d.correct : result.correct;
                r.row.classList.add(ok ? 'is-correct' : 'is-wrong');
                r.row.appendChild(h('span', { class: 'sr-only' }, ok ? 'Bonne association' : 'Mauvaise association'));
            });
        }
    };
}

// Ordre : boutons Monter / Descendre sur chaque élément (clavier, tactile, lecteurs d'écran).
export function createOrdering(item, { onChange }) {
    let order = [...item.items];
    const list = h('ol', { class: 'ordering', 'aria-label': item.criterion || 'Éléments à ordonner' });
    const status = h('p', { class: 'sr-only', role: 'status' });
    let locked = false;
    let moved = -1;

    const move = (i, delta) => {
        const j = i + delta;
        if (locked || j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        moved = j;
        draw();
        status.textContent = `« ${order[j]} » est maintenant en position ${j + 1} sur ${order.length}`;
        const btn = list.querySelectorAll('li')[j].querySelector(delta < 0 ? '.up' : '.down');
        if (btn && !btn.disabled) btn.focus(); else list.querySelectorAll('li')[j].querySelector('button:not(:disabled)').focus();
        onChange();
    };

    function draw() {
        while (list.firstChild) list.removeChild(list.firstChild);
        order.forEach((text, i) => {
            const li = h('li', { class: `step${i === moved ? ' moved' : ''}` },
                h('span', {}, text),
                h('span', { class: 'moves' },
                    h('button', { type: 'button', class: 'up', 'aria-label': `Monter « ${text} »`, disabled: locked || i === 0, onClick: () => move(i, -1) }, icon('up')),
                    h('button', { type: 'button', class: 'down', 'aria-label': `Descendre « ${text} »`, disabled: locked || i === order.length - 1, onClick: () => move(i, 1) }, icon('down'))));
            list.appendChild(li);
        });
    }
    draw();

    return {
        el: h('div', {}, item.criterion ? h('p', { class: 'muted' }, item.criterion) : null, list, status),
        inline: false,
        ready: () => true,
        response: () => ({ order: [...order] }),
        lock() { locked = true; draw(); },
        focus() { const b = list.querySelector('button:not(:disabled)'); if (b) b.focus(); },
        key: () => false,
        reveal(result) {
            const positions = (result.detail && result.detail.positions) || [];
            [...list.querySelectorAll('li')].forEach((li, i) => {
                const ok = positions[i] !== undefined ? positions[i] : result.correct;
                li.classList.add(ok ? 'is-correct' : 'is-wrong');
                li.appendChild(h('span', { class: 'sr-only' }, ok ? 'Bonne place' : 'Mauvaise place'));
            });
        }
    };
}
