'use strict';

const { HttpError } = require('./errors');

// Valide une valeur avec un schéma zod ; lève HttpError 400 VALIDATION_ERROR sinon.
function parse(schema, value) {
  const result = schema.safeParse(value === undefined ? {} : value);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'VALIDATION_ERROR', 'Données invalides', details);
  }
  return result.data;
}

module.exports = { parse };
