// backend/services/agentService.js
const axios = require('axios');
const Watchlist = require('../models/Watchlist');
const User = require('../models/User');
const Alert = require('../models/Alert');
const autotradeRoutes = require('../routes/autotrade');
const backtestController = require('../controllers/backtestController');

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-pro',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite'
];
/**
 * Technical reference system instruction for the AI model
 */
const SYSTEM_INSTRUCTION = `
You are the AlphaWatch Agentic AI Trading Assistant.
You are an expert in the AlphaWatch Trading System and its custom scripting language: **AlphaWatch Scoring Language (AWSL)**.

Your primary goal is to help users:
1. Manage their watchlists (add/remove stocks, get watchlists).
2. Create, edit, delete and assign custom Scoring Systems using AWSL formula expressions.
3. Configure real-time price alerts on watchlists or specific stocks.
4. Run backtests on watchlists using custom buy and sell strategies.

### 1. AlphaWatch Scoring Language (AWSL) Specifications:
AWSL evaluates statements from left to right. Every script modifies the default variable \`score\` (initialized to \`0.00\`).
Keywords:
- \`if\`, \`then\`, \`elseif\`, \`else\`, \`fi\`: Conditional blocks.
- \`score\`: Accumulation variable. E.g. \`score = score + 50\` or \`score = score - 30\`
- \`=\`: Assignment operator.

Operators:
- Arithmetic: \`+\`, \`-\`, \`*\`, \`/\`, and grouping with \`(\`, \`)\`
- Comparison: \`<\`, \`<=\`, \`>\`, \`>=\`, \`==\`, \`!=\`
- Crossover (\`crossover\`): e.g. \`5m:rsi14 crossover 30\`
- Crossunder (\`crossunder\`): e.g. \`5m:rsi14 crossunder 70\`

Operands (Format: \`<timeframe>:<indicator>\`):
- Timeframes: \`1m\`, \`5m\`, \`10m\`, \`15m\`, \`30m\`, \`1h\`, \`1d\`
- Basic Indicators: \`close\` (or \`ltp\`), \`open\`, \`high\`, \`low\`, \`volume\`, \`deltaClose\`, \`deltaSqClose\`, \`deltaVolume\`
- SMA: \`sma20\`, \`deltaSma20\`, \`deltaSqSma20\`, \`sma50\`, \`sma100\`, \`sma200\`
- EMA: \`ema20\`, \`deltaEma20\`, \`deltaSqEma20\`, \`ema50\`, \`ema100\`, \`ema200\`
- RSI: \`rsi14\`, \`deltaRsi14\`
- Bollinger Bands: \`bbUpper\`, \`bbMiddle\`, \`bbLower\`
- MACD: \`macdLine\`, \`macdSignal\`, \`macdHist\`, \`deltaMACD\`
- ADX / DMI: \`adx\`, \`plusDI\`, \`minusDI\`
- MFI: \`mfi14\`
- SMI: \`smiLine\`, \`smiSignal\`, \`smiDist\`, \`deltaSMI\`

#### Valid Formula Expression Examples:
- Simple score addition: \`if 1d:macdLine > 0 then score = score + 50 fi\`
- Nested condition and crossover: \`if 30m:smiLine < -40 then if 30m:smiLine crossover 30m:smiSignal then score = score + 100 fi fi\`
- Arithmetic expression: \`score = score + ( 30m:ema20 - 30m:ema50 ) * 100 / 30m:ema50\`

### 2. Backtesting and Alerts Condition Format:
When creating alerts or running backtests, condition inputs are structured arrays of groups, containing individual rule criteria.
Each rule matches:
- \`timeframe\`: one of \`1m\`, \`5m\`, \`10m\`, \`15m\`, \`30m\`, \`1h\`, \`1d\`
- \`leftIndicator\`: name of the indicator (e.g. \`close\`, \`rsi14\`, \`ema20\`, without the timeframe prefix!)
- \`operator\`: \`>\`, \`>=\`, \`==\`, \`<=\`, \`<\`, \`!=\`, \`crossover\`, \`crossunder\`
- \`rightType\`: \`value\` or \`indicator\`
- \`rightValue\`: number (required if rightType is value)
- \`rightIndicator\`: indicator name (required if rightType is indicator)

You must translate user's natural language descriptions of alerts and strategies into these structured formats when invoking tools.
If a user asks why a stock is scoring low/high, asks you to analyze or explain the watchlist scores, or asks why the predicted score does not match the dashboard, you MUST proactively invoke the \`calculate_watchlist_scores\` tool with the active watchlist's ID. If you need details on specific indicators not covered by the active formula, or if you need to analyze a stock outside the active watchlist's formula, you can use the \`get_stock_indicators\` tool. Use these fetched values to explain the exact math behind the dashboard scores.
Always explain the actions you take clearly in text.
`;

const AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'get_watchlists',
        description: 'Get all watchlists belonging to the current user.'
      },
      {
        name: 'create_watchlist',
        description: 'Create a new watchlist.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'The name of the new watchlist.' }
          },
          required: ['name']
        }
      },
      {
        name: 'delete_watchlist',
        description: 'Delete a watchlist by its ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            watchlistId: { type: 'STRING', description: 'The ID of the watchlist to delete.' }
          },
          required: ['watchlistId']
        }
      },
      {
        name: 'add_stock_to_watchlist',
        description: 'Add a stock to a watchlist.',
        parameters: {
          type: 'OBJECT',
          properties: {
            watchlistId: { type: 'STRING', description: 'The ID of the watchlist.' },
            symbol: { type: 'STRING', description: 'Stock ticker symbol, e.g., HDFCBANK, SBIN, RELIANCE.' },
            exchange: { type: 'STRING', description: 'Exchange name, either NSE or BSE.', enum: ['NSE', 'BSE'] }
          },
          required: ['watchlistId', 'symbol', 'exchange']
        }
      },
      {
        name: 'remove_stock_from_watchlist',
        description: 'Remove a stock from a watchlist.',
        parameters: {
          type: 'OBJECT',
          properties: {
            watchlistId: { type: 'STRING', description: 'The ID of the watchlist.' },
            symbol: { type: 'STRING', description: 'Stock ticker symbol to remove, e.g., SBIN.' }
          },
          required: ['watchlistId', 'symbol']
        }
      },
      {
        name: 'get_custom_scoring_systems',
        description: 'List all custom scoring systems templates in the user pool.'
      },
      {
        name: 'create_or_update_scoring_system',
        description: 'Create a new custom scoring system template or update an existing one using an AWSL formula string. Optionally assigns it to a watchlist.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'The name of the scoring system, e.g. "Trend Oscillator Score".' },
            formula: { type: 'STRING', description: 'The AWSL formula code to parse, e.g., "if 5m:close > 5m:sma20 then score = score + 10 fi".' },
            watchlistId: { type: 'STRING', description: 'Optional: Watchlist ID to instantly assign this scoring system to.' }
          },
          required: ['name', 'formula']
        }
      },
      {
        name: 'delete_scoring_system',
        description: 'Delete a custom scoring system by ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            scoringSystemId: { type: 'STRING', description: 'The ID of the scoring system to delete.' }
          },
          required: ['scoringSystemId']
        }
      },
      {
        name: 'assign_scoring_system_to_watchlist',
        description: 'Assign an existing custom scoring system template to a watchlist.',
        parameters: {
          type: 'OBJECT',
          properties: {
            watchlistId: { type: 'STRING', description: 'The ID of the watchlist.' },
            scoringSystemId: { type: 'STRING', description: 'The ID of the scoring system to assign. Set to null (or empty string) to unassign.' }
          },
          required: ['watchlistId', 'scoringSystemId']
        }
      },
      {
        name: 'get_alerts',
        description: 'Get all configured price alerts.'
      },
      {
        name: 'create_alert',
        description: 'Create a real-time price alert based on condition rules.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'The display name of the alert.' },
            targetType: { type: 'STRING', description: 'Whether it applies to specific stocks or a watchlist.', enum: ['specific_stocks', 'watchlist'] },
            watchlistId: { type: 'STRING', description: 'Required if targetType is "watchlist".' },
            stocks: {
              type: 'ARRAY',
              description: 'Required if targetType is "specific_stocks".',
              items: {
                type: 'OBJECT',
                properties: {
                  symbol: { type: 'STRING' },
                  exchange: { type: 'STRING', enum: ['NSE', 'BSE'] }
                },
                required: ['symbol', 'exchange']
              }
            },
            conditions: {
              type: 'ARRAY',
              description: 'List of condition items.',
              items: {
                type: 'OBJECT',
                properties: {
                  timeframe: { type: 'STRING', enum: ['1m', '5m', '10m', '15m', '30m', '1h', '1d'] },
                  leftIndicator: { type: 'STRING', description: 'Left indicator name (e.g. close, rsi14, ema50).' },
                  operator: { type: 'STRING', enum: ['>', '>=', '==', '<=', '<', '!=', 'crossover', 'crossunder'] },
                  rightType: { type: 'STRING', enum: ['value', 'indicator'] },
                  rightValue: { type: 'NUMBER', description: 'Numeric value if rightType is value.' },
                  rightIndicator: { type: 'STRING', description: 'Right indicator name if rightType is indicator.' }
                },
                required: ['timeframe', 'leftIndicator', 'operator', 'rightType']
              }
            },
            isRepeating: { type: 'BOOLEAN', description: 'Whether alert triggers repeatedly.' }
          },
          required: ['name', 'targetType', 'conditions']
        }
      },
      {
        name: 'delete_alert',
        description: 'Delete a price alert by ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            alertId: { type: 'STRING', description: 'The ID of the alert to delete.' }
          },
          required: ['alertId']
        }
      },
      {
        name: 'run_backtest',
        description: 'Execute a backtest strategy on a watchlist and retrieve percentage returns.',
        parameters: {
          type: 'OBJECT',
          properties: {
            watchlistId: { type: 'STRING', description: 'Watchlist ID.' },
            timeframe: { type: 'STRING', enum: ['1m', '5m', '10m', '15m', '30m', '1h', '1d'] },
            initialCapital: { type: 'NUMBER', description: 'Initial backtest capital (default 50000).' },
            transactionCostPct: { type: 'NUMBER', description: 'Cost percentage (e.g. 0.02).' },
            buyConditions: {
              type: 'ARRAY',
              description: 'Rules for when to buy. Array of groups containing rules.',
              items: {
                type: 'OBJECT',
                properties: {
                  rules: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        timeframe: { type: 'STRING', enum: ['1m', '5m', '10m', '15m', '30m', '1h', '1d'] },
                        leftIndicator: { type: 'STRING', description: 'e.g. close, rsi14, ema20' },
                        operator: { type: 'STRING', enum: ['>', '>=', '==', '<=', '<', '!=', 'crossover', 'crossunder'] },
                        rightType: { type: 'STRING', enum: ['value', 'indicator'] },
                        rightValue: { type: 'NUMBER' },
                        rightIndicator: { type: 'STRING' }
                      },
                      required: ['timeframe', 'leftIndicator', 'operator', 'rightType']
                    }
                  }
                },
                required: ['rules']
              }
            },
            sellConditions: {
              type: 'ARRAY',
              description: 'Rules for when to sell. Array of groups containing rules and sell percentage.',
              items: {
                type: 'OBJECT',
                properties: {
                  rules: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        timeframe: { type: 'STRING', enum: ['1m', '5m', '10m', '15m', '30m', '1h', '1d'] },
                        leftIndicator: { type: 'STRING', description: 'e.g. close, rsi14, ema20' },
                        operator: { type: 'STRING', enum: ['>', '>=', '==', '<=', '<', '!=', 'crossover', 'crossunder'] },
                        rightType: { type: 'STRING', enum: ['value', 'indicator'] },
                        rightValue: { type: 'NUMBER' },
                        rightIndicator: { type: 'STRING' }
                      },
                      required: ['timeframe', 'leftIndicator', 'operator', 'rightType']
                    }
                  },
                  sellPct: { type: 'NUMBER', description: 'Percentage of shares to sell (default 100).' }
                },
                required: ['rules']
              }
            }
          },
          required: ['watchlistId', 'timeframe', 'initialCapital', 'buyConditions', 'sellConditions']
        }
      },
      {
        name: 'get_stock_indicators',
        description: 'Fetch real-time or historical candle values and calculated indicators (SMA, EMA, RSI, MACD, ADX, plusDI, minusDI, etc.) for a specific stock ticker on a given timeframe.',
        parameters: {
          type: 'OBJECT',
          properties: {
            symbol: { type: 'STRING', description: 'Stock ticker symbol, e.g., HDFCBANK, SBIN, RELIANCE, ORCHPHARMA.' },
            exchange: { type: 'STRING', description: 'Exchange name, either NSE or BSE.', enum: ['NSE', 'BSE'] },
            timeframe: { type: 'STRING', description: 'Timeframe interval to fetch indicators for.', enum: ['1m', '5m', '10m', '15m', '30m', '1h', '1d'] }
          },
          required: ['symbol', 'exchange', 'timeframe']
        }
      },
      {
        name: 'calculate_watchlist_scores',
        description: 'Calculate and fetch the exact scoring breakdown and final scores for all stocks in a watchlist using its active assigned scoring system.',
        parameters: {
          type: 'OBJECT',
          properties: {
            watchlistId: { type: 'STRING', description: 'The ID of the watchlist to analyze.' }
          },
          required: ['watchlistId']
        }
      }
    ]
  }
];

