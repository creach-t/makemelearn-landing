'use strict';

// Erreur HTTP applicative : interceptée par errorHandler (statut + code stable).
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const badRequest = (code, message, details) => new HttpError(400, code, message, details);
const unauthorized = (message = 'Authentification requise') => new HttpError(401, 'AUTH_REQUIRED', message);
const forbidden = (code, message) => new HttpError(403, code, message);
const notFound = (code = 'NOT_FOUND', message = 'Ressource introuvable') => new HttpError(404, code, message);
const conflict = (code, message) => new HttpError(409, code, message);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
