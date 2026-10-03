'use strict';

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Mailer SMTP générique (nodemailer). Expéditeur par défaut : no-reply@makemelearn.fr.
 *  - SMTP_HOST défini            -> envoi réel.
 *  - sinon, hors production      -> le message (donc le lien magique) est LOGGÉ en console, rien n'est envoyé.
 *  - sinon (production sans SMTP) -> send() lève MAIL_NOT_CONFIGURED.
 * Les identifiants SMTP ne vivent que dans le .env du VPS (jamais dans le dépôt).
 */
function createMailer(env, { transport } = {}) {
  let tx = transport || null;
  const devLog = !tx && !env.SMTP_HOST && env.NODE_ENV !== 'production';

  if (!tx && env.SMTP_HOST) {
    tx = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
    });
  }

  return {
    from: env.MAIL_FROM,
    configured: Boolean(tx) || devLog,
    async send({ to, subject, text, html, replyTo }) {
      if (devLog) {
        // eslint-disable-next-line no-console
        console.log(`\n[mailer:dev] Mail non envoyé (pas de SMTP) -> ${to}\n  Sujet : ${subject}\n${text}\n`);
        return { messageId: `dev-${Date.now()}`, dev: true };
      }
      if (!tx) {
        const err = new Error('Service email non configuré (SMTP_HOST manquant)');
        err.code = 'MAIL_NOT_CONFIGURED';
        throw err;
      }
      const info = await tx.sendMail({ from: `"MakeMeLearn" <${env.MAIL_FROM}>`, to, subject, text, html, replyTo });
      logger.info('Email envoyé', { messageId: info.messageId });
      return { messageId: info.messageId };
    }
  };
}

module.exports = { createMailer };
