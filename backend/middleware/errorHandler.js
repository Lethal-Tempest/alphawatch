
// ─────────────────────────────────────────────────────────────────────────────
// backend/middleware/errorHandler.js
// ─────────────────────────────────────────────────────────────────────────────
const errorHandler = (err, req, res, _next) => {
  console.error(`[Error] ${req.method} ${req.url} — ${err.message}`);

  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    success: false,
    error:   err.message || 'Internal Server Error',
    stack:   process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

module.exports = errorHandler;
