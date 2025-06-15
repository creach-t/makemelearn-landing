const logger = require('../utils/logger');

// Middleware pour gérer les routes non trouvées
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route non trouvée: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  error.code = 'ROUTE_NOT_FOUND';
  
  logger.logSecurity('Route not found accessed', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  next(error);
};

// Middleware de gestion d'erreurs global
const errorHandler = (error, req, res, next) => {
  // Si les headers ont déjà été envoyés, déléguer à Express
  if (res.headersSent) {
    return next(error);
  }

  // Statut par défaut
  const status = error.status || error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';
  
  // Structure de base de la réponse d'erreur
  const errorResponse = {
    error: error.message || 'Erreur interne du serveur',
    code,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  // En développement, inclure la stack trace
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.details = error.details || null;
  }

  // Log selon le niveau d'erreur
  const logData = {
    status,
    code,
    message: error.message,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    stack: error.stack
  };

  if (status >= 500) {
    // Erreurs serveur
    logger.error('Server Error', logData);
  } else if (status >= 400) {
    // Erreurs client
    logger.warn('Client Error', logData);
  } else {
    // Autres erreurs
    logger.info('Request Error', logData);
  }

  // Gestion spécifique selon le type d'erreur
  switch (error.name) {
    case 'ValidationError':
      errorResponse.error = 'Données de validation invalides';
      errorResponse.details = error.details;
      break;
      
    case 'UnauthorizedError':
      errorResponse.error = 'Accès non autorisé';
      break;
      
    case 'CastError':
      errorResponse.error = 'Format de données invalide';
      break;
      
    case 'MongoError':
    case 'PostgresError':
      errorResponse.error = 'Erreur de base de données';
      // Ne pas exposer les détails de la DB en production
      if (process.env.NODE_ENV === 'development') {
        errorResponse.details = error.message;
      }
      break;
      
    case 'MulterError':
      errorResponse.error = 'Erreur de téléchargement de fichier';
      if (error.code === 'LIMIT_FILE_SIZE') {
        errorResponse.error = 'Fichier trop volumineux';
      }
      break;
      
    case 'JsonWebTokenError':
      errorResponse.error = 'Token invalide';
      break;
      
    case 'TokenExpiredError':
      errorResponse.error = 'Token expiré';
      break;
      
    case 'SyntaxError':
      if (error.message.includes('JSON')) {
        errorResponse.error = 'Format JSON invalide';
      }
      break;
  }

  // Gestion des erreurs PostgreSQL spécifiques
  if (error.code && typeof error.code === 'string') {
    switch (error.code) {
      case '23505': // unique_violation
        errorResponse.error = 'Cette donnée existe déjà';
        errorResponse.code = 'DUPLICATE_ENTRY';
        break;
        
      case '23503': // foreign_key_violation
        errorResponse.error = 'Référence de données invalide';
        errorResponse.code = 'INVALID_REFERENCE';
        break;
        
      case '23514': // check_violation
        errorResponse.error = 'Contrainte de données violée';
        errorResponse.code = 'CONSTRAINT_VIOLATION';
        break;
        
      case '08006': // connection_failure
        errorResponse.error = 'Problème de connexion à la base de données';
        errorResponse.code = 'DATABASE_CONNECTION_ERROR';
        break;
    }
  }

  // Headers de sécurité pour les erreurs
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });

  // Envoyer la réponse d'erreur
  res.status(status).json(errorResponse);
};

// Middleware pour capturer les erreurs async
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Middleware pour les erreurs de rate limiting
const rateLimitErrorHandler = (req, res, next) => {
  const error = new Error('Trop de requêtes depuis cette adresse IP');
  error.status = 429;
  error.code = 'RATE_LIMIT_EXCEEDED';
  
  logger.logSecurity('Rate limit exceeded', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.originalUrl
  });
  
  next(error);
};

// Middleware pour valider les types de contenu
const validateContentType = (allowedTypes = ['application/json']) => {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next();
    }
    
    const contentType = req.get('Content-Type');
    if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
      const error = new Error('Type de contenu non supporté');
      error.status = 415;
      error.code = 'UNSUPPORTED_MEDIA_TYPE';
      return next(error);
    }
    
    next();
  };
};

// Middleware pour valider la taille du body
const validateBodySize = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.get('Content-Length');
    if (contentLength && parseInt(contentLength) > parseSize(maxSize)) {
      const error = new Error('Contenu trop volumineux');
      error.status = 413;
      error.code = 'PAYLOAD_TOO_LARGE';
      return next(error);
    }
    
    next();
  };
};

// Fonction utilitaire pour parser les tailles
function parseSize(size) {
  if (typeof size === 'number') return size;
  
  const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * units[unit]);
}

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncHandler,
  rateLimitErrorHandler,
  validateContentType,
  validateBodySize
};