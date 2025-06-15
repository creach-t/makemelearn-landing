const express = require('express');
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const logger = require('../utils/logger');
// const { sendVerificationEmail } = require('../utils/email'); // À implémenter

const router = express.Router();

// Validation des données d'inscription
const validateRegistration = [
  body('email')
    .isEmail()
    .withMessage('Adresse email invalide')
    .normalizeEmail()
    .custom(async (value) => {
      // Vérification des domaines suspects
      const suspiciousDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com'];
      const domain = value.split('@')[1];
      
      if (suspiciousDomains.includes(domain)) {
        throw new Error('Domaine email non autorisé');
      }
      
      return true;
    }),
  
  body('source')
    .optional()
    .isIn(['landing_page', 'social_media', 'referral', 'blog', 'direct'])
    .withMessage('Source invalide'),
    
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Métadonnées doivent être un objet')
];

// POST /registrations - Créer une nouvelle inscription
router.post('/', validateRegistration, async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Vérification des erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.logSecurity('Invalid registration attempt', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        errors: errors.array()
      });
      
      return res.status(400).json({
        error: 'Données invalides',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { email, source = 'landing_page', metadata = {} } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    // Vérifier si l'email existe déjà
    const existingUser = await db.query(
      'SELECT id, email, created_at, is_verified FROM registrations WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      
      logger.logBusiness('Duplicate registration attempt', {
        email,
        ip,
        existingUserCreated: user.created_at,
        isVerified: user.is_verified
      });

      // Si l'utilisateur existe mais n'est pas vérifié, renvoyer un email de vérification
      if (!user.is_verified) {
        await resendVerificationEmail(user.id, email);
        
        return res.status(200).json({
          message: 'Email de vérification renvoyé',
          code: 'VERIFICATION_RESENT'
        });
      }

      return res.status(409).json({
        error: 'Cette adresse email est déjà inscrite',
        code: 'EMAIL_ALREADY_EXISTS'
      });
    }

    // Générer un token de vérification
    const verificationToken = uuidv4();
    
    // Métadonnées enrichies avec les informations de la requête
    const enhancedMetadata = {
      ...metadata,
      registrationIp: ip,
      registrationUserAgent: userAgent,
      registrationTime: new Date().toISOString()
    };

    // Insérer la nouvelle inscription - REQUÊTE CORRIGÉE POUR LE SCHÉMA
    const result = await db.query(`
      INSERT INTO registrations (email, source, metadata, verification_token)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, created_at, source
    `, [email, source, JSON.stringify(enhancedMetadata), verificationToken]);

    const newUser = result.rows[0];

    // TODO: Envoyer l'email de vérification (async, ne pas attendre)
    // sendVerificationEmail(email, verificationToken).catch(error => {
    //   logger.error('Erreur envoi email de vérification:', {
    //     userId: newUser.id,
    //     email,
    //     error: error.message
    //   });
    // });

    // Incrémenter les statistiques
    await Promise.all([
      db.incrementStat('signup_success'),
      db.incrementStat('signup_attempts'),
      db.incrementStat(`signup_source_${source}`)
    ]);

    const responseTime = Date.now() - startTime;
    logger.logBusiness('New registration created', {
      userId: newUser.id,
      email,
      source,
      ip,
      responseTime: `${responseTime}ms`
    });

    res.status(201).json({
      message: 'Inscription réussie ! Merci de nous rejoindre.',
      data: {
        id: newUser.id,
        email: newUser.email,
        createdAt: newUser.created_at,
        source: newUser.source
      },
      code: 'REGISTRATION_SUCCESS'
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.logError(error, {
      operation: 'registration_create',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      body: { ...req.body, email: req.body.email ? '[REDACTED]' : undefined },
      responseTime: `${responseTime}ms`
    });

    res.status(500).json({
      error: 'Erreur interne du serveur',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /registrations/verify/:token - Vérifier un email
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || !validator.isUUID(token)) {
      return res.status(400).json({
        error: 'Token de vérification invalide',
        code: 'INVALID_TOKEN'
      });
    }

    // Rechercher l'utilisateur avec ce token
    const result = await db.query(`
      UPDATE registrations 
      SET is_verified = true, verification_token = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE verification_token = $1 AND is_verified = false
      RETURNING id, email, created_at
    `, [token]);

    if (result.rows.length === 0) {
      logger.logSecurity('Invalid verification attempt', {
        token,
        ip: req.ip
      });

      return res.status(404).json({
        error: 'Token de vérification invalide ou expiré',
        code: 'TOKEN_NOT_FOUND'
      });
    }

    const user = result.rows[0];

    // Incrémenter les statistiques
    await db.incrementStat('email_verified');

    logger.logBusiness('Email verified', {
      userId: user.id,
      email: user.email,
      ip: req.ip
    });

    res.json({
      message: 'Email vérifié avec succès !',
      data: {
        id: user.id,
        email: user.email,
        verifiedAt: new Date().toISOString()
      },
      code: 'VERIFICATION_SUCCESS'
    });

  } catch (error) {
    logger.logError(error, {
      operation: 'email_verification',
      token: req.params.token,
      ip: req.ip
    });

    res.status(500).json({
      error: 'Erreur interne du serveur',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /registrations/resend-verification - Renvoyer un email de vérification
router.post('/resend-verification', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Email invalide',
        code: 'VALIDATION_ERROR'
      });
    }

    const { email } = req.body;

    const result = await db.query(
      'SELECT id, is_verified FROM registrations WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Aucune inscription trouvée avec cet email',
        code: 'EMAIL_NOT_FOUND'
      });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({
        error: 'Cet email est déjà vérifié',
        code: 'ALREADY_VERIFIED'
      });
    }

    await resendVerificationEmail(user.id, email);

    logger.logBusiness('Verification email resent', {
      userId: user.id,
      email,
      ip: req.ip
    });

    res.json({
      message: 'Email de vérification renvoyé',
      code: 'VERIFICATION_RESENT'
    });

  } catch (error) {
    logger.logError(error, {
      operation: 'resend_verification',
      email: req.body.email,
      ip: req.ip
    });

    res.status(500).json({
      error: 'Erreur interne du serveur',
      code: 'INTERNAL_ERROR'
    });
  }
});

