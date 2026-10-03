'use strict';

const { grade, solution, publicItem, normalize } = require('../src/lib/grading');
const { PILOT, correctResponse, wrongResponse } = require('./helpers/game');
const { TYPE_TO_KIND } = require('../src/lib/content');

const byType = (type) => [...PILOT.items.values()].find((i) => i.type === type);
const rowOf = (key, item) => ({ key, kind: TYPE_TO_KIND[item.type], difficulty: item.difficulte, is_boss: item.boss === true, payload: item });

describe('correction serveur (un correcteur par type)', () => {
  test.each(['qcm', 'vrai_faux', 'trous', 'appariement', 'ordre', 'saisie', 'flashcard'])('%s : bonne réponse acceptée, mauvaise refusée', (type) => {
    const item = byType(type);
    const kind = TYPE_TO_KIND[type];
    expect(grade(kind, item, correctResponse(item)).correct).toBe(true);
    expect(grade(kind, item, wrongResponse(item)).correct).toBe(false);
  });

  test('tous les items du pilote : correct accepté / faux refusé', () => {
    for (const [key, item] of PILOT.items) {
      const kind = TYPE_TO_KIND[item.type];
      expect({ key, ok: grade(kind, item, correctResponse(item)).correct }).toEqual({ key, ok: true });
      expect({ key, ok: grade(kind, item, wrongResponse(item)).correct }).toEqual({ key, ok: false });
    }
  });

  test('QCM : choix inconnu ou forme invalide -> 400 INVALID_RESPONSE', () => {
    const item = byType('qcm');
    for (const bad of [{ choice: 'Z' }, {}, null, 'A', { choice: 3 }, { choice: 'ABCDEFG' }]) {
      expect(() => grade('mcq', item, bad)).toThrow(expect.objectContaining({ status: 400, code: 'INVALID_RESPONSE' }));
    }
  });

  test('vrai/faux : un booléen est exigé', () => {
    const item = byType('vrai_faux');
    expect(() => grade('truefalse', item, { value: 'true' })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    expect(grade('truefalse', item, { value: item.reponse }).correct).toBe(true);
  });

  test('trous : insensible à la casse, aux accents et aux espaces ; détail par trou ; réponse vide refusée', () => {
    const item = byType('trous');
    const [t1, t2] = item.trous;
    const sloppy = { answers: { [t1.id]: `  ${t1.reponses_acceptees[0].toUpperCase()}  `, [t2.id]: t2.reponses_acceptees[0].normalize('NFD').replace(/\p{M}/gu, '') } };
    expect(grade('cloze', item, sloppy).correct).toBe(true);
    const partial = grade('cloze', item, { answers: { [t1.id]: t1.reponses_acceptees[0], [t2.id]: 'nimportequoi' } });
    expect(partial.correct).toBe(false);
    expect(partial.detail.blanks).toEqual({ [t1.id]: true, [t2.id]: false });
    expect(() => grade('cloze', item, { answers: {} })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
  });

  test('appariement : doit être complet et sans doublon ; détail par paire', () => {
    const item = byType('appariement');
    const good = correctResponse(item).pairs;
    expect(() => grade('match', item, { pairs: good.slice(1) })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    expect(() => grade('match', item, { pairs: [good[0], ...good.slice(0, -1)] })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    expect(() => grade('match', item, { pairs: good.map((p) => ({ ...p, right: 'inconnu' })) })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    // on échange deux paires : tout est bien formé mais 2 paires sont fausses
    const swapped = good.map((p, i) => ({ ...p, right: good[i === 0 ? 1 : i === 1 ? 0 : i].right }));
    const res = grade('match', item, { pairs: swapped });
    expect(res.correct).toBe(false);
    expect(res.detail.pairs.filter((p) => p.correct)).toHaveLength(good.length - 2);
  });

  test('ordre : permutation exigée ; détail par position', () => {
    const item = byType('ordre');
    expect(() => grade('ordering', item, { order: item.elements.slice(1) })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    expect(() => grade('ordering', item, { order: [...item.elements.slice(1), 'intrus'] })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    const res = grade('ordering', item, { order: [item.elements[1], item.elements[0], ...item.elements.slice(2)] });
    expect(res.correct).toBe(false);
    expect(res.detail.positions.slice(0, 2)).toEqual([false, false]);
  });

  test('saisie : normalisation déclarée par l’item, réponse vide refusée', () => {
    const item = byType('saisie');
    expect(grade('input', item, { text: `  ${item.reponses_acceptees[0].toUpperCase()}  ` }).correct).toBe(true);
    expect(() => grade('input', item, { text: '   ' })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    expect(() => grade('input', item, { text: 'x'.repeat(500) })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
  });

  test('flashcard : auto-évaluation { known }', () => {
    const item = byType('flashcard');
    expect(grade('flashcard', item, { known: true }).correct).toBe(true);
    expect(grade('flashcard', item, { known: false }).correct).toBe(false);
    expect(() => grade('flashcard', item, { known: 'oui' })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
  });

  test('le type code n’est pas pris en charge', () => {
    expect(() => grade('code', {}, {})).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_KIND' }));
  });

  test('normalize : casse, accents, apostrophes typographiques, espaces insécables', () => {
    expect(normalize('  L’Effet  de HALO ', ['casse', 'accents', 'espaces'])).toBe("l'effet de halo");
    expect(normalize('Été', [])).toBe('Été');
  });
});

describe('projection publique : aucune solution avant la réponse', () => {
  test('aucun item ne laisse fuiter de réponse, d’explication, de source ni d’indice', () => {
    for (const [key, item] of PILOT.items) {
      const pub = publicItem(rowOf(key, item));
      const json = JSON.stringify(pub);
      for (const forbidden of ['bonne', 'feedback_ok', 'feedback_ko', 'distracteur_pourquoi', 'reponses_acceptees', 'reponse_modele', 'sources', 'indice', 'solution', 'verso', 'mnemo']) {
        expect({ key, leak: json.includes(`"${forbidden}"`) }).toEqual({ key, leak: false });
      }
      expect(json.includes(item.feedback_ok)).toBe(false);
      expect(json.includes(item.feedback_ko)).toBe(false);
      if (item.indice) expect(json.includes(item.indice)).toBe(false);
      if (item.type === 'vrai_faux') expect(pub).not.toHaveProperty('value');
      if (item.type === 'flashcard') expect(json.includes(item.verso)).toBe(false);
      if (item.type === 'saisie') for (const a of item.reponses_acceptees) expect(json.toLowerCase().includes(`"${a.toLowerCase()}"`)).toBe(false);
      expect(pub.kind).toBe(TYPE_TO_KIND[item.type]);
    }
  });

  test('QCM : choix sans indication de justesse ; appariement et ordre mélangés', () => {
    const q = publicItem(rowOf('k', byType('qcm')));
    expect(q.choices.every((c) => Object.keys(c).sort().join() === 'id,text')).toBe(true);
    const o = byType('ordre');
    for (let i = 0; i < 10; i++) expect(publicItem(rowOf('k', o)).items).not.toEqual(o.elements);
    const m = byType('appariement');
    const pm = publicItem(rowOf('k', m));
    expect([...pm.right].sort()).toEqual(m.paires.map((p) => p.droite).sort());
  });

  test('solution() révèle ce qu’il faut une fois la réponse définitive', () => {
    const q = byType('qcm');
    expect(solution('mcq', q).choice).toBe(q.bonne);
    const f = byType('flashcard');
    expect(solution('flashcard', f).back).toBe(f.verso);
  });
});
