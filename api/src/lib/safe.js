'use strict';

// Express 4 n'attrape pas les rejets des handlers async : TOUTE route async passe par safe().
// scripts/check-safe.mjs échoue en CI si une route async n'est pas enveloppée.
const safe = (fn) => (req, res, next) =>
  Promise.resolve().then(() => fn(req, res, next)).catch(next);

module.exports = { safe };