/**
 * Executes a function requested by the AI model.
 */
async function executeToolCall(userId, name, args) {
  console.log(`🤖 Agent executing tool: ${name} with args:`, JSON.stringify(args));
  try {
    switch (name) {
      case 'get_watchlists': {
        const watchlists = await Watchlist.find({ userId });
        return { success: true, watchlists };
      }
      
      case 'create_watchlist': {
        const { name: wlName } = args;
        if (!wlName?.trim()) throw new Error('Watchlist name is required.');
        const wl = await Watchlist.create({ userId, name: wlName.trim(), stocks: [] });
        return { success: true, watchlist: wl };
      }

      case 'delete_watchlist': {
        const { watchlistId } = args;
        const wl = await Watchlist.findOneAndDelete({ _id: watchlistId, userId });
        if (!wl) throw new Error('Watchlist not found or unauthorized.');
        return { success: true, message: `Watchlist '${wl.name}' deleted.` };
      }

      case 'add_stock_to_watchlist': {
        const { watchlistId, symbol, exchange } = args;
        const wl = await Watchlist.findOneAndUpdate(
          { _id: watchlistId, userId },
          { $addToSet: { stocks: { symbol: symbol.toUpperCase(), exchange: exchange.toUpperCase() } } },
          { new: true }
        );
        if (!wl) throw new Error('Watchlist not found or unauthorized.');
        return { success: true, watchlist: wl };
      }

      case 'remove_stock_from_watchlist': {
        const { watchlistId, symbol } = args;
        const wl = await Watchlist.findOneAndUpdate(
          { _id: watchlistId, userId },
          { $pull: { stocks: { symbol: symbol.toUpperCase() } } },
          { new: true }
        );
        if (!wl) throw new Error('Watchlist not found or unauthorized.');
        return { success: true, watchlist: wl };
      }

      case 'get_custom_scoring_systems': {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found.');
        return { success: true, scoringSystems: user.scoringSystems || [] };
      }

      case 'create_or_update_scoring_system': {
        const { name: sysName, formula, watchlistId } = args;
        if (!sysName) throw new Error('Name is required.');

        // Parse formula into token array
        let conditions;
        try {
          conditions = autotradeRoutes.parseFormulaString(formula);
        } catch (err) {
          throw new Error(`Formula parsing failed: ${err.message}`);
        }

        const user = await User.findById(userId);
        if (!user) throw new Error('User not found.');

        // Check if custom scoring system already exists by name
        let targetSystem = user.scoringSystems.find(s => s.name.toLowerCase() === sysName.toLowerCase());
        if (targetSystem) {
          targetSystem.conditions = conditions;
        } else {
          user.scoringSystems.push({
            name: sysName,
            conditions
          });
          targetSystem = user.scoringSystems[user.scoringSystems.length - 1];
        }

        await user.save();

        let wlMessage = '';
        if (watchlistId) {
          const wl = await Watchlist.findOneAndUpdate(
            { _id: watchlistId, userId },
            { assignedScoringSystemId: targetSystem._id },
            { new: true }
          );
          if (wl) wlMessage = ` and assigned to watchlist '${wl.name}'`;
        }

        return {
          success: true,
          scoringSystem: targetSystem,
          message: `Scoring system '${sysName}' successfully compiled${wlMessage}.`,
          scoringSystems: user.scoringSystems
        };
      }

      case 'delete_scoring_system': {
        const { scoringSystemId } = args;
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found.');

        user.scoringSystems = user.scoringSystems.filter(s => s._id.toString() !== scoringSystemId);
        await user.save();

        // Clean watchlist pointers referencing this deleted template
        await Watchlist.updateMany(
          { userId, assignedScoringSystemId: scoringSystemId },
          { $unset: { assignedScoringSystemId: "" } }
        );

        return { success: true, message: 'Scoring system deleted and unassigned from watchlists.' };
      }

      case 'assign_scoring_system_to_watchlist': {
        const { watchlistId, scoringSystemId } = args;
        const sysIdVal = (scoringSystemId === 'null' || !scoringSystemId) ? null : scoringSystemId;

        const wl = await Watchlist.findOneAndUpdate(
          { _id: watchlistId, userId },
          { assignedScoringSystemId: sysIdVal },
          { new: true }
        );
        if (!wl) throw new Error('Watchlist not found or unauthorized.');
        return { success: true, watchlist: wl, message: sysIdVal ? 'Scoring system assigned.' : 'Scoring system unassigned.' };
      }

      case 'get_alerts': {
        const alerts = await Alert.find({ userId }).populate('watchlistId').sort({ createdAt: -1 });
        return { success: true, alerts };
      }

      case 'create_alert': {
        const { name: alertName, targetType, watchlistId, stocks, conditions, isRepeating } = args;
        
        // Secure verify watchlistId
        if (targetType === 'watchlist' && watchlistId) {
          const wl = await Watchlist.findOne({ _id: watchlistId, userId });
          if (!wl) throw new Error('Watchlist not found or unauthorized.');
        }

        const alert = await Alert.create({
          userId,
          name: alertName,
          targetType,
          watchlistId: targetType === 'watchlist' ? watchlistId : null,
          stocks: targetType === 'specific_stocks' ? stocks : [],
          conditions,
          isRepeating: !!isRepeating,
          status: 'active'
        });

        // Trigger immediate evaluation in background
        const alertEngine = require('./alertEngine');
        alertEngine.evaluateAlertImmediately(alert._id);

        return { success: true, alert, message: `Alert '${alertName}' created successfully and is now active.` };
      }

      case 'delete_alert': {
        const { alertId } = args;
        const alert = await Alert.findOneAndDelete({ _id: alertId, userId });
        if (!alert) throw new Error('Alert not found or unauthorized.');
        return { success: true, message: `Alert '${alert.name}' deleted successfully.` };
      }

      case 'run_backtest': {
        const { watchlistId, timeframe, initialCapital, transactionCostPct, buyConditions, sellConditions } = args;

        // Verify watchlist ownership
        const wl = await Watchlist.findOne({ _id: watchlistId, userId });
        if (!wl) throw new Error('Watchlist not found or unauthorized.');

        let backtestRes;
        const req = {
          body: { watchlistId, timeframe, initialCapital, transactionCostPct, buyConditions, sellConditions },
          user: { id: userId }
        };
        const res = {
          json: (data) => { backtestRes = data; }
        };
        const next = (err) => { throw err; };

        // Call backtestController directly
        await backtestController.runBacktest(req, res, next);

        if (!backtestRes || !backtestRes.success) {
          throw new Error(backtestRes?.error || 'Backtest failed execution.');
        }

        // Clean output size for LLM: omit long candles logs, keep summary + trades count
        const summaryResults = backtestRes.results.map(r => ({
          symbol: r.symbol,
          exchange: r.exchange,
          initialCapital: r.initialCapital,
          finalAmount: r.finalAmount,
          percentageChange: r.percentageChange,
          tradesCount: r.tradesCount,
          error: r.error
        }));

        return { success: true, results: summaryResults };
      }

      case 'get_stock_indicators': {
        const { symbol, exchange, timeframe } = args;
        const key = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;

        const angelOne = require('./angelOneService');
        const candleAggregator = require('./candleAggregator');
        const indicatorService = require('./indicatorService');

        await candleAggregator.getOrFetchHistory(key, exchange, symbol, timeframe, () =>
          angelOne.fetchHistoricalCandles(exchange, symbol, timeframe)
        );

        const candles = candleAggregator.getCandles(key, timeframe);
        if (!candles || candles.length === 0) {
          throw new Error(`No candle data found for ${key} on timeframe ${timeframe}`);
        }

        const computed = indicatorService.computeAllIndicators(candles);
        const latestIdx = candles.length - 1;
        
        const latestCandle = candles[latestIdx];
        const latestData = {
          timestamp: latestCandle.timestamp,
          open: +latestCandle.open,
          high: +latestCandle.high,
          low: +latestCandle.low,
          close: +latestCandle.close,
          volume: +latestCandle.volume
        };

        const prevIdx = latestIdx - 1;
        const prevCandle = prevIdx >= 0 ? candles[prevIdx] : null;
        const prevData = prevCandle ? {
          timestamp: prevCandle.timestamp,
          open: +prevCandle.open,
          high: +prevCandle.high,
          low: +prevCandle.low,
          close: +prevCandle.close,
          volume: +prevCandle.volume
        } : null;

        const latestIndicators = {};
        const prevIndicators = {};

        for (const [indKey, arr] of Object.entries(computed)) {
          if (arr && arr.length > latestIdx) {
            latestIndicators[indKey] = arr[latestIdx];
            if (prevIdx >= 0 && arr.length > prevIdx) {
              prevIndicators[indKey] = arr[prevIdx];
            }
          }
        }

        return {
          success: true,
          symbol,
          exchange,
          timeframe,
          latest: { ...latestData, ...latestIndicators },
          previous: prevData ? { ...prevData, ...prevIndicators } : null
        };
      }

      case 'calculate_watchlist_scores': {
        const { watchlistId } = args;
        const result = await evaluateWatchlistScoresForAgent(userId, watchlistId);
        return { success: true, ...result };
      }

      default:
        throw new Error(`Unknown tool name: ${name}`);
    }
  } catch (error) {
    console.error(`❌ Tool execution failed [${name}]:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Processes chat message with the Agentic AI loop
 */
exports.runAgentChat = async (userId, userMessage, currentWatchlistId) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in backend .env.');
    }

    // Pre-load current watchlist details, custom scoring systems pool, and active formulas
    let watchlistContext = 'No active watchlist selected.';
    let customScoringSystemsContext = 'No custom scoring systems defined in user pool.';
    let activeScoringSystemContext = 'Default close-price scoring is active (no custom system assigned).';

    try {
      const user = await User.findById(userId);
      const watchlists = await Watchlist.find({ userId });
      const currentWl = currentWatchlistId ? watchlists.find(w => w._id.toString() === currentWatchlistId) : null;

      // Helper to serialize token array to AWSL string
      const serializeConditions = (conds) => {
        if (!Array.isArray(conds) || conds.length === 0) return 'None';
        return conds.map(t => {
          if (!t) return '';
          if (t.type === 'operand') {
            return t.valueType === 'value' ? t.value : `${t.timeframe || '5m'}:${t.indicator}`;
          }
          return t.valueStr;
        }).filter(Boolean).join(' ');
      };

      if (user && user.scoringSystems && user.scoringSystems.length > 0) {
        customScoringSystemsContext = 'User Custom Scoring Systems Pool:\n' + user.scoringSystems.map(sys => 
          `- Name: "${sys.name}" (ID: ${sys._id})\n  Formula: \`${serializeConditions(sys.conditions)}\``
        ).join('\n');
      }

      if (currentWl) {
        let assignedSysInfo = 'None';
        if (currentWl.assignedScoringSystemId && user) {
          const sys = user.scoringSystems.id(currentWl.assignedScoringSystemId);
          if (sys) {
            assignedSysInfo = `"${sys.name}" (ID: ${sys._id}) with formula: \`${serializeConditions(sys.conditions)}\``;
            activeScoringSystemContext = `Active Watchlist Scoring Formula is: \`${serializeConditions(sys.conditions)}\``;
          }
        } else if (currentWl.scoreConditions && currentWl.scoreConditions.length > 0) {
          assignedSysInfo = `Watchlist-specific inline conditions: \`${serializeConditions(currentWl.scoreConditions)}\``;
          activeScoringSystemContext = `Active Watchlist Scoring Formula is: \`${serializeConditions(currentWl.scoreConditions)}\``;
        }

        watchlistContext = `Active Watchlist:\n` +
          `- Name: "${currentWl.name}"\n` +
          `- ID: ${currentWl._id}\n` +
          `- Assigned Scoring System: ${assignedSysInfo}\n` +
          `- Stocks in Watchlist: ${currentWl.stocks.map(s => `${s.exchange}:${s.symbol}`).join(', ') || 'None'}`;
      }
    } catch (err) {
      console.error('Error preloading watchlist/scoring context:', err);
    }

    // We maintain a single conversation turn in this endpoint. 
    // System Instruction is injected into the payload.
    const contents = [
      {
        role: 'user',
        parts: [
          { text: `Context:\n${watchlistContext}\n\n${activeScoringSystemContext}\n\n${customScoringSystemsContext}\n\nUser request: ${userMessage}` }
        ]
      }
    ];

    const mutatingTools = new Set([
      'create_watchlist', 'delete_watchlist',
      'add_stock_to_watchlist', 'remove_stock_from_watchlist',
      'create_or_update_scoring_system', 'delete_scoring_system',
      'assign_scoring_system_to_watchlist', 'create_alert', 'delete_alert'
    ]);

    let loop = true;
    let iterations = 0;
    const maxIterations = 8; // Prevent infinite tool loops
    let finalResponseText = '';
    let refreshRequired = false;

    while (loop && iterations < maxIterations) {
      iterations++;
      console.log(`🌐 Calling Gemini API (iteration ${iterations})...`);

      const payload = {
        contents,
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        tools: AGENT_TOOLS
      };

      // Call Gemini API with model fallback
      let response;
      let apiSuccess = false;
      let lastApiError = null;

      for (const model of GEMINI_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        try {
          console.log(`🤖 Attempting request using model: ${model}`);
          response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20000 // 20s timeout per call
          });
          apiSuccess = true;
          break;
        } catch (err) {
          const status = err.response?.status;
          const statusText = err.response?.statusText || err.message;
          console.warn(`⚠️ Model ${model} failed (Status: ${status}, Info: ${statusText}). Trying next model...`);
          lastApiError = err;
        }
      }

      if (!apiSuccess) {
        throw lastApiError;
      }

      const candidate = response.data?.candidates?.[0];
      const message = candidate?.content;

      if (!message) {
        throw new Error('Invalid response received from Gemini API.');
      }

      // Add model's response to the conversation history
      contents.push(message);

      const parts = message.parts || [];
      const functionCalls = parts.filter(p => p.functionCall);

      if (functionCalls.length > 0) {
        // Gemini requested one or more function calls. Execute them.
        const toolParts = [];

        for (const fc of functionCalls) {
          const { name, args } = fc.functionCall;
          if (mutatingTools.has(name)) {
            refreshRequired = true;
          }
          const result = await executeToolCall(userId, name, args);

          toolParts.push({
            functionResponse: {
              name,
              response: result
            }
          });
        }

        // Add tool execution responses to conversation history
        contents.push({
          role: 'tool',
          parts: toolParts
        });
      } else {
        // No function calls, model returned a final text response.
        const textPart = parts.find(p => p.text);
        finalResponseText = textPart?.text || 'Task completed.';
        loop = false;
      }
    }

    if (iterations >= maxIterations) {
      finalResponseText = "I encountered an issue executing too many actions in a single turn. Please try refining your request.";
    }

    return { response: finalResponseText, refreshRequired };
  } catch (error) {
    console.error('💥 All Gemini model attempts failed:', error.message);
    const status = error.response?.status;
    let friendlyMessage = "I encountered an error communicating with the AI service. Please try again.";

    if (status === 429) {
      friendlyMessage = "⚠️ **Rate Limit Exceeded (HTTP 429)**: The AI API rate limit has been reached. Please wait a minute before sending another command.";
    } else if (status === 503 || status === 502 || status === 504) {
      friendlyMessage = `⚠️ **Service Unavailable (HTTP ${status})**: The AI service is currently overloaded or down. Please try again in a few seconds.`;
    } else if (status === 400) {
      friendlyMessage = "⚠️ **Bad Request (HTTP 400)**: The AI service rejected the prompt format. This can happen if the parameters or formula text have unsupported characters.";
    } else if (status === 403 || status === 401) {
      friendlyMessage = `⚠️ **Authentication Error (HTTP ${status})**: Your API key appears to be invalid or unauthorized. Please check that \`GEMINI_API_KEY\` is configured correctly in the backend environment.`;
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      friendlyMessage = "⚠️ **Timeout Error**: The request to the AI service timed out. Please check your internet connection and try again.";
    } else if (error.message) {
      friendlyMessage = `⚠️ **Error Details**: ${error.message}`;
    }

    return {
      response: friendlyMessage,
      refreshRequired: false
    };
  }
};

