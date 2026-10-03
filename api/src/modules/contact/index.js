'use strict';

const express = require('express');
const { z } = require('zod');

const { safe } = require('../../lib/safe');
const { parse } = require('../../lib/validate');
const { HttpError } = require('../../lib/errors');
const logger = require('../../utils/logger');

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir entre 2 et 100 caractères').max(100),
  email: z.string().trim().toLowerCase().max(255).pipe(z.string().email('Adresse email invalide')),
  subject: z.string().trim().min(5, 'Le sujet doit contenir entre 5 et 200 caractères').max(200),
  message: z.string().trim().min(10, 'Le message doit contenir entre 10 et 5000 caractères').max(5000)
});

function renderContactMail({ name, email, subject, message }) {
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif">
<h2>Nouveau message de contact - MakeMeLearn</h2>
<p><strong>Nom :</strong> ${escapeHtml(name)}</p>
<p><strong>Email :</strong> ${escapeHtml(email)}</p>
<p><strong>Sujet :</strong> ${escapeHtml(subject)}</p>
<p><strong>Message :</strong></p>
<div style="white-space:pre-wrap;border:1px solid #e9ecef;padding:12px;border-radius:6px">${escapeHtml(message)}</div>
</body></html>`;
  const text = `Nouveau message de contact MakeMeLearn\n\nNom: ${name}\nEmail: ${email}\nSujet: ${subject}\n\nMessage:\n${message}`;
  return { html, text };
}

function createContactRouter({ env, mailer }) {
  const router = express.Router();

  // POST /contact
  router.post('/', safe(async (req, res) => {
    const data = parse(contactSchema, req.body);
    if (!mailer.configured) {
      throw new HttpError(503, 'EMAIL_SERVICE_UNAVAILABLE', 'Service email temporairement indisponible. Veuillez réessayer plus tard ou nous contacter directement.');
    }
    const { html, text } = renderContactMail(data);
    let result;
    try {
      result = await mailer.send({
        to: env.CONTACT_TO,
        replyTo: `"${data.name.replace(/["\r\n]/g, '')}" <${data.email}>`,
        subject: `[Contact] ${data.subject.replace(/[\r\n]+/g, ' ')}`,
        html,
        text
      });
    } catch (err) {
      logger.logError(err, { operation: 'contact_form' });
      throw new HttpError(502, 'CONTACT_ERROR', "Erreur lors de l'envoi du message");
    }
    logger.logBusiness('Contact form submission', { subject: data.subject });
    res.json({ success: true, message: 'Message envoyé avec succès', messageId: result.messageId, code: 'CONTACT_SUCCESS' });
  }));

  return router;
}

module.exports = { createContactRouter, renderContactMail };
