'use strict';

const crypto = require('crypto');

// Jeton opaque 256 bits (base64url). Seul le hash SHA-256 est stocké en base.
const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest();

// Jeton signé HMAC (désinscription waitlist) : lié à l'e-mail, vérifié à temps constant.
const signValue = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
function verifySigned(secret, value, signature) {
  const a = Buffer.from(signValue(secret, value));
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { newToken, hashToken, signValue, verifySigned };
