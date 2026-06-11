
// ─────────────────────────────────────────────────────────────────────────────
// backend/middleware/auth.js
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access denied. Token missing.' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired session token.' });
  }
};

module.exports = verifyToken;
