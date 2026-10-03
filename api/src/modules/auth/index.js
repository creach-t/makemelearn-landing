'use strict';

const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');

const { safe } = require('../../lib/safe');
const { parse } = require('../../lib/validate');
const { HttpError } = require('../../lib/errors');
const { newToken, hashToken } = require('../../lib/tokens');
const { publicUser, toUser, USER_COLUMNS } = require('../../lib/auth');
const { track } = require('../../lib/analytics');
const logger = require('../../utils/logger');

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

const emailSchema = z.string().trim().toLowerCase().max(255).pipe(z.string().email('Adresse email invalide'));

const wantsJson = (req) => req.query.format === 'json' || /application\/json/.test(req.get('Accept') || '');

function magicLinkMail(link) {
  const text = [
    'Bonjour,',
    '',
    'Voici ton lien de connexion à MakeMeLearn (valable 15 minutes, utilisable une seule fois) :',
    link,
    '',
    "Si tu n'as pas demandé ce lien, ignore simplement ce message : rien ne se passera.",
    '',
    "L'équipe MakeMeLearn"
  ].join('\n');
  const html = `<p>Bonjour,</p><p>Voici ton lien de connexion à MakeMeLearn (valable 15 minutes, utilisable une seule fois) :</p><p><a href="${link}">Me connecter</a></p><p>Si tu n'as pas demandé ce lien, ignore simplement ce message : rien ne se passera.</p><p>L'équipe MakeMeLearn</p>`;
  return { subject: 'Ton lien de connexion MakeMeLearn', text, html };
}

