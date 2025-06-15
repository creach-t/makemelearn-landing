const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/stats/public - Statistiques publiques (anonymisées)
router.get('/public', async (req, res) => {
  try {
    // Statistiques générales (sans données personnelles)
    const [totalRegistrations, verifiedRegistrations, weeklyStats] = await Promise.all([
      db.query('SELECT COUNT(*) as total FROM registrations WHERE unsubscribed_at IS NULL'),
      db.query('SELECT COUNT(*) as verified FROM registrations WHERE is_verified = true AND unsubscribed_at IS NULL'),
      db.query(`
        SELECT 
          DATE_TRUNC('week', created_at) as week,
          COUNT(*) as registrations
        FROM registrations 
        WHERE created_at >= CURRENT_DATE - INTERVAL '8 weeks'
        AND unsubscribed_at IS NULL
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week DESC
        LIMIT 8
      `)
    ]);

    // Statistiques par source
    const sourceStats = await db.query(`
      SELECT 
        source,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
      FROM registrations 
      WHERE unsubscribed_at IS NULL
      GROUP BY source
      ORDER BY count DESC
    `);

    // Domaines les plus populaires (top 10, anonymisés)
    const domainStats = await db.query(`
      SELECT 
        SUBSTRING(email FROM '@(.*)$') as domain,
        COUNT(*) as count
      FROM registrations 
      WHERE unsubscribed_at IS NULL
      GROUP BY SUBSTRING(email FROM '@(.*)$')
      ORDER BY count DESC
      LIMIT 10
    `);

    const stats = {
      overview: {
        total: parseInt(totalRegistrations.rows[0].total),
        verified: parseInt(verifiedRegistrations.rows[0].verified),
        verificationRate: totalRegistrations.rows[0].total > 0 
          ? Math.round((verifiedRegistrations.rows[0].verified / totalRegistrations.rows[0].total) * 100)
          : 0
      },
      weekly: weeklyStats.rows.map(row => ({
        week: row.week,
        registrations: parseInt(row.registrations)
      })),
      sources: sourceStats.rows.map(row => ({
        source: row.source,
        count: parseInt(row.count),
        percentage: parseFloat(row.percentage)
      })),
      topDomains: domainStats.rows.map(row => ({
        domain: row.domain,
        count: parseInt(row.count)
      }))
    };

    // Incrémenter les stats de consultation
    await db.incrementStat('stats_viewed');

    logger.logBusiness('Public stats accessed', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      data: stats,
      generatedAt: new Date().toISOString(),
      code: 'STATS_SUCCESS'
    });

  } catch (error) {
    logger.logError(error, {
      operation: 'get_public_stats',
      ip: req.ip
    });

    res.status(500).json({
      error: 'Erreur lors de la récupération des statistiques',
      code: 'STATS_ERROR'
    });
  }
});

