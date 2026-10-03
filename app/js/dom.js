// Aides DOM. RÈGLE : aucune donnée (serveur ou utilisateur) ne passe par innerHTML ;
// tout le texte passe par des noeuds texte (textContent / createTextNode).

const SVG_NS = 'http://www.w3.org/2000/svg';

function append(parent, child) {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) { child.forEach((c) => append(parent, c)); return; }
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
}

/** h('div', { class: 'x', onClick: fn, 'aria-label': '...' }, 'texte', enfant, ...) */
export function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected' || key === 'open') el[key] = value;
        else el.setAttribute(key, value === true ? '' : String(value));
    }
    children.forEach((c) => append(el, c));
    return el;
}

/** Élément SVG : svg('path', { d: '...', fill: 'currentColor' }) */
export function svg(tag, attrs, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) {
        if (value !== null && value !== undefined && value !== false) el.setAttribute(key, String(value));
    }
    children.forEach((c) => append(el, c));
    return el;
}

export function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
}

/** Annonce à destination des lecteurs d'écran (région aria-live). */
export function announce(message) {
    const live = document.getElementById('live');
    if (!live) return;
    live.textContent = '';
    // léger délai : certains lecteurs d'écran ignorent un texte identique réécrit instantanément
    window.setTimeout(() => { live.textContent = message; }, 40);
}

export const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
