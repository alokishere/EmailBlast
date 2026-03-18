require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const { connectDB, isMongoConnected } = require('./config/db');
const { ensureSessionUser } = require('./services/auditService');
const isAuth = require('./middleware/isAuth');
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/email');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.SESSION_SECRET) {
  console.warn('[config] Missing one or more required env variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET');
}

app.set('trust proxy', 1);

app.use(
  session({
    name: 'mailblast.sid',
    secret: process.env.SESSION_SECRET || 'replace_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

const callbackURL =
  process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/auth/google/callback`;

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
    },
    (accessToken, refreshToken, profile, done) => {
      try {
        const user = {
          id: profile.id,
          name: profile.displayName || 'Google User',
          email: profile.emails?.[0]?.value || '',
          photo: profile.photos?.[0]?.value || '',
          accessToken,
        };

        console.log('[auth] Google OAuth success');
        return done(null, user);
      } catch (error) {
        console.error('[auth] Strategy callback error:', error);
        return done(error);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(publicDir, { index: false }));

app.use('/', authRoutes(passport));
app.use('/', emailRoutes);
app.use('/analytics', analyticsRoutes);

app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(publicDir, 'privacy.html'));
});

app.get('/terms-and-conditions', (req, res) => {
  res.sendFile(path.join(publicDir, 'terms.html'));
});

app.get('/', isAuth, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/me', isAuth, async (req, res) => {
  const { id, name, email, photo } = req.user;

  const payload = {
    id,
    name,
    email,
    photo,
  };

  if (isMongoConnected()) {
    try {
      const dbUser = await ensureSessionUser(req);

      if (dbUser) {
        payload.loginCount = dbUser.loginCount;
        payload.createdAt = dbUser.createdAt;
        payload.updatedAt = dbUser.updatedAt;
      }
    } catch (error) {
      console.error('[me] Failed to load DB user data:', error.message);
    }
  }

  res.json(payload);
});

app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    error: 'Internal server error',
  });
});

async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[server] MailBlast running at http://localhost:${PORT}`);
    console.log(`[server] OAuth callback URL: ${callbackURL}`);
  });
}

startServer();