// GET /api/stats/growth - Données de croissance
router.get('/growth', async (req, res) => {
  try {
    // Croissance mensuelle
    const monthlyGrowth = await db.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as new_registrations,
        SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', created_at)) as cumulative
      FROM registrations 
      WHERE unsubscribed_at IS NULL
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
      LIMIT 12
    `);

    // Croissance quotidienne des 30 derniers jours
    const dailyGrowth = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as registrations
      FROM registrations 
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      AND unsubscribed_at IS NULL
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Taux de croissance
    const growthRate = await db.query(`
      WITH monthly_counts AS (
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as count
        FROM registrations 
        WHERE unsubscribed_at IS NULL
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
        LIMIT 2
      )
      SELECT 
        CASE 
          WHEN LAG(count) OVER (ORDER BY month) > 0 
          THEN ROUND(((count - LAG(count) OVER (ORDER BY month))::float / LAG(count) OVER (ORDER BY month)) * 100, 1)
          ELSE 0 
        END as growth_rate
      FROM monthly_counts
      ORDER BY month DESC
      LIMIT 1
    `);

    const growth = {
      monthly: monthlyGrowth.rows.map(row => ({
        month: row.month,
        newRegistrations: parseInt(row.new_registrations),
        cumulative: parseInt(row.cumulative)
      })),
      daily: dailyGrowth.rows.map(row => ({
        date: row.date,
        registrations: parseInt(row.registrations)
      })),
      currentGrowthRate: growthRate.rows.length > 0 ? parseFloat(growthRate.rows[0].growth_rate) || 0 : 0
    };

    res.json({
      data: growth,
      generatedAt: new Date().toISOString(),
      code: 'GROWTH_STATS_SUCCESS'
    });

  } catch (error) {
    logger.logError(error, {
      operation: 'get_growth_stats',
      ip: req.ip
    });

    res.status(500).json({
      error: 'Erreur lors de la récupération des statistiques de croissance',
      code: 'GROWTH_STATS_ERROR'
    });
  }
});

// GET /api/stats/system - Statistiques système (pour monitoring)
router.get('/system', async (req, res) => {
  try {
    // Vérification simple d'authentification (à améliorer selon vos besoins)
    const authHeader = req.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Token d\'authentification requis',
        code: 'AUTH_REQUIRED'
      });
    }

    // Statistiques de la base de données
    const [dbStats, tableStats] = await Promise.all([
      db.query(`
        SELECT 
          pg_database_size(current_database()) as db_size,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections
      `),
      db.query(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          pg_total_relation_size(schemaname||'.'||tablename) as table_size
        FROM pg_stat_user_tables
        ORDER BY table_size DESC
      `)
    ]);

    // Statistiques récentes
    const recentStats = await db.query(`
      SELECT 
        metric_name,
        metric_value,
        date
      FROM stats 
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY date DESC, metric_name
    `);

    const systemStats = {
      database: {
        size: parseInt(dbStats.rows[0].db_size),
        activeConnections: parseInt(dbStats.rows[0].active_connections),
        tables: tableStats.rows.map(row => ({
          schema: row.schemaname,
          table: row.tablename,
          inserts: parseInt(row.inserts),
          updates: parseInt(row.updates),
          deletes: parseInt(row.deletes),
          size: parseInt(row.table_size)
        }))
      },
      metrics: recentStats.rows.reduce((acc, row) => {
        if (!acc[row.date]) acc[row.date] = {};
        acc[row.date][row.metric_name] = parseInt(row.metric_value);
        return acc;
      }, {}),
      performance: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        nodeVersion: process.version
      }
    };

    res.json({
      data: systemStats,
      generatedAt: new Date().toISOString(),
      code: 'SYSTEM_STATS_SUCCESS'
    });

  } catch (error) {
    logger.logError(error, {
      operation: 'get_system_stats',
      ip: req.ip
    });

    res.status(500).json({
      error: 'Erreur lors de la récupération des statistiques système',
      code: 'SYSTEM_STATS_ERROR'
    });
  }
});

// POST /api/stats/track - Enregistrer un événement personnalisé
router.post('/track', async (req, res) => {
  try {
    const { event, value = 1, metadata = {} } = req.body;

    if (!event || typeof event !== 'string') {
      return res.status(400).json({
        error: 'Nom d\'événement requis',
        code: 'EVENT_REQUIRED'
      });
    }

    // Validation du nom d'événement (alphanumerique + underscore)
    if (!/^[a-zA-Z0-9_]+$/.test(event)) {
      return res.status(400).json({
        error: 'Nom d\'événement invalide (alphanumerique + underscore uniquement)',
        code: 'INVALID_EVENT_NAME'
      });
    }

    await db.incrementStat(event, parseInt(value) || 1);

    logger.logBusiness('Custom event tracked', {
      event,
      value: parseInt(value) || 1,
      metadata,
      ip: req.ip
    });

    res.json({
      message: 'Événement enregistré avec succès',
      code: 'EVENT_TRACKED'
    });

  } catch (error) {
    logger.logError(error, {
      operation: 'track_event',
      event: req.body.event,
      ip: req.ip
    });

    res.status(500).json({
      error: 'Erreur lors de l\'enregistrement de l\'événement',
      code: 'TRACK_ERROR'
    });
  }
});

module.exports = router;