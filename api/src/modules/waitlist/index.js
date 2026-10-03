'use strict';

const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const validator = require('validator');

const { safe } = require('../../lib/safe');
const { parse } = require('../../lib/validate');
const { HttpError } = require('../../lib/errors');
const { signValue, verifySigned } = require('../../lib/tokens');
const logger = require('../../utils/logger');

const SUSPICIOUS_DOMAINS = ['tempmail.com', '10minutemail.com', 'guerrillamail.com'];

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .pipe(z.string().email('Adresse email invalide'))
  .refine((v) => !SUSPICIOUS_DOMAINS.includes(v.split('@')[1]), 'Domaine email non autorisé');

const registrationSchema = z.object({
  email: emailSchema,
  source: z.enum(['landing_page', 'social_media', 'referral', 'blog', 'direct']).default('landing_page'),
  metadata: z.record(z.string(), z.unknown()).default({})
});

// Les stats ne doivent jamais faire échouer la requête principale.
const incrementStat = async (db, metric) => {
  try {
    await db.query('SELECT increment_stat($1, $2)', [metric, 1]);
  } catch (e) {
    logger.warn('increment_stat échoué', { metric, error: e.message });
  }
};

/** Jeton de désinscription signé (HMAC-SHA256 de l'e-mail) : à placer dans les liens des futurs e-mails. */
const unsubscribeToken = (secret, email) => signValue(secret, `unsubscribe:${String(email).toLowerCase()}`);

function createWaitlistRouter({ db, env }) {
  const router = express.Router();

  // POST /waitlist (alias historique : POST /registrations)
  router.post('/', safe(async (req, res) => {
    const { email, source, metadata } = parse(registrationSchema, req.body);

    const existing = await db.query('SELECT id, is_verified FROM registrations WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      if (!user.is_verified) {
        await db.query('UPDATE registrations SET verification_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [crypto.randomUUID(), user.id]);
        await incrementStat(db, 'verification_resent');
        return res.status(200).json({ message: 'Email de vérification renvoyé', code: 'VERIFICATION_RESENT' });
      }
      return res.status(409).json({ error: 'Cette adresse email est déjà inscrite', code: 'EMAIL_ALREADY_EXISTS' });
    }

    const enriched = {
      ...metadata,
      registrationIp: req.ip,
      registrationUserAgent: req.get('User-Agent'),
      registrationTime: new Date().toISOString()
    };
    const result = await db.query(
      `INSERT INTO registrations (email, source, metadata, verification_token)
       VALUES ($1, $2, $3, $4) RETURNING id, email, created_at, source`,
      [email, source, JSON.stringify(enriched), crypto.randomUUID()]
    );
    const row = result.rows[0];
    await incrementStat(db, 'signup_success');
    await incrementStat(db, `signup_source_${source}`);
    logger.logBusiness('New registration created', { userId: row.id, source });

    res.status(201).json({
      message: 'Inscription réussie ! Merci de nous rejoindre.',
      data: { id: row.id, email: row.email, createdAt: row.created_at, source: row.source },
      code: 'REGISTRATION_SUCCESS'
    });
  }));

  // GET /waitlist/verify/:token
  router.get('/verify/:token', safe(async (req, res) => {
    const { token } = req.params;
    if (!validator.isUUID(token)) {
      throw new HttpError(400, 'INVALID_TOKEN', 'Token de vérification invalide');
    }
    const result = await db.query(
      `UPDATE registrations SET is_verified = true, verification_token = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE verification_token = $1 AND is_verified = false RETURNING id, email`,
      [token]
    );
    if (result.rows.length === 0) {
      throw new HttpError(404, 'TOKEN_NOT_FOUND', 'Token de vérification invalide ou expiré');
    }
    await incrementStat(db, 'email_verified');
    res.json({
      message: 'Email vérifié avec succès !',
      data: { id: result.rows[0].id, email: result.rows[0].email, verifiedAt: new Date().toISOString() },
      code: 'VERIFICATION_SUCCESS'
    });
  }));

  // POST /waitlist/resend-verification : réponse neutre (pas d'énumération des e-mails inscrits)
  router.post('/resend-verification', safe(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const found = await db.query('SELECT id, is_verified FROM registrations WHERE email = $1', [email]);
    if (found.rows.length > 0 && !found.rows[0].is_verified) {
      await db.query('UPDATE registrations SET verification_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [crypto.randomUUID(), found.rows[0].id]);
      await incrementStat(db, 'verification_resent');
    }
    res.json({ message: 'Si cette adresse est inscrite et non vérifiée, un email a été renvoyé', code: 'VERIFICATION_RESENT' });
  }));

  // DELETE /waitlist/unsubscribe/:email?token=<HMAC> : le jeton signé est obligatoire
  router.delete('/unsubscribe/:email', safe(async (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    if (!validator.isEmail(email)) {
      throw new HttpError(400, 'INVALID_EMAIL', 'Email invalide');
    }
    if (!verifySigned(env.SESSION_SECRET, `unsubscribe:${email}`, req.query.token)) {
      throw new HttpError(403, 'INVALID_TOKEN', 'Lien de désinscription invalide');
    }
    await db.query(
      `UPDATE registrations SET unsubscribed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE email = $1 AND unsubscribed_at IS NULL`,
      [email]
    );
    await incrementStat(db, 'unsubscribed');
    res.json({ message: 'Désabonnement réussi', code: 'UNSUBSCRIBE_SUCCESS' });
  }));

  return router;
}

module.exports = { createWaitlistRouter, unsubscribeToken };
