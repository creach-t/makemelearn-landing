'use strict';

/**
 * Correction 100 % serveur : un correcteur par `kind` (qcm, vrai_faux, trous, appariement, ordre, saisie, flashcard).
 * Le type `code` n'est pas pris en charge (exécution Pyodide hors périmètre) : les items `code` ne sont jamais servis.
 *
 * Chaque correcteur reçoit le payload (item JSON du contenu) et la réponse brute du client et retourne
 *   { correct: boolean, detail: object }       ou lève HttpError 400 INVALID_RESPONSE (réponse mal formée / incomplète)
 * `solution(kind, payload)` donne ce qu'on révèle une fois la réponse définitive.
 * `publicItem(row)` donne ce qu'on envoie AVANT la réponse : jamais de réponse, d'explication, de source ni d'indice.
 */

const crypto = require('crypto');
const { HttpError } = require('./errors');

const invalid = (message) => new HttpError(400, 'INVALID_RESPONSE', message);

// ---------------------------------------------------------------- utilitaires

/** Mélange de Fisher-Yates avec un aléa cryptographique. */
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Mélange qui garantit un ordre différent de l'original (quand c'est possible). */
function shuffleDifferent(list) {
  if (list.length < 2) return [...list];
  for (let k = 0; k < 20; k++) {
    const s = shuffle(list);
    if (s.some((v, i) => v !== list[i])) return s;
  }
  return [...list.slice(1), list[0]];
}

