const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const User = require('../models/User');
const Watchlist = require('../models/Watchlist');
const Trade = require('../models/Trade');
const hdfcService = require('../services/hdfcService');

/**
 * Public HDFC Callback Redirect Handler.
 * Receives redirect from HDFC server and passes token to frontend to bind to active session.
 */
router.get('/hdfc/callback', (req, res) => {
  const requestToken = req.query.request_token || req.query.requestToken;
  if (!requestToken) {
    return res.status(400).send('Missing request_token');
  }

  // Determine redirection target (localhost for local dev, vercel for production)
  const host = req.get('host') || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const redirectBase = isLocal ? 'http://localhost:3000' : 'https://alphawatch.vercel.app';

  res.redirect(`${redirectBase}/autotrade?request_token=${requestToken}`);
});

// All subsequent routes require user authentication
router.use(verifyToken);

/**
 * Exchange request token for access token and connect user HDFC account.
 */
router.post('/hdfc/connect', async (req, res, next) => {
  try {
    const { requestToken } = req.body;
    if (!requestToken) {
      return res.status(400).json({ error: 'requestToken is required.' });
    }

    const data = await hdfcService.exchangeRequestToken(requestToken);
    if (!data || !data.accessToken) {
      return res.status(400).json({ error: 'Failed to acquire access token from HDFC.' });
    }

    // Set expiry to 24 hours from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await User.findByIdAndUpdate(req.user.id, {
      hdfcAccessToken: data.accessToken,
      hdfcTokenExpiresAt: expiresAt
    });

    res.json({ success: true, message: 'HDFC Account connected successfully.' });
  } catch (error) {
    next(error);
  }
});

/**
 * Retrieve User auto-trading configuration, broker connection status, and condition pool.
 */
router.get('/config', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    let scoringSystems = user.scoringSystems || [];
    if (scoringSystems.length === 0) {
      user.scoringSystems.push({
        name: 'Default Close Price',
        conditions: [
          {
            type: 'operand',
            valueType: 'indicator',
            timeframe: '5m',
            indicator: 'close'
          }
        ]
      });
      await user.save();
      scoringSystems = user.scoringSystems;
    }

    const connected = !!(user.hdfcAccessToken && user.hdfcTokenExpiresAt && new Date() < new Date(user.hdfcTokenExpiresAt));

    res.json({
      success: true,
      hdfcApiKey: process.env.HDFC_API_KEY,
      config: user.autoTradeConfig || {
        enabled: false,
        capital: 50000
      },
      conditions: user.conditions || [],
      scoringSystems,
      connected
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update User auto-trading configuration.
 */
router.put('/config', async (req, res, next) => {
  try {
    const { enabled, capital } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        autoTradeConfig: {
          enabled: !!enabled,
          capital: parseFloat(capital) || 50000
        }
      },
      { new: true }
    );

    res.json({ success: true, config: user.autoTradeConfig });
  } catch (error) {
    next(error);
  }
});

/**
 * Condition Pool Management: Get all user conditions
 */
router.get('/conditions', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ success: true, conditions: user.conditions || [] });
  } catch (error) {
    next(error);
  }
});

/**
 * Condition Pool Management: Create a new condition
 */
router.post('/conditions', async (req, res, next) => {
  try {
    const { name, type, groups } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'Condition name and type are required.' });
    }
    if (type !== 'buy' && type !== 'sell') {
      return res.status(400).json({ error: 'Type must be "buy" or "sell".' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.conditions.push({
      name,
      type,
      groups: Array.isArray(groups) ? groups : []
    });

    await user.save();
    
    // Return updated list
    res.json({ success: true, conditions: user.conditions });
  } catch (error) {
    next(error);
  }
});

/**
 * Condition Pool Management: Edit rules or name of a condition
 */
router.put('/conditions/:id', async (req, res, next) => {
  try {
    const { name, groups } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const cond = user.conditions.id(req.params.id);
    if (!cond) return res.status(404).json({ error: 'Condition not found.' });

    if (name !== undefined) cond.name = name;
    if (groups !== undefined) cond.groups = Array.isArray(groups) ? groups : [];

    await user.save();
    res.json({ success: true, conditions: user.conditions });
  } catch (error) {
    next(error);
  }
});

/**
 * Condition Pool Management: Delete a condition and purge associations on stocks
 */
