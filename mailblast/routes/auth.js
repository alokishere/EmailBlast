const path = require('path');
const express = require('express');
const { recordLogin, recordLogout, recordUserDelete } = require('../services/auditService');
const isAuth = require('../middleware/isAuth');

module.exports = function buildAuthRoutes(passport) {
  const router = express.Router();
  const loginPagePath = path.join(__dirname, '..', 'public', 'login.html');

  router.get('/login', (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.redirect('/home');
    }

    return res.sendFile(loginPagePath);
  });

  router.get(
    '/auth/google',
    passport.authenticate('google', {
      scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.send'],
      accessType: 'offline',
      prompt: 'consent',
      includeGrantedScopes: true,
    })
  );

  router.get(
    '/auth/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/login',
      session: true,
    }),
    async (req, res) => {
      await recordLogin(req);
      console.log('[auth] Callback success');
      res.redirect('/home');
    }
  );

  router.get('/logout', async (req, res, next) => {
    await recordLogout(req);

    req.logout((logoutErr) => {
      if (logoutErr) {
        console.error('[auth] Logout error:', logoutErr);
        return next(logoutErr);
      }

      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error('[auth] Session destroy error:', sessionErr);
          return next(sessionErr);
        }

        res.clearCookie('mailblast.sid');
        console.log('[auth] Logout success');
        return res.redirect('/login');
      });
    });
  });

  router.post('/account/delete', isAuth, async (req, res, next) => {
    await recordUserDelete(req);

    req.logout((logoutErr) => {
      if (logoutErr) {
        console.error('[auth] Delete account logout error:', logoutErr);
        return next(logoutErr);
      }

      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error('[auth] Delete account session destroy error:', sessionErr);
          return next(sessionErr);
        }

        res.clearCookie('mailblast.sid');
        return res.json({
          ok: true,
          message: 'Account marked deleted and session closed.',
        });
      });
    });
  });

  return router;
};