/** Normalisation de saisie. `flags` : sous-ensemble de ['casse', 'accents', 'espaces']. */
function normalize(value, flags) {
  let t = String(value).normalize('NFC').replace(/[’‘`´]/g, "'").replace(/[  ]/g, ' ');
  if (flags.includes('casse')) t = t.toLowerCase();
  if (flags.includes('accents')) t = t.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  t = t.replace(/\s+/g, ' ').trim(); // les espaces superflus ne comptent jamais comme une erreur
  return t;
}
const ALL_FLAGS = ['casse', 'accents', 'espaces'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max, label) => {
  if (typeof v !== 'string') throw invalid(`${label} : texte attendu`);
  if (v.length > max) throw invalid(`${label} : trop long`);
  return v;
};

// ---------------------------------------------------------------- correcteurs

const graders = {
  mcq(p, r) {
    if (!isObj(r)) throw invalid('Réponse attendue : { choice }');
    const choice = str(r.choice, 3, 'choice');
    if (!p.choix.some((c) => c.id === choice)) throw invalid('Choix inconnu');
    return { correct: choice === p.bonne, detail: { choice } };
  },

  truefalse(p, r) {
    if (!isObj(r) || typeof r.value !== 'boolean') throw invalid('Réponse attendue : { value: true|false }');
    return { correct: r.value === p.reponse, detail: { value: r.value } };
  },

  cloze(p, r) {
    if (!isObj(r) || !isObj(r.answers)) throw invalid('Réponse attendue : { answers: { "1": "...", ... } }');
    const blanks = {};
    let all = true;
    for (const trou of p.trous) {
      const given = r.answers[trou.id];
      if (given !== undefined && given !== null) str(given, 200, `trou ${trou.id}`);
      const ok = typeof given === 'string' && given.trim() !== '' && trou.reponses_acceptees.some((a) => normalize(a, ALL_FLAGS) === normalize(given, ALL_FLAGS));
      blanks[trou.id] = ok;
      if (!ok) all = false;
    }
    if (p.trous.every((t) => typeof r.answers[t.id] !== 'string' || r.answers[t.id].trim() === '')) throw invalid('Aucun trou rempli');
    return { correct: all, detail: { blanks } };
  },

  match(p, r) {
    if (!isObj(r) || !Array.isArray(r.pairs)) throw invalid('Réponse attendue : { pairs: [{ left, right }] }');
    if (r.pairs.length !== p.paires.length) throw invalid('Toutes les paires doivent être associées');
    const byLeft = new Map(p.paires.map((x) => [x.gauche, x.droite]));
    const rights = new Set(p.paires.map((x) => x.droite));
    const seenL = new Set();
    const seenR = new Set();
    const pairs = [];
    for (const x of r.pairs) {
      if (!isObj(x)) throw invalid('Paire mal formée');
      const left = str(x.left, 400, 'left');
      const right = str(x.right, 400, 'right');
      if (!byLeft.has(left) || !rights.has(right)) throw invalid('Élément inconnu');
      if (seenL.has(left) || seenR.has(right)) throw invalid('Chaque élément ne s\'utilise qu\'une fois');
      seenL.add(left);
      seenR.add(right);
      pairs.push({ left, correct: byLeft.get(left) === right });
    }
    return { correct: pairs.every((x) => x.correct), detail: { pairs } };
  },

  ordering(p, r) {
    if (!isObj(r) || !Array.isArray(r.order)) throw invalid('Réponse attendue : { order: [...] }');
    if (r.order.length !== p.elements.length) throw invalid('Tous les éléments doivent être placés');
    const order = r.order.map((x) => str(x, 400, 'élément'));
    const expected = [...p.elements].sort();
    if ([...order].sort().some((x, i) => x !== expected[i])) throw invalid('Éléments inconnus ou dupliqués');
    const positions = order.map((x, i) => x === p.elements[i]);
    return { correct: positions.every(Boolean), detail: { positions } };
  },

  input(p, r) {
    if (!isObj(r)) throw invalid('Réponse attendue : { text }');
    const text = str(r.text, 200, 'text');
    if (text.trim() === '') throw invalid('Réponse vide');
    const flags = p.normalisation && p.normalisation.length ? p.normalisation : [];
    const given = normalize(text, flags);
    return { correct: p.reponses_acceptees.some((a) => normalize(a, flags) === given), detail: {} };
  },

  // Auto-évaluation : le joueur s'engage (« je m'en souviens » / « pas encore ») AVANT de voir le verso.
  flashcard(p, r) {
    if (!isObj(r) || typeof r.known !== 'boolean') throw invalid('Réponse attendue : { known: true|false }');
    return { correct: r.known, detail: { known: r.known } };
  }
};

/** @returns {{correct: boolean, detail: object}} */
function grade(kind, payload, response) {
  const g = graders[kind];
  if (!g) throw new HttpError(400, 'UNSUPPORTED_KIND', `Type d'exercice non pris en charge : ${kind}`);
  return g(payload, response);
}

/** Ce qu'on révèle une fois la réponse définitive. */
function solution(kind, p) {
  switch (kind) {
    case 'mcq': return { choice: p.bonne, text: (p.choix.find((c) => c.id === p.bonne) || {}).texte };
    case 'truefalse': return { value: p.reponse };
    case 'cloze': return { answers: Object.fromEntries(p.trous.map((t) => [t.id, t.reponses_acceptees[0]])) };
    case 'match': return { pairs: p.paires.map((x) => ({ left: x.gauche, right: x.droite })) };
    case 'ordering': return { order: p.elements, criterion: p.critere_ordre };
    case 'input': return { text: p.reponse_modele };
    case 'flashcard': return { back: p.verso, mnemonic: p.mnemo || null };
    default: return {};
  }
}

/** Distracteurs : pourquoi un choix est faux (QCM) — révélé avec la correction. */
function choiceWhy(kind, p, choiceId) {
  if (kind !== 'mcq' || !choiceId) return null;
  const c = p.choix.find((x) => x.id === choiceId);
  return c && c.distracteur_pourquoi ? c.distracteur_pourquoi : null;
}

/** Projection publique d'un item (aucune solution, aucune explication, aucun indice). */
function publicItem(row) {
  const p = row.payload;
  const out = { key: row.key, kind: row.kind, difficulty: row.difficulty, isBoss: row.is_boss, prompt: p.consigne, context: p.enonce, hasHint: Boolean(p.indice) };
  switch (row.kind) {
    case 'mcq': out.choices = shuffle(p.choix).map((c) => ({ id: c.id, text: c.texte })); break;
    case 'truefalse': out.statement = p.affirmation; break;
    case 'cloze':
      out.text = p.texte;
      out.blanks = p.trous.map((t) => ({ id: t.id, bank: t.banque ? shuffle(t.banque) : null }));
      break;
    case 'match':
      out.left = p.paires.map((x) => x.gauche);
      out.right = shuffleDifferent(p.paires.map((x) => x.droite));
      break;
    case 'ordering': out.items = shuffleDifferent(p.elements); out.criterion = p.critere_ordre; break;
    case 'input': break;
    case 'flashcard': out.front = p.recto; break;
    default: break;
  }
  return out;
}

const SUPPORTED_KINDS = Object.keys(graders);

module.exports = { grade, solution, choiceWhy, publicItem, normalize, shuffle, shuffleDifferent, SUPPORTED_KINDS };
