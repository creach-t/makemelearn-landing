import { createMcq, createTrueFalse } from './choice.js';
import { createCloze, createInput } from './fill.js';
import { createMatch, createOrdering } from './arrange.js';
import { createFlashcard } from './flashcard.js';

// Un exercice par type servi par l'API : mcq, truefalse, cloze, match, ordering, input, flashcard.
// Contrat : { el, inline, ready(), response(), lock(), focus(), key(e), reveal(result) }.
const FACTORIES = {
    mcq: createMcq,
    truefalse: createTrueFalse,
    cloze: createCloze,
    match: createMatch,
    ordering: createOrdering,
    input: createInput,
    flashcard: createFlashcard
};

export const KIND_LABEL = {
    mcq: 'Question à choix',
    truefalse: 'Vrai ou faux',
    cloze: 'Texte à trous',
    match: 'Association',
    ordering: 'Remets dans l’ordre',
    input: 'Réponse libre',
    flashcard: 'Carte mémo'
};

export function createExercise(item, ctx) {
    const factory = FACTORIES[item.kind];
    if (!factory) throw new Error(`Type d’exercice non pris en charge : ${item.kind}`);
    return factory(item, ctx);
}
