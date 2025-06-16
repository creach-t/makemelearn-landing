const express = require('express');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

const router = express.Router();

// ===== EMAIL CONFIGURATION =====
let emailService;

try {
  if (process.env.EMAIL_PROVIDER === 'sendgrid') {
    const sgMail = require('@sendgrid/mail');
    
    if (!process.env.SENDGRID_API_KEY) {
      logger.warn('SENDGRID_API_KEY not found. Contact form will not work properly.');
    } else {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      emailService = sgMail;
      logger.info('SendGrid email service initialized');
    }
  } else {
    const nodemailer = require('nodemailer');
    
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.warn('SMTP credentials not found. Contact form will not work properly.');
    } else {
      emailService = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      logger.info('SMTP email service initialized');
    }
  }
} catch (error) {
  logger.error('Email service initialization failed:', error.message);
}

// ===== EMAIL TEMPLATES =====
function generateContactEmailTemplate(data) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Nouveau message de contact - MakeMeLearn</title>
        <style>
            body { 
                font-family: 'Inter', Arial, sans-serif; 
                margin: 0; 
                padding: 0; 
                background-color: #f5f5f5;
            }
            .container { 
                max-width: 600px; 
                margin: 20px auto; 
                background: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header { 
                background: linear-gradient(120deg, #667eea, #764ba2); 
                color: white; 
                padding: 30px 20px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: 700;
            }
            .content { 
                padding: 30px 20px; 
                background: white;
            }
            .field {
                margin-bottom: 20px;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 6px;
                border-left: 4px solid #667eea;
            }
            .field-label {
                font-weight: 600;
                color: #333;
                margin-bottom: 5px;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .field-value {
                color: #555;
                line-height: 1.6;
                word-wrap: break-word;
            }
            .message-content {
                background: #fff;
                border: 1px solid #e9ecef;
                border-radius: 6px;
                padding: 20px;
                margin-top: 10px;
                white-space: pre-wrap;
                line-height: 1.7;
            }
            .footer { 
                padding: 20px; 
                text-align: center;
                font-size: 12px; 
                color: #666; 
                background: #f8f9fa;
                border-top: 1px solid #e9ecef;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📧 Nouveau message de contact</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">MakeMeLearn Landing Page</p>
            </div>
            <div class="content">
                <div class="field">
                    <div class="field-label">👤 Nom</div>
                    <div class="field-value">${data.name}</div>
                </div>
                
                <div class="field">
                    <div class="field-label">📧 Email</div>
                    <div class="field-value">
                        <a href="mailto:${data.email}" style="color: #667eea;">${data.email}</a>
                    </div>
                </div>
                
                <div class="field">
                    <div class="field-label">📝 Sujet</div>
                    <div class="field-value">${data.subject}</div>
                </div>
                
                <div class="field">
                    <div class="field-label">💬 Message</div>
                    <div class="message-content">${data.message}</div>
                </div>
            </div>
            <div class="footer">
                <p>Envoyé automatiquement depuis la landing page MakeMeLearn</p>
                <p>Répondre directement à cet email pour contacter l'expéditeur</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

// ===== EMAIL SENDING FUNCTION =====
async function sendContactEmail(data) {
  if (!emailService) {
    throw new Error('Service email non configuré. Veuillez configurer SENDGRID_API_KEY ou SMTP credentials.');
  }

  const emailHtml = generateContactEmailTemplate(data);
  
  if (process.env.EMAIL_PROVIDER === 'sendgrid') {
    const msg = {
      to: process.env.TO_EMAIL || 'hello@makemelearn.fr',
      from: {
        email: process.env.FROM_EMAIL || 'noreply@makemelearn.fr',
        name: 'MakeMeLearn Contact Form'
      },
      replyTo: {
        email: data.email,
        name: data.name
      },
      subject: `[Contact] ${data.subject}`,
      html: emailHtml,
      text: `Nouveau message de contact MakeMeLearn\n\nNom: ${data.name}\nEmail: ${data.email}\nSujet: ${data.subject}\n\nMessage:\n${data.message}`
    };
    
    await emailService.send(msg);
    return { messageId: 'sendgrid-' + Date.now() };
  } else {
    const result = await emailService.sendMail({
      from: `"MakeMeLearn Contact" <${process.env.FROM_EMAIL || 'noreply@makemelearn.fr'}>`,
      to: process.env.TO_EMAIL || 'hello@makemelearn.fr',
      replyTo: `"${data.name}" <${data.email}>`,
      subject: `[Contact] ${data.subject}`,
      html: emailHtml,
      text: `Nouveau message de contact MakeMeLearn\n\nNom: ${data.name}\nEmail: ${data.email}\nSujet: ${data.subject}\n\nMessage:\n${data.message}`
    });
    
    return { messageId: result.messageId };
  }
}

// ===== VALIDATION MIDDLEWARE =====
const contactValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères')
    .escape(),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Adresse email invalide'),
  body('subject')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Le sujet doit contenir entre 5 et 200 caractères')
    .escape(),
  body('message')
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Le message doit contenir entre 10 et 5000 caractères')
    .escape()
];

// ===== CONTACT FORM ENDPOINT =====
router.post('/', contactValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { name, email, subject, message, metadata } = req.body;
    
    // Send email
    const result = await sendContactEmail({
      name,
      email,
      subject,
      message,
      metadata
    });

    // Log successful contact
    logger.logBusiness('Contact form submission', {
      name,
      email,
      subject,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Message envoyé avec succès',
      messageId: result.messageId,
      code: 'CONTACT_SUCCESS'
    });

  } catch (error) {
    logger.logError(error, {
      operation: 'contact_form',
      name: req.body.name,
      email: req.body.email,
      ip: req.ip
    });
    
    let errorMessage = 'Erreur lors de l\'envoi du message';
    let errorCode = 'CONTACT_ERROR';
    
    if (error.message.includes('Service email non configuré')) {
      errorMessage = 'Service email temporairement indisponible. Veuillez réessayer plus tard ou nous contacter directement.';
      errorCode = 'EMAIL_SERVICE_UNAVAILABLE';
    } else if (error.message.includes('Invalid API key')) {
      errorMessage = 'Configuration email incorrecte. Veuillez contacter l\'administrateur.';
      errorCode = 'EMAIL_CONFIG_ERROR';
    } else if (error.message.includes('Authentication failed')) {
      errorMessage = 'Erreur d\'authentification email. Veuillez réessayer plus tard.';
      errorCode = 'EMAIL_AUTH_ERROR';
    }
    
    res.status(500).json({
      error: errorMessage,
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;