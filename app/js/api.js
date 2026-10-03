// Client de l'API MakeMeLearn (même origine, cookie de session HttpOnly posé par le serveur).
// Mutations : en-tête X-MML obligatoire (protection CSRF). Réponses : en-tête Idempotency-Key.

import { recall } from './store.js';

const BASE = '/api/v1';

export class ApiError extends Error {
    constructor(status, code, message, details) {
        super(message || code || `Erreur ${status}`);
        this.name = 'ApiError';
        this.status = status;
        this.code = code || null;
        this.details = details || null;
    }
}

export function newKey() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let guestPromise = null;

async function raw(method, path, body, headers) {
    const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(headers || {}) } };
    if (method !== 'GET') init.headers['X-MML'] = '1';
    if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    let res;
    try {
        res = await fetch(BASE + path, init);
    } catch (err) {
        throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifie ta connexion puis réessaie.');
    }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch (_) { /* corps vide ou non JSON */ }
    if (!res.ok) throw new ApiError(res.status, data && data.code, (data && (data.error || data.message)) || `Erreur ${res.status}`, data && data.details);
    return data;
}

/** Garantit un joueur (invité) : GET /me, sinon POST /auth/guest (le cookie est posé par le serveur). */
export async function ensureGuest(force = false) {
    if (force) guestPromise = null;
    if (!guestPromise) {
        guestPromise = (async () => {
            // Premier lancement (rien en mémoire locale) : on crée directement l'invité, sans GET /me qui ferait un 401 bruyant
            if (!force && recall('seen')) {
                try { return (await raw('GET', '/me')).user; } catch (err) { if (!(err instanceof ApiError) || err.status !== 401) throw err; }
            }
            return (await raw('POST', '/auth/guest', {})).user;
        })().catch((err) => { guestPromise = null; throw err; });
    }
    return guestPromise;
}

async function request(method, path, body, headers) {
    try {
        return await raw(method, path, body, headers);
    } catch (err) {
        // Cookie perdu ou expiré : on recrée un invité et on rejoue UNE fois
        if (err instanceof ApiError && err.status === 401 && err.code === 'AUTH_REQUIRED') {
            await ensureGuest(true);
            return raw(method, path, body, headers);
        }
        throw err;
    }
}

export const api = {
    me: () => request('GET', '/me'),
    patchMe: (changes) => request('PATCH', '/me', changes),
    deleteMe: () => request('DELETE', '/me'),
    universes: () => request('GET', '/universes'),
    universe: (slug) => request('GET', `/universes/${encodeURIComponent(slug)}`),
    progress: () => request('GET', '/progress'),
    startSession: (body) => request('POST', '/sessions', body),
    hint: (sessionId, itemKey) => request('POST', `/sessions/${sessionId}/hint`, { itemKey }),
    answer: (sessionId, itemKey, response, key) => request('POST', `/sessions/${sessionId}/answers`, { itemKey, response }, { 'Idempotency-Key': key }),
    complete: (sessionId) => request('POST', `/sessions/${sessionId}/complete`, {})
};
