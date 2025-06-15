const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Middleware pour logger les requêtes avec ID unique
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = uuidv4();
  
  // Ajouter l'ID de requête aux headers et au request
  req.requestId = requestId;
  res.set('X-Request-ID', requestId);
  
  // Extraire les informations de la requête
  const requestInfo = {
    requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: getClientIp(req),
    userAgent: req.get('User-Agent') || 'Unknown',
    referer: req.get('Referer'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    acceptLanguage: req.get('Accept-Language'),
    timestamp: new Date().toISOString()
  };
  
  // Logger le début de la requête
  logger.http('Request started', requestInfo);
  
  // Intercepter la fin de la réponse
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Informations de la réponse
    const responseInfo = {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentType: res.get('Content-Type'),
      contentLength: res.get('Content-Length') || (data ? data.length : 0),
      ip: requestInfo.ip
    };
    
    // Logger selon le status code
    if (res.statusCode >= 500) {
      logger.error('Request completed with server error', responseInfo);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', responseInfo);
    } else {
      logger.http('Request completed successfully', responseInfo);
    }
    
    // Logging spécial pour les requêtes lentes
    if (responseTime > 1000) {
      logger.warn('Slow request detected', {
        ...responseInfo,
        performance: 'slow',
        threshold: '1000ms'
      });
    }
    
    // Appeler la méthode originale
    originalSend.call(this, data);
  };
  
  // Intercepter les erreurs de connexion
  req.on('aborted', () => {
    const responseTime = Date.now() - startTime;
    logger.warn('Request aborted by client', {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      responseTime: `${responseTime}ms`,
      ip: requestInfo.ip,
      reason: 'client_aborted'
    });
  });
  
  res.on('close', () => {
    if (!res.headersSent) {
      const responseTime = Date.now() - startTime;
      logger.warn('Response closed before completion', {
        requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        responseTime: `${responseTime}ms`,
        ip: requestInfo.ip,
        reason: 'connection_closed'
      });
    }
  });
  
  next();
};

// Middleware pour logger les informations de sécurité
const securityLogger = (req, res, next) => {
  const securityInfo = {
    requestId: req.requestId,
    ip: getClientIp(req),
    userAgent: req.get('User-Agent'),
    url: req.originalUrl,
    method: req.method
  };
  
  // Détecter les tentatives d'attaque courantes
  const suspiciousPatterns = [
    /\.\.\//,  // Path traversal
    /<script/i, // XSS
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript injection
    /vbscript:/i, // VBScript injection
    /onload=/i, // Event handler injection
    /eval\(/i, // Code injection
    /expression\(/i, // CSS expression injection
  ];
  
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const bodyString = JSON.stringify(req.body || {});
  
  // Vérifier les patterns suspects
  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(req.url) || 
    pattern.test(queryString) || 
    pattern.test(bodyString)
  );
  
  if (isSuspicious) {
    logger.logSecurity('Suspicious request detected', {
      ...securityInfo,
      reason: 'malicious_pattern',
      query: queryString,
      body: req.body ? '[BODY_PRESENT]' : '[NO_BODY]'
    });
  }
  
  // Détecter les user agents suspects
  const suspiciousUserAgents = [
    /bot/i,
    /crawl/i,
    /spider/i,
    /scan/i,
    /hack/i,
    /exploit/i,
    /attack/i
  ];
  
  const userAgent = req.get('User-Agent') || '';
  const isSuspiciousUA = suspiciousUserAgents.some(pattern => pattern.test(userAgent));
  
  if (isSuspiciousUA && !userAgent.includes('Googlebot') && !userAgent.includes('Bingbot')) {
    logger.logSecurity('Suspicious user agent detected', {
      ...securityInfo,
      reason: 'suspicious_user_agent',
      userAgent
    });
  }
  
  // Détecter les tentatives de brute force (trop de requêtes POST rapidement)
  if (req.method === 'POST') {
    const ip = getClientIp(req);
    if (!global.requestCounts) global.requestCounts = new Map();
    
    const now = Date.now();
    const key = `${ip}_${Math.floor(now / 60000)}`; // Par minute
    const count = (global.requestCounts.get(key) || 0) + 1;
    
    global.requestCounts.set(key, count);
    
    // Nettoyer les anciennes entrées
    for (const [k, v] of global.requestCounts.entries()) {
      if (k.split('_')[1] < Math.floor(now / 60000) - 5) {
        global.requestCounts.delete(k);
      }
    }
    
    if (count > 20) { // Plus de 20 POST par minute
      logger.logSecurity('Potential brute force attempt', {
        ...securityInfo,
        reason: 'excessive_post_requests',
        requestsPerMinute: count
      });
    }
  }
  
  next();
};

// Middleware pour logger les erreurs de validation
const validationLogger = (errors, req, res, next) => {
  if (errors && errors.length > 0) {
    logger.warn('Validation errors in request', {
      requestId: req.requestId,
      url: req.originalUrl,
      method: req.method,
      ip: getClientIp(req),
      errors: errors.map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// Middleware pour logger les métriques de performance
const performanceLogger = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convertir en millisecondes
    
    // Logger les métriques de performance
    logger.logPerformance('Request processed', duration, {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      memoryUsage: process.memoryUsage().used,
      cpuUsage: process.cpuUsage()
    });
  });
  
  next();
};

// Fonction utilitaire pour extraire l'IP réelle du client
function getClientIp(req) {
  return req.headers['x-forwarded-for'] ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.ip ||
         'unknown';
}

// Fonction pour nettoyer les données sensibles des logs
function sanitizeForLogging(data) {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'credit_card', 'ssn'];
  const sanitized = { ...data };
  
  for (const key in sanitized) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeForLogging(sanitized[key]);
    }
  }
  
  return sanitized;
}

module.exports = {
  requestLogger,
  securityLogger,
  validationLogger,
  performanceLogger,
  sanitizeForLogging,
  getClientIp
};