async function evaluateWatchlistScoresForAgent(userId, watchlistId) {
  const wl = await Watchlist.findOne({ _id: watchlistId, userId });
  if (!wl) throw new Error('Watchlist not found or unauthorized.');

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found.');

  let systemName = 'Default close-price scoring';
  let conditions = [];

  if (wl.assignedScoringSystemId) {
    const sys = user.scoringSystems.id(wl.assignedScoringSystemId);
    if (sys) {
      systemName = sys.name;
      conditions = sys.conditions || [];
    }
  } else if (wl.scoreConditions && wl.scoreConditions.length > 0) {
    systemName = 'Inline Watchlist Scoring';
    conditions = wl.scoreConditions;
  }

  // If no conditions, return default close-price scoring
  if (conditions.length === 0) {
    const results = wl.stocks.map(s => ({
      symbol: s.symbol,
      exchange: s.exchange,
      score: 0.0,
      indicators: {}
    }));
    return { systemName, formula: 'Default close-price scoring', results };
  }

  // Parse conditions to AST
  const parseTokensToAST = (tokens) => {
    let i = 0;
    function parseStatements() {
      const statements = [];
      while (i < tokens.length) {
        const token = tokens[i];
        if (token.type === 'keyword' && ['elseif', 'else', 'fi'].includes(token.valueStr)) {
          break;
        }
        statements.push(parseStatement());
      }
      return statements;
    }
    function parseStatement() {
      const token = tokens[i];
      if (token && token.type === 'keyword' && token.valueStr === 'if') {
        i++; // consume 'if'
        const conditionTokens = [];
        while (i < tokens.length && !(tokens[i].type === 'keyword' && tokens[i].valueStr === 'then')) {
          conditionTokens.push(tokens[i]);
          i++;
        }
        if (i < tokens.length) i++; // consume 'then'
        const branches = [{ condition: conditionTokens, body: null }];
        branches[0].body = parseStatements();
        let elseBody = null;
        while (i < tokens.length && tokens[i].type === 'keyword' && tokens[i].valueStr === 'elseif') {
          i++; // consume 'elseif'
          const elifCond = [];
          while (i < tokens.length && !(tokens[i].type === 'keyword' && tokens[i].valueStr === 'then')) {
            elifCond.push(tokens[i]);
            i++;
          }
          if (i < tokens.length) i++; // consume 'then'
          const elifBody = parseStatements();
          branches.push({ condition: elifCond, body: elifBody });
        }
        if (i < tokens.length && tokens[i].type === 'keyword' && tokens[i].valueStr === 'else') {
          i++; // consume 'else'
          elseBody = parseStatements();
        }
        if (i < tokens.length && tokens[i].type === 'keyword' && tokens[i].valueStr === 'fi') {
          i++; // consume 'fi'
        }
        return { type: 'if', branches, elseBody };
      }
      if (token && token.type === 'keyword' && token.valueStr === 'score' && i + 1 < tokens.length && tokens[i + 1].type === 'assignment') {
        i += 2; // consume 'score' and '='
        const exprTokens = [];
        while (i < tokens.length) {
          const nextT = tokens[i];
          if (nextT.type === 'keyword') {
            if (['if', 'elseif', 'else', 'fi'].includes(nextT.valueStr)) {
              break;
            }
            if (nextT.valueStr === 'score' && i + 1 < tokens.length && tokens[i + 1].type === 'assignment') {
              break;
            }
          }
          exprTokens.push(nextT);
          i++;
        }
        return { type: 'assignment', expression: exprTokens };
      }
      const exprTokens = [];
      while (i < tokens.length) {
        const nextT = tokens[i];
        if (nextT.type === 'keyword' && ['if', 'elseif', 'else', 'fi'].includes(nextT.valueStr)) {
          break;
        }
        if (nextT.type === 'keyword' && nextT.valueStr === 'score' && i + 1 < tokens.length && tokens[i + 1].type === 'assignment') {
          break;
        }
        exprTokens.push(nextT);
        i++;
      }
      return { type: 'expression', expression: exprTokens };
    }
    return parseStatements();
  };

  const statements = parseTokensToAST(conditions);

  // Compile AST to JS function body
  function compileExpr(tokens, scoreVarName, usedInds) {
    const parts = tokens.map(t => {
      if (t.type === 'keyword' && t.valueStr === 'score') return scoreVarName;
      if (t.type === 'operand') {
        if (t.valueType === 'value') return String(parseFloat(t.value ?? 0));
        const key = `${t.timeframe}:${t.indicator}`;
        usedInds.add(key);
        return `_getInd(${JSON.stringify(t.timeframe)}, ${JSON.stringify(t.indicator)}, false)`;
      }
      return t.valueStr || t.raw || '';
    });
    return parts.join(' ');
  }

  function compilePrevExpr(tokens, scoreVarName, usedInds) {
    const parts = tokens.map(t => {
      if (t.type === 'keyword' && t.valueStr === 'score') return scoreVarName;
      if (t.type === 'operand') {
        if (t.valueType === 'value') return String(parseFloat(t.value ?? 0));
        const key = `${t.timeframe}:${t.indicator}`;
        usedInds.add(key);
        return `_getInd(${JSON.stringify(t.timeframe)}, ${JSON.stringify(t.indicator)}, true)`;
      }
      return t.valueStr || t.raw || '';
    });
    return parts.join(' ');
  }

  function compileCondition(exprTokens, usedInds) {
    const compOps = ['crossover', 'crossunder', '>=', '<=', '==', '!=', '>', '<'];
    let compOpIdx = -1;
    let compOp = null;
    for (let i = 0; i < exprTokens.length; i++) {
      const raw = (exprTokens[i].valueStr || exprTokens[i].raw || '').toLowerCase();
      if (compOps.includes(raw)) { compOpIdx = i; compOp = raw; break; }
    }
    if (compOpIdx !== -1) {
      const left  = exprTokens.slice(0, compOpIdx);
      const right = exprTokens.slice(compOpIdx + 1);
      const lExpr   = compileExpr(left, '_score', usedInds);
      const rExpr   = compileExpr(right, '_score', usedInds);
      const lPrev   = compilePrevExpr(left, '_score', usedInds);
      const rPrev   = compilePrevExpr(right, '_score', usedInds);
      switch (compOp) {
        case 'crossover':  return `((${lExpr}) >= (${rExpr}) && (${lPrev}) < (${rPrev}))`;
        case 'crossunder': return `((${lExpr}) <= (${rExpr}) && (${lPrev}) > (${rPrev}))`;
        default: return `((${lExpr}) ${compOp} (${rExpr}))`;
      }
    }
    return compileExpr(exprTokens, '_score', usedInds);
  }

  const usedInds = new Set();
  let lines = [];
  function compileStmts(stmtList, indent) {
    const pad = '  '.repeat(indent);
    for (const stmt of stmtList) {
      if (stmt.type === 'assignment') {
        lines.push(`${pad}_score = (${compileExpr(stmt.expression, '_score', usedInds)});`);
      } else if (stmt.type === 'expression') {
        const expr = compileExpr(stmt.expression, '_score', usedInds);
        if (expr.trim()) lines.push(`${pad}_score = (${expr});`);
      } else if (stmt.type === 'if') {
        for (let b = 0; b < stmt.branches.length; b++) {
          const cond = compileCondition(stmt.branches[b].condition, usedInds);
          lines.push(`${pad}${b === 0 ? 'if' : 'else if'} (${cond}) {`);
          compileStmts(stmt.branches[b].body, indent + 1);
          lines.push(`${pad}}`);
        }
        if (stmt.elseBody) {
          lines.push(`${pad}else {`);
          compileStmts(stmt.elseBody, indent + 1);
          lines.push(`${pad}}`);
        }
      }
    }
  }

  compileStmts(statements, 0);
  const body = `'use strict';\nlet _score = 0;\n${lines.join('\n')}\nreturn _score;`;
  const compiledFn = new Function('_getInd', body);

  // Reconstruct formula string
  const serializeConditions = (conds) => {
    return conds.map(t => {
      if (!t) return '';
      if (t.type === 'operand') {
        return t.valueType === 'value' ? t.value : `${t.timeframe || '5m'}:${t.indicator}`;
      }
      return t.valueStr;
    }).filter(Boolean).join(' ');
  };
  const formulaStr = serializeConditions(conditions);

  const angelOne = require('./angelOneService');
  const candleAggregator = require('./candleAggregator');
  const indicatorService = require('./indicatorService');

  const results = [];

  // Evaluate for each stock
  for (const s of wl.stocks) {
    const stockKey = `${s.exchange.toUpperCase()}:${s.symbol.toUpperCase()}`;

    // Get timeframes we need to fetch
    const timeframes = new Set([...usedInds].map(key => key.split(':')[0]));
    if (timeframes.size === 0) timeframes.add('5m'); // default

    const allCandles = {};
    const allComputed = {};

    for (const tf of timeframes) {
      const indicatorsKey = `${stockKey}:${tf}`;
      try {
        await candleAggregator.getOrFetchHistory(indicatorsKey, s.exchange, s.symbol, tf, () =>
          angelOne.fetchHistoricalCandles(s.exchange, s.symbol, tf)
        );
        const candles = candleAggregator.getCandles(indicatorsKey, tf);
        if (candles && candles.length > 0) {
          allCandles[indicatorsKey] = candles;
          allComputed[indicatorsKey] = indicatorService.computeAllIndicators(candles);
        }
      } catch (err) {
        console.warn(`Failed fetching candles for ${indicatorsKey}:`, err.message);
      }
    }

    const getInd = (tf, indicatorName, isPrev) => {
      const indicatorsKey = `${stockKey}:${tf}`;
      const computed = allComputed[indicatorsKey];
      const candles = allCandles[indicatorsKey];
      
      if (!candles || candles.length === 0) return 0;
      const latestIdx = candles.length - 1;
      const idx = isPrev ? latestIdx - 1 : latestIdx;
      if (idx < 0) return 0;

      if (indicatorName === 'close' || indicatorName === 'ltp') return +candles[idx].close;
      if (indicatorName === 'open') return +candles[idx].open;
      if (indicatorName === 'high') return +candles[idx].high;
      if (indicatorName === 'low') return +candles[idx].low;
      if (indicatorName === 'volume') return +candles[idx].volume;

      if (!computed) return 0;
      const arr = computed[indicatorName];
      if (!arr || !arr.length) return 0;
      const v = arr[idx];
      return v != null && !isNaN(v) ? v : 0;
    };

    let computedScore = 0;
    try {
      computedScore = compiledFn(getInd);
      computedScore = parseFloat(computedScore.toFixed(2));
    } catch (err) {
      console.error(`Eval error for ${stockKey}:`, err.message);
    }

    // Capture indicator values used in this stock's math
    const indicatorsData = {};
    for (const key of usedInds) {
      const [tf, ind] = key.split(':');
      indicatorsData[`${tf}:${ind} (latest)`] = getInd(tf, ind, false);
      indicatorsData[`${tf}:${ind} (previous)`] = getInd(tf, ind, true);
    }

    results.push({
      symbol: s.symbol,
      exchange: s.exchange,
      score: computedScore,
      indicatorValuesUsed: indicatorsData
    });
  }

  return {
    systemName,
    formula: formulaStr,
    results
  };
}
