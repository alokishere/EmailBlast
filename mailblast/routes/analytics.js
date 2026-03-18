const express = require('express');

const isAuth = require('../middleware/isAuth');
const { isMongoConnected } = require('../config/db');
const User = require('../models/User');
const AuthEvent = require('../models/AuthEvent');
const BulkEmailLog = require('../models/BulkEmailLog');

const router = express.Router();

router.use(isAuth);

router.use((req, res, next) => {
  if (!isMongoConnected()) {
    return res.status(503).json({
      error: 'MongoDB is not connected. Add MONGO_URI in .env and restart.',
    });
  }

  return next();
});

router.get('/overview', async (req, res) => {
  try {
    const [totalUsers, totalLoginEvents, totalLogoutEvents, totalCampaigns, sentAgg, activeUsers] =
      await Promise.all([
        User.countDocuments(),
        AuthEvent.countDocuments({ eventType: 'login' }),
        AuthEvent.countDocuments({ eventType: 'logout' }),
        BulkEmailLog.countDocuments(),
        BulkEmailLog.aggregate([
          {
            $group: {
              _id: null,
              totalRecipients: { $sum: '$recipientCount' },
              totalSent: { $sum: '$sent' },
              totalFailed: { $sum: '$failed' },
            },
          },
        ]),
        User.countDocuments({ isActive: true }),
      ]);

    const totals = sentAgg[0] || { totalRecipients: 0, totalSent: 0, totalFailed: 0 };

    return res.json({
      totalUsers,
      activeUsers,
      totalLoginEvents,
      totalLogoutEvents,
      totalCampaigns,
      totalRecipients: totals.totalRecipients,
      totalSent: totals.totalSent,
      totalFailed: totals.totalFailed,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('[analytics] overview error:', error);
    return res.status(500).json({ error: 'Failed to load analytics overview.' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    const users = await User.find()
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select(
        'googleId name email photo loginCount firstLoginAt lastLoginAt lastLogoutAt lastIp lastUserAgent createdAt updatedAt isActive'
      )
      .lean();

    return res.json({
      count: users.length,
      users,
    });
  } catch (error) {
    console.error('[analytics] users error:', error);
    return res.status(500).json({ error: 'Failed to load users.' });
  }
});

router.get('/login-events', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);

    const events = await AuthEvent.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('googleId email eventType ip userAgent sessionId metadata createdAt updatedAt')
      .lean();

    return res.json({
      count: events.length,
      events,
    });
  } catch (error) {
    console.error('[analytics] login-events error:', error);
    return res.status(500).json({ error: 'Failed to load login events.' });
  }
});

router.get('/email-logs', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    const logs = await BulkEmailLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(
        'googleId email subject recipientCount sent failed status attachments createdAt updatedAt'
      )
      .lean();

    return res.json({
      count: logs.length,
      logs,
    });
  } catch (error) {
    console.error('[analytics] email-logs error:', error);
    return res.status(500).json({ error: 'Failed to load email logs.' });
  }
});

module.exports = router;
