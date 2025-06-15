const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// GET /health - Health check simple (pour load balancer)
router.get('/', async (req, res) => {
  try {
    // Test basique de la base de données
    const result = await db.query('SELECT 1 as healthy');
    
    if (result.rows[0].healthy === 1) {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'makemelearn-api'
      });
    } else {
      throw new Error('Database health check failed');
    }
  } catch (error) {
    logger.logError(error, { operation: 'health_check' });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'makemelearn-api',
      error: 'Database connection failed'
    });
  }
});

// GET /health/detailed - Health check détaillé
router.get('/detailed', async (req, res) => {
  const checks = {
    database: false,
    memory: false,
    disk: false,
    uptime: false
  };
  
  const details = {
    timestamp: new Date().toISOString(),
    service: 'makemelearn-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };

  try {
    // 1. Test de la base de données
    const dbStart = Date.now();
    const dbResult = await db.query('SELECT NOW() as current_time, version() as version');
    const dbLatency = Date.now() - dbStart;
    
    checks.database = true;
    details.database = {
      status: 'connected',
      latency: `${dbLatency}ms`,
      version: dbResult.rows[0].version.split(' ')[0],
      currentTime: dbResult.rows[0].current_time
    };

    // Test plus approfondi de la DB
    const tableCheck = await db.query(`
      SELECT 
        COUNT(*) as total_registrations,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_registrations
      FROM registrations
    `);
    
    details.database.metrics = {
      totalRegistrations: parseInt(tableCheck.rows[0].total_registrations),
      todayRegistrations: parseInt(tableCheck.rows[0].today_registrations)
    };

  } catch (error) {
    details.database = {
      status: 'error',
      error: error.message
    };
    logger.logError(error, { operation: 'detailed_health_db_check' });
  }

  try {
    // 2. Vérification de la mémoire
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.used / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const memUsagePercent = Math.round((memUsedMB / memTotalMB) * 100);
    
    checks.memory = memUsagePercent < 90; // Alerte si > 90%
    details.memory = {
      used: `${memUsedMB}MB`,
      total: `${memTotalMB}MB`,
      usage: `${memUsagePercent}%`,
      status: checks.memory ? 'ok' : 'warning'
    };

  } catch (error) {
    details.memory = {
      status: 'error',
      error: error.message
    };
  }

  try {
    // 3. Vérification de l'uptime
    const uptimeSeconds = process.uptime();
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);
    
    checks.uptime = uptimeSeconds > 30; // Service doit être up depuis au moins 30s
    details.uptime = {
      seconds: Math.floor(uptimeSeconds),
      human: `${uptimeDays}d ${uptimeHours % 24}h ${uptimeMinutes % 60}m`,
      status: checks.uptime ? 'ok' : 'starting'
    };

  } catch (error) {
    details.uptime = {
      status: 'error',
      error: error.message
    };
  }

  try {
    // 4. Vérification des performances récentes
    const perfCheck = await db.query(`
      SELECT 
        metric_name,
        metric_value
      FROM stats 
      WHERE date = CURRENT_DATE 
      AND metric_name IN ('signup_success', 'signup_attempts', 'page_views')
    `);
    
    details.performance = {
      todayMetrics: perfCheck.rows.reduce((acc, row) => {
        acc[row.metric_name] = parseInt(row.metric_value);
        return acc;
      }, {}),
      status: 'ok'
    };

  } catch (error) {
    details.performance = {
      status: 'error',
      error: error.message
    };
  }

  // Statut global
  const overallHealthy = Object.values(checks).every(check => check === true);
  const statusCode = overallHealthy ? 200 : 503;

  details.overall = {
    status: overallHealthy ? 'healthy' : 'degraded',
    checks
  };

  // Log si le service n'est pas en bonne santé
  if (!overallHealthy) {
    logger.warn('Service health check failed', details);
  }

  res.status(statusCode).json(details);
});

// GET /health/metrics - Métriques Prometheus-style
router.get('/metrics', async (req, res) => {
  try {
    const [dbMetrics, systemMetrics] = await Promise.all([
      db.query(`
        SELECT 
          COUNT(*) as total_registrations,
          COUNT(*) FILTER (WHERE is_verified = true) as verified_registrations,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_registrations,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week_registrations
        FROM registrations
        WHERE unsubscribed_at IS NULL
      `),
      db.query(`
        SELECT 
          metric_name,
          SUM(metric_value) as total_value
        FROM stats 
        WHERE date >= CURRENT_DATE - INTERVAL '1 day'
        GROUP BY metric_name
      `)
    ]);

    const memUsage = process.memoryUsage();
    
    // Format Prometheus
    let metrics = `# HELP makemelearn_registrations_total Total number of registrations
# TYPE makemelearn_registrations_total counter
makemelearn_registrations_total ${dbMetrics.rows[0].total_registrations}

# HELP makemelearn_registrations_verified Total number of verified registrations  
# TYPE makemelearn_registrations_verified counter
makemelearn_registrations_verified ${dbMetrics.rows[0].verified_registrations}

# HELP makemelearn_registrations_today Registrations today
# TYPE makemelearn_registrations_today gauge
makemelearn_registrations_today ${dbMetrics.rows[0].today_registrations}

# HELP makemelearn_registrations_week Registrations this week
# TYPE makemelearn_registrations_week gauge
makemelearn_registrations_week ${dbMetrics.rows[0].week_registrations}

# HELP makemelearn_memory_usage_bytes Memory usage in bytes
# TYPE makemelearn_memory_usage_bytes gauge
makemelearn_memory_usage_bytes ${memUsage.used}

# HELP makemelearn_uptime_seconds Service uptime in seconds
# TYPE makemelearn_uptime_seconds counter
makemelearn_uptime_seconds ${Math.floor(process.uptime())}

`;

    // Ajouter les métriques custom
    systemMetrics.rows.forEach(row => {
      metrics += `# HELP makemelearn_${row.metric_name} Custom metric ${row.metric_name}
# TYPE makemelearn_${row.metric_name} counter
makemelearn_${row.metric_name} ${row.total_value}

`;
    });

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);

  } catch (error) {
    logger.logError(error, { operation: 'metrics_export' });
    res.status(500).send('# Error generating metrics\n');
  }
});

// GET /health/readiness - Readiness probe (K8s)
router.get('/readiness', async (req, res) => {
  try {
    // Vérifier que l'application est prête à recevoir du trafic
    await db.query('SELECT 1');
    
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: true,
        application: true
      }
    });
  } catch (error) {
    logger.logError(error, { operation: 'readiness_check' });
    
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /health/liveness - Liveness probe (K8s)
router.get('/liveness', (req, res) => {
  // Simple vérification que le processus répond
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    pid: process.pid
  });
});

// POST /health/maintenance - Déclencher la maintenance
router.post('/maintenance', async (req, res) => {
  try {
    // Vérification d'authentification simple (à améliorer)
    const authHeader = req.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.MAINTENANCE_TOKEN}`) {
      return res.status(401).json({
        error: 'Token de maintenance invalide',
        code: 'INVALID_MAINTENANCE_TOKEN'
      });
    }

    logger.info('Maintenance manuelle déclenchée', { ip: req.ip });
    
    const result = await db.performMaintenance();
    
    res.json({
      message: 'Maintenance effectuée avec succès',
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.logError(error, { operation: 'manual_maintenance' });
    
    res.status(500).json({
      error: 'Erreur lors de la maintenance',
      code: 'MAINTENANCE_ERROR'
    });
  }
});

module.exports = router;