function createAuthRouter({ db, env, mailer, auth, limiterBase }) {
  const router = express.Router();
  router.use(auth.csrfGuard);

  const guestLimiter = limiterBase(60 * 60 * 1000, 30, 'GUEST_LIMIT_EXCEEDED', 'Trop de sessions créées depuis cette IP.');
  const linkIpLimiter = limiterBase(60 * 60 * 1000, 10, 'MAGIC_LINK_LIMIT_EXCEEDED', 'Trop de liens demandés depuis cette IP, réessaie plus tard.');
  const emailKey = (req) => {
    const e = req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `mlk:${crypto.createHash('sha256').update(e).digest('hex')}`; // on ne garde pas l'e-mail en clair en mémoire
  };
  const linkEmailLimiter = require('express-rate-limit')({
    windowMs: MAGIC_LINK_TTL_MS,
    max: 3,
    keyGenerator: emailKey,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Trop de liens demandés pour cette adresse, réessaie dans quelques minutes.', code: 'MAGIC_LINK_LIMIT_EXCEEDED' })
  });
  const verifyLimiter = limiterBase(60 * 60 * 1000, 60, 'VERIFY_LIMIT_EXCEEDED', 'Trop de tentatives.');

  // POST /auth/guest : crée l'invité + pose le cookie (idempotent si le cookie est valide)
  router.post('/guest', guestLimiter, safe(async (req, res) => {
    if (req.user) return res.json({ user: publicUser(req.user) });
    const created = await db.query('INSERT INTO users (is_anonymous) VALUES (true) RETURNING ' + USER_COLUMNS);
    const user = toUser(created.rows[0]);
    const token = await auth.createSession(db, user.id, req.get('User-Agent'));
    auth.setSessionCookie(res, token);
    await track(db, user.id, 'guest_created');
    res.status(201).json({ user: publicUser(user) });
  }));

  // POST /auth/magic-link {email, ageDeclaration:true}
  // Compte e-mail réservé aux personnes déclarant avoir 15 ans ou plus : sinon on reste invité,
  // sans qu'aucune donnée personnelle (e-mail) ne soit lue, stockée, journalisée ni envoyée.
  const requireAgeDeclaration = (req, res, next) => {
    if (!req.body || req.body.ageDeclaration !== true) {
      return next(new HttpError(403, 'AGE_DECLARATION_REQUIRED',
        'La création d’un compte e-mail est réservée aux personnes de 15 ans ou plus. Tu peux continuer à jouer sans compte, sans donner aucune information personnelle.'));
    }
    return next();
  };
  router.post('/magic-link', linkIpLimiter, requireAgeDeclaration, linkEmailLimiter, safe(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }).passthrough(), req.body);
    const token = newToken();
    const upgradeUserId = req.user && req.user.isAnonymous ? req.user.id : null;
    await db.query(
      'INSERT INTO login_tokens (email, token_hash, upgrade_user_id, expires_at) VALUES ($1, $2, $3, $4)',
      [email, hashToken(token), upgradeUserId, new Date(Date.now() + MAGIC_LINK_TTL_MS)]
    );
    const mail = magicLinkMail(`${env.APP_URL}/api/v1/auth/verify?token=${token}`);
    try {
      await mailer.send({ to: email, ...mail });
    } catch (mailErr) {
      // Réponse identique quoi qu'il arrive (anti-énumération) ; l'échec est journalisé sans l'adresse.
      logger.error('Envoi du lien magique échoué', { error: mailErr.message, code: mailErr.code });
    }
    // 202 toujours identique, que le compte existe ou non
    res.status(202).json({ status: 'sent', message: 'Si cette adresse est valide, un lien de connexion vient d’être envoyé.' });
  }));

  // GET /auth/verify?token= : consomme le lien (usage unique, 15 min)
  router.get('/verify', verifyLimiter, safe(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const fail = () => {
      if (wantsJson(req)) throw new HttpError(400, 'INVALID_OR_EXPIRED_TOKEN', 'Lien invalide ou expiré');
      return res.redirect(302, `${env.APP_URL}/jouer/?connexion=erreur`);
    };
    if (token.length < 20 || token.length > 100) return fail();
    const now = new Date();

    const result = await db.tx(async (tx) => {
      // Consommation atomique : un seul appelant peut obtenir la ligne
      const consumed = await tx.query(
        'UPDATE login_tokens SET consumed_at = $2 WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2 RETURNING email, upgrade_user_id',
        [hashToken(token), now]
      );
      if (consumed.rows.length === 0) return null;
      const { email, upgrade_user_id: upgradeId } = consumed.rows[0];

      let user;
      let upgraded = false;
      const existing = await tx.query(`SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`, [email]);
      if (existing.rows.length > 0) {
        user = toUser(existing.rows[0]);
      } else {
        let promoted = null;
        if (upgradeId) {
          // Même user_id : la progression de l'invité est conservée
          promoted = await tx.query(
            `UPDATE users SET email = $2, email_verified_at = $3, is_anonymous = false, age_declared_15_at = $3
              WHERE id = $1 AND is_anonymous = true AND deleted_at IS NULL RETURNING ${USER_COLUMNS}`,
            [upgradeId, email, now]
          );
        }
        if (promoted && promoted.rows.length > 0) {
          user = toUser(promoted.rows[0]);
          upgraded = true;
        } else {
          const inserted = await tx.query(
            `INSERT INTO users (email, email_verified_at, is_anonymous, age_declared_15_at) VALUES ($1, $2, false, $2) RETURNING ${USER_COLUMNS}`,
            [email, now]
          );
          user = toUser(inserted.rows[0]);
        }
      }
      if (req.sessionToken) await auth.revokeSession(tx, req.sessionToken); // rotation de session
      const sessionToken = await auth.createSession(tx, user.id, req.get('User-Agent'));
      return { user, sessionToken, upgraded };
    });

    if (!result) return fail();
    auth.setSessionCookie(res, result.sessionToken);
    if (result.upgraded) await track(db, result.user.id, 'account_upgraded');
    if (wantsJson(req)) return res.json({ user: publicUser(result.user), upgraded: result.upgraded });
    return res.redirect(302, `${env.APP_URL}/jouer/?connexion=ok`);
  }));

  // POST /auth/logout : révoque la session courante
  router.post('/logout', safe(async (req, res) => {
    if (req.sessionToken) await auth.revokeSession(db, req.sessionToken);
    auth.clearSessionCookie(res);
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createAuthRouter };
