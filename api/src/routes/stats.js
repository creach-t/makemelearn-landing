const express = require('express');
const { safe } = require('../lib/safe');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/stats/public - Statistiques publiques (anonymisées)
router.get('/public', safe(async (req, res) => {
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
}));

// GET /api/stats/growth - Données de croissance
router.get('/growth', safe(async (req, res) => {
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
}));

module.exports = router;