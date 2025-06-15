require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const db = require('./config/database');
const registrationRoutes = require('./routes/registrations');
const statsRoutes = require('./routes/stats');
const healthRoutes = require('./routes/health');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS sécurisée
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',')
      : ['https://makemelearn.fr', 'https://inscription.makemelearn.fr'];
    
    // Permettre les requêtes sans origin (ex: Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Non autorisé par la politique CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limite par IP
  message: {
    error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

// Rate limiting spécifique pour les inscriptions
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5, // Maximum 5 inscriptions par heure par IP
  message: {
    error: 'Trop d\'inscriptions depuis cette IP, veuillez réessayer plus tard.',
    code: 'REGISTRATION_LIMIT_EXCEEDED'
  },
  keyGenerator: (req) => {
    return `registration_${req.ip}`;
  }
});

// Middlewares de sécurité
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:"],
      connectSrc: ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging des requêtes
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(requestLogger);

// Rate limiting général
app.use(limiter);

// Headers personnalisés
app.use((req, res, next) => {
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Powered-By', 'MakeMeLearn');
  next();
});

// Routes principales - SANS préfixe /api car Traefik le supprime avec stripprefix
app.use('/health', healthRoutes);
app.use('/registrations', registrationLimiter, registrationRoutes);
app.use('/stats', statsRoutes);

// Route racine avec informations API
app.get('/', (req, res) => {
  res.json({
    name: 'MakeMeLearn API',
    version: '1.0.0',
    description: 'API pour la gestion des inscriptions anticipées',
    endpoints: {
      health: '/health',
      registrations: '/registrations',
      stats: '/stats'
    },
    documentation: 'https://makemelearn.fr/api-docs',
    support: 'hello@makemelearn.fr',
    note: 'Routes configurées pour Traefik stripprefix middleware'
  });
});

// Middleware de gestion des erreurs
app.use(notFoundHandler);
app.use(errorHandler);

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Démarrage du serveur
async function startServer() {
  try {
    // Test de la connexion à la base de données
    await db.testConnection();
    logger.info('Connexion à la base de données établie avec succès');

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Serveur MakeMeLearn API démarré sur le port ${PORT}`);
      logger.info(`🌍 Environnement: ${process.env.NODE_ENV}`);
      logger.info(`📊 Base de données: ${process.env.DATABASE_URL ? 'Configurée' : 'Non configurée'}`);
      logger.info(`🔒 CORS origins: ${process.env.CORS_ORIGIN || 'Défaut'}`);
      logger.info('📋 Routes configurées sans préfixe /api (Traefik stripprefix)');
    });
  } catch (error) {
    logger.error('Erreur lors du démarrage du serveur:', error);
    process.exit(1);
  }
}

// Gestion de l'arrêt propre du serveur
process.on('SIGTERM', () => {
  logger.info('SIGTERM reçu, arrêt du serveur...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT reçu, arrêt du serveur...');
  process.exit(0);
});

startServer();

module.exports = app;