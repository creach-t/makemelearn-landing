const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE SETUP =====
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS Configuration
const corsOptions = {
  origin: [
    'https://creach-t.github.io',
    'https://makemelearn.fr',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
  ],
  credentials: false,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// ===== RATE LIMITING =====
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.RATE_LIMIT_CONTACT) || 5,
  message: {
    error: 'Trop de messages envoyés récemment. Veuillez patienter une heure avant de réessayer.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.RATE_LIMIT_SIGNUP) || 10,
  message: {
    error: 'Trop d\'inscriptions récentes. Veuillez patienter une heure avant de réessayer.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ===== EMAIL CONFIGURATION =====
let emailService;

try {
  if (process.env.EMAIL_PROVIDER === 'sendgrid') {
    const sgMail = require('@sendgrid/mail');
    
    if (!process.env.SENDGRID_API_KEY) {
      console.warn('⚠️  SENDGRID_API_KEY not found. Contact form will not work properly.');
    } else {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      emailService = sgMail;
      console.log('✅ SendGrid email service initialized');
    }
  } else {
    const nodemailer = require('nodemailer');
    
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('⚠️  SMTP credentials not found. Contact form will not work properly.');
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
      console.log('✅ SMTP email service initialized');
    }
  }
} catch (error) {
  console.error('❌ Email service initialization failed:', error.message);
  console.log('📧 Contact form will return errors until email is configured');
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
            .metadata {
                margin-top: 30px;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 6px;
                font-size: 12px;
                color: #666;
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
                
                ${data.metadata ? `
                <div class="metadata">
                    <strong>📊 Métadonnées :</strong><br>
                    Page: ${data.metadata.page || 'N/A'}<br>
                    Référent: ${data.metadata.referrer || 'Direct'}<br>
                    Timestamp: ${data.metadata.timestamp || new Date().toISOString()}<br>
                    User Agent: ${data.metadata.userAgent ? data.metadata.userAgent.substring(0, 100) + '...' : 'N/A'}
                </div>
                ` : ''}
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
      text: `
Nouveau message de contact MakeMeLearn

Nom: ${data.name}
Email: ${data.email}
Sujet: ${data.subject}

Message:
${data.message}

---
Envoyé depuis la landing page MakeMeLearn
      `
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
      text: `
Nouveau message de contact MakeMeLearn

Nom: ${data.name}
Email: ${data.email}
Sujet: ${data.subject}

Message:
${data.message}

---
Envoyé depuis la landing page MakeMeLearn
      `
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

const registrationValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Adresse email invalide')
];

// ===== API ROUTES =====

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    email_service: emailService ? 'configured' : 'not configured'
  });
});

// Contact form endpoint
app.post('/contact', contactLimiter, contactValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Données invalides',
        details: errors.array()
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

    // Log successful contact (you can save to database here)
    console.log(`[CONTACT] New message from ${name} (${email}) - Subject: ${subject}`);

    res.json({
      success: true,
      message: 'Message envoyé avec succès',
      messageId: result.messageId
    });

  } catch (error) {
    console.error('Contact form error:', error);
    
    let errorMessage = 'Erreur lors de l\'envoi du message';
    
    // Provide more specific error messages
    if (error.message.includes('Service email non configuré')) {
      errorMessage = 'Service email temporairement indisponible. Veuillez réessayer plus tard ou nous contacter directement.';
    } else if (error.message.includes('Invalid API key')) {
      errorMessage = 'Configuration email incorrecte. Veuillez contacter l\'administrateur.';
    } else if (error.message.includes('Authentication failed')) {
      errorMessage = 'Erreur d\'authentification email. Veuillez réessayer plus tard.';
    }
    
    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Newsletter signup endpoint (placeholder)
app.post('/registrations', signupLimiter, registrationValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Email invalide',
        details: errors.array()
      });
    }

    const { email, source, metadata } = req.body;
    
    // Here you would typically save to database
    // For now, just log and return success
    console.log(`[SIGNUP] New registration: ${email} from ${source}`);

    res.json({
      success: true,
      message: 'Inscription confirmée',
      email: email
    });

  } catch (error) {
    console.error('Signup error:', error);
    
    res.status(500).json({
      error: 'Erreur lors de l\'inscription',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Analytics tracking endpoint (placeholder)
app.post('/stats/track', async (req, res) => {
  try {
    const { event, value, metadata } = req.body;
    
    // Here you would typically save to analytics database
    console.log(`[ANALYTICS] Event: ${event}, Value: ${value}`);

    res.json({ success: true });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Erreur de tracking' });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint non trouvé' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Erreur serveur interne',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// ===== SERVER START =====
app.listen(PORT, () => {
  console.log(`🚀 MakeMeLearn API Server running on port ${PORT}`);
  console.log(`📧 Email provider: ${process.env.EMAIL_PROVIDER || 'nodemailer'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  if (!emailService) {
    console.log('⚠️  Warning: Email service not configured. Contact form will not work.');
    console.log('   Configure SENDGRID_API_KEY or SMTP credentials in .env file');
  }
});

module.exports = app;