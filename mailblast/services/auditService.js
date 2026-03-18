const User = require('../models/User');
const AuthEvent = require('../models/AuthEvent');
const { connectDB, isPersistenceEnabled } = require('../config/db');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || '';
}

async function upsertUserOnLogin(req) {
  if (!isPersistenceEnabled() || !req.user?.id) {
    return null;
  }

  const connected = await connectDB();
  if (!connected) {
    return null;
  }

  const now = new Date();
  const existing = await User.findOne({ googleId: req.user.id });

  if (!existing) {
    return User.create({
      googleId: req.user.id,
      provider: 'google',
      name: req.user.name || '',
      email: req.user.email || '',
      photo: req.user.photo || '',
      loginCount: 1,
      logoutCount: 0,
      firstLoginAt: now,
      lastLoginAt: now,
      lastSeenAt: now,
      lastIp: getClientIp(req),
      lastUserAgent: req.get('user-agent') || '',
      isActive: true,
      isDeleted: false,
    });
  }

  existing.provider = 'google';
  existing.name = req.user.name || '';
  existing.email = req.user.email || '';
  existing.photo = req.user.photo || '';
  existing.lastLoginAt = now;
  existing.lastSeenAt = now;
  existing.lastIp = getClientIp(req);
  existing.lastUserAgent = req.get('user-agent') || '';
  existing.isActive = true;
  existing.isDeleted = false;
  existing.deletedAt = undefined;
  existing.loginCount = Number(existing.loginCount || 0) + 1;

  await existing.save();
  return existing;
}

async function ensureSessionUser(req) {
  if (!isPersistenceEnabled() || !req.user?.id) {
    return null;
  }

  const connected = await connectDB();
  if (!connected) {
    return null;
  }

  const now = new Date();

  try {
    const existing = await User.findOne({ googleId: req.user.id });

    if (!existing) {
      const created = await User.create({
        googleId: req.user.id,
        provider: 'google',
        name: req.user.name || '',
        email: req.user.email || '',
        photo: req.user.photo || '',
        loginCount: 1,
        logoutCount: 0,
        firstLoginAt: now,
        lastLoginAt: now,
        lastSeenAt: now,
        lastIp: getClientIp(req),
        lastUserAgent: req.get('user-agent') || '',
        isActive: true,
        isDeleted: false,
      });

      await saveAuthEvent({
        req,
        user: created,
        eventType: 'user_created',
        metadata: { reason: 'session_recovery' },
      });

      return created;
    }

    existing.provider = 'google';
    existing.name = req.user.name || '';
    existing.email = req.user.email || '';
    existing.photo = req.user.photo || '';
    existing.lastSeenAt = now;
    existing.lastIp = getClientIp(req);
    existing.lastUserAgent = req.get('user-agent') || '';
    existing.isActive = true;
    existing.isDeleted = false;
    existing.deletedAt = undefined;

    await existing.save();
    return existing;
  } catch (error) {
    console.error('[audit] ensureSessionUser failed:', error.message);
    return null;
  }
}

async function saveAuthEvent({ req, user, eventType, metadata = {} }) {
  if (!isPersistenceEnabled() || !req.user?.id) {
    return;
  }

  const connected = await connectDB();
  if (!connected) {
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
    if (!isPersistenceEnabled() || !req.user?.id) {
      return null;
    }

    const connected = await connectDB();
    if (!connected) {
      return null;
    }

    const existedBefore = Boolean(
      await User.findOne({ googleId: req.user.id }).select('_id').lean()
    );

    const user = await upsertUserOnLogin(req);
    if (!user) {
      return null;
    }

    if (!existedBefore) {
      await saveAuthEvent({
        req,
        user,
        eventType: 'user_created',
        metadata: { reason: 'first_login' },
      });
    }

    await saveAuthEvent({ req, user, eventType: 'login' });
    return user;
  } catch (error) {
    console.error('[audit] recordLogin failed:', error.message);
    return null;
  }
}

async function recordLogout(req) {
  if (!isPersistenceEnabled() || !req.user?.id) {
    return;
  }

  const connected = await connectDB();
  if (!connected) {
    return;
  }

  try {
    const user = await User.findOneAndUpdate(
      { googleId: req.user.id },
      {
        $set: {
          lastLogoutAt: new Date(),
          lastSeenAt: new Date(),
          lastIp: getClientIp(req),
          lastUserAgent: req.get('user-agent') || '',
          isActive: false,
        },
        $inc: {
          logoutCount: 1,
        },
      },
      { new: true }
    );

    await saveAuthEvent({ req, user, eventType: 'logout' });
  } catch (error) {
    console.error('[audit] recordLogout failed:', error.message);
  }
}

async function recordUserDelete(req) {
  if (!isPersistenceEnabled() || !req.user?.id) {
    return null;
  }

  const connected = await connectDB();
  if (!connected) {
    return null;
  }

  try {
    const user = await User.findOneAndUpdate(
      { googleId: req.user.id },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          isActive: false,
          lastSeenAt: new Date(),
          lastIp: getClientIp(req),
          lastUserAgent: req.get('user-agent') || '',
        },
      },
      { new: true }
    );

    await saveAuthEvent({
      req,
      user,
      eventType: 'user_deleted',
      metadata: { reason: 'user_requested' },
    });

    return user;
  } catch (error) {
    console.error('[audit] recordUserDelete failed:', error.message);
    return null;
  }
}

module.exports = {
  ensureSessionUser,
  recordLogin,
  recordLogout,
  recordUserDelete,
};