router.delete('/conditions/:id', async (req, res, next) => {
  try {
    const condId = req.params.id;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.conditions = user.conditions.filter((c) => c._id.toString() !== condId);
    await user.save();

    // Scan watchlists and deactivate auto-trading on any stocks mapped to this deleted rule
    const watchlists = await Watchlist.find({ userId: req.user.id });
    for (const wl of watchlists) {
      let changed = false;
      for (const stock of wl.stocks) {
        if (stock.assignedBuyConditionId?.toString() === condId) {
          stock.assignedBuyConditionId = undefined;
          stock.autoTradeEnabled = false;
          changed = true;
        }
        if (stock.assignedSellConditionId?.toString() === condId) {
          stock.assignedSellConditionId = undefined;
          stock.autoTradeEnabled = false;
          changed = true;
        }
      }
      if (changed) {
        await wl.save();
      }
    }

    res.json({ success: true, conditions: user.conditions });
  } catch (error) {
    next(error);
  }
});

/**
 * Retrieve the top 10 latest trades logged for the current user.
 */
router.get('/logs', async (req, res, next) => {
  try {
    const logs = await Trade.find({ userId: req.user.id })
      .sort({ timestamp: -1 })
      .limit(10);
    res.json({ success: true, logs });
  } catch (error) {
    next(error);
  }
});

/**
 * Toggle the auto-trading whitelisted state for a stock inside a watchlist, allocating buy and sell conditions.
 */
router.post('/toggle-stock', async (req, res, next) => {
  try {
    const { watchlistId, symbol, exchange, autoTradeEnabled, assignedBuyConditionId, assignedSellConditionId, tradeCapital } = req.body;
    if (!watchlistId || !symbol || !exchange) {
      return res.status(400).json({ error: 'watchlistId, symbol, and exchange are required.' });
    }

    const wl = await Watchlist.findOne({ _id: watchlistId, userId: req.user.id });
    if (!wl) return res.status(404).json({ error: 'Watchlist not found.' });

    const stock = wl.stocks.find(
      (s) => s.symbol.toUpperCase() === symbol.toUpperCase() && s.exchange.toUpperCase() === exchange.toUpperCase()
    );

    if (!stock) return res.status(404).json({ error: 'Stock not found in this watchlist.' });

    if (autoTradeEnabled) {
      if (!assignedBuyConditionId || !assignedSellConditionId) {
        return res.status(400).json({ error: 'Allocating both a Buy and a Sell condition is required when turning auto-trading ON.' });
      }
      stock.autoTradeEnabled = true;
      stock.assignedBuyConditionId = assignedBuyConditionId;
      stock.assignedSellConditionId = assignedSellConditionId;
      stock.tradeCapital = parseFloat(tradeCapital) > 0 ? parseFloat(tradeCapital) : undefined;
    } else {
      stock.autoTradeEnabled = false;
      stock.assignedBuyConditionId = undefined;
      stock.assignedSellConditionId = undefined;
      stock.tradeCapital = undefined;
    }

    await wl.save();
    res.json({ success: true, stock });
  } catch (error) {
    next(error);
  }
});

/**
 * Scoring Systems Pool Management: Get all scoring systems
 */
router.get('/scoring-systems', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ success: true, scoringSystems: user.scoringSystems || [] });
  } catch (error) {
    next(error);
  }
});

const validIndicatorsForParsing = new Set([
  'close', 'open', 'high', 'low', 'volume',
  'sma20', 'deltaSma20', 'deltaSqSma20', 'sma50', 'deltaSma50', 'deltaSqSma50', 'sma100', 'deltaSma100', 'deltaSqSma100', 'sma200', 'deltaSma200', 'deltaSqSma200',
  'ema20', 'deltaEma20', 'deltaSqEma20', 'ema50', 'deltaEma50', 'deltaSqEma50', 'ema100', 'deltaEma100', 'deltaSqEma100', 'ema200', 'deltaEma200', 'deltaSqEma200',
  'rsi14', 'deltaRsi14', 'deltaSqRsi14',
  'bbUpper', 'deltaBbUpper', 'deltaSqBbUpper', 'bbMiddle', 'deltaBbMiddle', 'deltaSqBbMiddle', 'bbLower', 'deltaBbLower', 'deltaSqBbLower',
  'macdLine', 'deltaMACD', 'deltaSqMacdLine', 'macdSignal', 'deltaMacdSignal', 'deltaSqMacdSignal', 'macdHist', 'deltaMacdHist', 'deltaSqMacdHist',
  'adx', 'deltaADX', 'deltaSqADX', 'plusDI', 'deltaPlusDI', 'deltaSqPlusDI', 'minusDI', 'deltaMinusDI', 'deltaSqMinusDI', 'di', 'deltaDI', 'deltaSqDI',
  'mfi14', 'deltaMfi14', 'deltaSqMfi14',
  'smiLine', 'deltaSMI', 'deltaSqSmiLine', 'smiSignal', 'deltaSMISignal', 'deltaSqSmiSignal', 'smiDist', 'deltaSMIDist', 'deltaSqSMIDist'
]);

