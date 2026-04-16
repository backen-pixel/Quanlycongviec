const jwt = require('jsonwebtoken');
const config = require('../config');

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const payload = jwt.verify(h.slice(7), config.jwtSecret);
    req.user = payload;
    // Một số route (push, preferences) dùng userId; token cũ có thể chỉ có id
    if (req.user.userId == null && req.user.id != null) req.user.userId = req.user.id;
    if (req.user.id == null && req.user.userId != null) req.user.id = req.user.userId;
    next();
  } catch { res.status(401).json({ error: 'Token hết hạn' }); }
}

module.exports = { auth };
