const jwt = require('jsonwebtoken');
const config = require('../config');

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.user = jwt.verify(h.slice(7), config.jwtSecret);
    next();
  } catch { res.status(401).json({ error: 'Token hết hạn' }); }
}

module.exports = { auth };