function parseFormulaString(formulaStr) {
  const regex = /(\(|\)|\+|-|\*|\/|[^\s()+\-*/]+)/g;
  const rawTokens = formulaStr.match(regex) || [];
  
  const tokens = [];
  for (const raw of rawTokens) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (['(', ')'].includes(trimmed)) {
      tokens.push({ type: 'parenthesis', valueStr: trimmed });
    } else if (['+', '-', '*', '/'].includes(trimmed)) {
      tokens.push({ type: 'operator', valueStr: trimmed });
    } else {
      if (!isNaN(trimmed)) {
        tokens.push({ type: 'operand', valueType: 'value', value: parseFloat(trimmed) });
      } else {
        let timeframe = '5m';
        let indicatorName = trimmed;
        if (trimmed.includes(':')) {
          const parts = trimmed.split(':');
          timeframe = parts[0];
          indicatorName = parts[1];
        }

        if (!validIndicatorsForParsing.has(indicatorName)) {
          throw new Error(`Unknown indicator name: "${indicatorName}"`);
        }

        tokens.push({
          type: 'operand',
          valueType: 'indicator',
          timeframe,
          indicator: indicatorName
        });
      }
    }
  }

  let balance = 0;
  for (const t of tokens) {
    if (t.type === 'parenthesis') {
      if (t.valueStr === '(') balance++;
      else balance--;
      if (balance < 0) {
        throw new Error('Mismatched parenthesis: closing bracket ")" without opening bracket "("');
      }
    }
  }
  if (balance !== 0) {
    throw new Error('Mismatched parenthesis: missing closing bracket ")"');
  }

  return tokens;
}

/**
 * Scoring Systems Pool Management: Create a new scoring system
 */
router.post('/scoring-systems', async (req, res, next) => {
  try {
    const { name, conditions, formula } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    let finalConditions = Array.isArray(conditions) ? conditions : [];
    if (formula !== undefined) {
      try {
        finalConditions = parseFormulaString(formula);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    user.scoringSystems.push({
      name,
      conditions: finalConditions
    });

    await user.save();
    res.json({ success: true, scoringSystems: user.scoringSystems });
  } catch (error) {
    next(error);
  }
});

/**
 * Scoring Systems Pool Management: Edit a scoring system template
 */
router.put('/scoring-systems/:id', async (req, res, next) => {
  try {
    const { name, conditions, formula } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const sys = user.scoringSystems.id(req.params.id);
    if (!sys) return res.status(404).json({ error: 'Scoring system not found.' });

    if (name !== undefined) sys.name = name;
    
    if (formula !== undefined) {
      try {
        sys.conditions = parseFormulaString(formula);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    } else if (conditions !== undefined) {
      sys.conditions = Array.isArray(conditions) ? conditions : [];
    }

    await user.save();
    res.json({ success: true, scoringSystems: user.scoringSystems });
  } catch (error) {
    next(error);
  }
});

/**
 * Scoring Systems Pool Management: Delete a scoring system template
 */
router.delete('/scoring-systems/:id', async (req, res, next) => {
  try {
    const sysId = req.params.id;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.scoringSystems = user.scoringSystems.filter((s) => s._id.toString() !== sysId);
    await user.save();

    // Clean watchlist pointers referencing this deleted template
    await Watchlist.updateMany(
      { userId: req.user.id, assignedScoringSystemId: sysId },
      { $unset: { assignedScoringSystemId: "" } }
    );

    res.json({ success: true, scoringSystems: user.scoringSystems });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
