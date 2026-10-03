import { svg } from './dom.js';

// Pie, la pie voleuse de certitudes (lore du Bureau des Doutes), dessinée en SVG construit par le DOM.
// États : idle | cheer | think | oops. Illustration provisoire (le dossier prévoit des illustrations dédiées).

export function mascot(state = 'idle', size = '') {
    const eyeOpen = state !== 'cheer';
    const parts = [
        // queue
        svg('path', { d: 'M34 80 L8 100 L24 102 L12 114 L44 94 Z', fill: '#141a38' }),
        // corps, ventre, aile
        svg('ellipse', { cx: 58, cy: 78, rx: 30, ry: 26, fill: '#1b2347' }),
        svg('ellipse', { cx: 54, cy: 84, rx: 18, ry: 16, fill: '#f4f6ff' }),
        svg('ellipse', { class: 'wing', cx: 70, cy: 76, rx: 15, ry: 20, fill: '#4263eb', transform: 'rotate(-12 70 76)' }),
        // pattes
        svg('path', { d: 'M50 102 v8 M62 102 v8', stroke: '#ffb703', 'stroke-width': 3, 'stroke-linecap': 'round' }),
        // tête
        svg('circle', { cx: 66, cy: 44, r: 22, fill: '#1b2347' }),
        // chapeau d'enquêteur
        svg('path', { d: 'M45 33 Q66 6 87 33 Z', fill: '#6C5CE7' }),
        svg('rect', { x: 43, y: 31, width: 46, height: 6, rx: 3, fill: '#4b3cc4' }),
        // bec
        svg('path', { d: 'M85 44 L104 50 L85 56 Z', fill: '#ffd166' })
    ];
    if (eyeOpen) {
        const look = state === 'think' ? { dx: -2, dy: -2 } : { dx: 1, dy: 0 };
        parts.push(
            svg('circle', { cx: 74, cy: 42, r: 7, fill: '#fff' }),
            svg('circle', { cx: 74 + look.dx, cy: 42 + look.dy, r: 3.4, fill: '#0b1426' })
        );
        if (state === 'oops') parts.push(svg('path', { d: 'M66 33 L82 37', stroke: '#fff', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    } else {
        parts.push(svg('path', { d: 'M67 43 Q74 35 81 43', stroke: '#fff', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }));
    }
    if (state === 'cheer') {
        parts.push(
            svg('path', { d: 'M104 18 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z', fill: '#ffd166' }),
            svg('path', { d: 'M20 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z', fill: '#f093fb' })
        );
    }
    if (state === 'think') {
        parts.push(svg('text', { x: 100, y: 28, 'font-size': 26, 'font-weight': 800, fill: '#ffd166' }, '?'));
    }
    return svg('svg', { class: `mascot ${state} ${size}`.trim(), viewBox: '0 0 120 120', role: 'img', 'aria-label': `Pie, la mascotte (${state})` }, ...parts);
}
