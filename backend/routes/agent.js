// backend/routes/agent.js
const express = require('express');
const router = express.Router();
const agentService = require('../services/agentService');
const verifyToken = require('../middleware/auth');

router.use(verifyToken);

/**
 * POST /api/agent/chat
 * Body: { message: string, currentWatchlistId?: string }
 */
router.post('/chat', async (req, res, next) => {
  try {
    const { message, currentWatchlistId } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const result = await agentService.runAgentChat(
      req.user.id,
      message.trim(),
      currentWatchlistId
    );

    res.json({
      success: true,
      response: result.response,
      refreshRequired: result.refreshRequired
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
