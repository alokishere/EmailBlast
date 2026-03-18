const User = require('../models/User');
const AuthEvent = require('../models/AuthEvent');
const { isMongoConnected } = require('../config/db');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || '';
}

async function upsertUserOnLogin(req) {
  if (!isMongoConnected() || !req.user?.id) {
    return null;
  }

  const now = new Date();

  const user = await User.findOneAndUpdate(
    { googleId: req.user.id },
    {
      $set: {
        provider: 'google',
        name: req.user.name || '',
        email: req.user.email || '',
        photo: req.user.photo || '',
        lastLoginAt: now,
        lastSeenAt: now,
        lastIp: getClientIp(req),
        lastUserAgent: req.get('user-agent') || '',
        isActive: true,
      },
      $setOnInsert: {
        firstLoginAt: now,
      },
      $inc: {
        loginCount: 1,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return user;
}

async function ensureSessionUser(req) {
  if (!isMongoConnected() || !req.user?.id) {
    return null;
  }

  const now = new Date();

  try {
    const user = await User.findOneAndUpdate(
      { googleId: req.user.id },
      {
        $set: {
          provider: 'google',
          name: req.user.name || '',
          email: req.user.email || '',
          photo: req.user.photo || '',
          lastSeenAt: now,
          lastIp: getClientIp(req),
          lastUserAgent: req.get('user-agent') || '',
          isActive: true,
        },
        $setOnInsert: {
          firstLoginAt: now,
          lastLoginAt: now,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return user;
  } catch (error) {
    console.error('[audit] ensureSessionUser failed:', error.message);
    return null;
  }
}

async function saveAuthEvent({ req, user, eventType, metadata = {} }) {
  if (!isMongoConnected() || !req.user?.id) {
    return;
  }

  await AuthEvent.create({
    user: user?._id,
    googleId: req.user.id,
    email: req.user.email || '',
    eventType,
    ip: getClientIp(req),
    userAgent: req.get('user-agent') || '',
    sessionId: req.sessionID || '',
    metadata,
  });
}

async function recordLogin(req) {
  try {
    const user = await upsertUserOnLogin(req);
    await saveAuthEvent({ req, user, eventType: 'login' });
    return user;
  } catch (error) {
    console.error('[audit] recordLogin failed:', error.message);
    return null;
  }
}

async function recordLogout(req) {
  if (!isMongoConnected() || !req.user?.id) {
    return;
  }

  try {
    const user = await User.findOneAndUpdate(
      { googleId: req.user.id },
      {
        $set: {
          lastLogoutAt: new Date(),
          lastIp: getClientIp(req),
          lastUserAgent: req.get('user-agent') || '',
          isActive: false,
        },
      },
      { new: true }
    );

    await saveAuthEvent({ req, user, eventType: 'logout' });
  } catch (error) {
    console.error('[audit] recordLogout failed:', error.message);
  }
}

module.exports = {
  ensureSessionUser,
  recordLogin,
  recordLogout,
};