// DELETE /registrations/unsubscribe/:email - Se désinscrire
router.delete('/unsubscribe/:email', async (req, res) => {
  try {
    const email = validator.normalizeEmail(req.params.email);

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        error: 'Email invalide',
        code: 'INVALID_EMAIL'
      });
    }

    const result = await db.query(`
      UPDATE registrations 
      SET unsubscribed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE email = $1 AND unsubscribed_at IS NULL
      RETURNING id, email
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Aucune inscription trouvée ou déjà désabonnée',
        code: 'NOT_FOUND_OR_UNSUBSCRIBED'
      });
    }

    const user = result.rows[0];

    await db.incrementStat('unsubscribed');

    logger.logBusiness('User unsubscribed', {
      userId: user.id,
      email: user.email,
      ip: req.ip
    });

    res.json({
      message: 'Désabonnement réussi',
      code: 'UNSUBSCRIBE_SUCCESS'
    });

  } catch (error) {
    logger.logError(error, {
      operation: 'unsubscribe',
      email: req.params.email,
      ip: req.ip
    });

    res.status(500).json({
      error: 'Erreur interne du serveur',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Fonction utilitaire pour renvoyer un email de vérification
async function resendVerificationEmail(userId, email) {
  const newToken = uuidv4();
  
  await db.query(`
    UPDATE registrations 
    SET verification_token = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [newToken, userId]);

  // TODO: Implémenter l'envoi d'email
  // await sendVerificationEmail(email, newToken);
  await db.incrementStat('verification_resent');
}

module.exports = router;