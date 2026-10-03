// État partagé minimal + mémorisation locale (confort uniquement : le serveur reste la source de vérité).

export const state = { user: null, progress: null, universes: null };

export function remember(key, value) {
    try { window.localStorage.setItem(`mml.${key}`, JSON.stringify(value)); } catch (_) { /* stockage indisponible */ }
}
export function recall(key, fallback = null) {
    try {
        const v = window.localStorage.getItem(`mml.${key}`);
        return v === null ? fallback : JSON.parse(v);
    } catch (_) { return fallback; }
}
export function forgetAll() {
    try {
        Object.keys(window.localStorage).filter((k) => k.startsWith('mml.')).forEach((k) => window.localStorage.removeItem(k));
    } catch (_) { /* stockage indisponible */ }
}
