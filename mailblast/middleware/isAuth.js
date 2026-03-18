function isAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  if (req.method === 'GET' && req.accepts('html')) {
    return res.redirect('/login');
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = isAuth;
