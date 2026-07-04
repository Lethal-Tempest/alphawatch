const User = require('../models/User');
const Watchlist = require('../models/Watchlist');
const Trade = require('../models/Trade');
const hdfcService = require('./hdfcService');
const candleAggregator = require('./candleAggregator');
const indicatorService = require('./indicatorService');
const angelOne = require('./angelOneService');
const emailService = require('./emailService');
const { evaluateCondition } = require('./alertEngine');

let currentlyRunning = false;

/**
 * Main auto-trade cycle. Scans all active whitelisted stocks across users,
 * resolves stock-specific named buy and sell conditions, retrieves required timeframes,
 * evaluates logic against real-time indicators, and processes executions.
 */
exports.runAutoTradeCycle = async (liveMarketState) => {
  if (currentlyRunning) {
    return;
  }
  currentlyRunning = true;

  try {
    // 1. Fetch all users who have auto-trading enabled globally
    const users = await User.find({ 'autoTradeConfig.enabled': true });
    if (!users || users.length === 0) {
      return;
    }

    for (const user of users) {
      const config = user.autoTradeConfig || {};
      const capital = config.capital || 50000;

      // 2. Fetch all watchlists for this user to gather auto-trade stocks
      const watchlists = await Watchlist.find({ userId: user._id });
      const stockMap = new Map();

      for (const wl of watchlists) {
        if (!wl.stocks) continue;
        for (const stock of wl.stocks) {
          if (stock.autoTradeEnabled && stock.assignedBuyConditionId && stock.assignedSellConditionId) {
            const key = `${stock.exchange.toUpperCase()}:${stock.symbol.toUpperCase()}`;
            stockMap.set(key, {
              symbol: stock.symbol,
              exchange: stock.exchange,
              assignedBuyConditionId: stock.assignedBuyConditionId,
              assignedSellConditionId: stock.assignedSellConditionId
            });
          }
        }
      }

      const autoTradeStocks = Array.from(stockMap.values());
      if (autoTradeStocks.length === 0) {
        continue;
      }

      // Fetch user's current positions from HDFC (live or mock-simulated)
      let positions = [];
      try {
        const posRes = await hdfcService.fetchPositions(user);
        if (posRes && posRes.status === 'success' && posRes.data && posRes.data.net) {
          positions = posRes.data.net;
        }
      } catch (err) {
        console.error(`[AutoTrade] Failed to fetch positions for user ${user.email}:`, err.message);
        continue;
      }

      // 3. Process each auto-trade stock
      for (const stock of autoTradeStocks) {
        const key = `${stock.exchange.toUpperCase()}:${stock.symbol.toUpperCase()}`;
        const tick = liveMarketState[key];
        if (!tick) continue;

        const price = tick.ltp;
        if (!price || price <= 0) continue;

        // Resolve named conditions from the User condition pool
        const buyCondObj = user.conditions.id(stock.assignedBuyConditionId);
        const sellCondObj = user.conditions.id(stock.assignedSellConditionId);

        // If either assigned condition has been deleted, skip execution
        if (!buyCondObj || !sellCondObj) {
          console.warn(`[AutoTrade] Stock ${key} is missing assigned condition templates (Buy: ${!!buyCondObj}, Sell: ${!!sellCondObj}). Skipping.`);
          continue;
        }

        const buyRules = buyCondObj.rules || [];
        const sellRules = sellCondObj.rules || [];

        if (buyRules.length === 0 && sellRules.length === 0) {
          continue;
        }

        // Collect all unique timeframes referenced in the rules
        const requiredTimeframes = new Set();
        buyRules.forEach((r) => { if (r.timeframe) requiredTimeframes.add(r.timeframe); });
        sellRules.forEach((r) => { if (r.timeframe) requiredTimeframes.add(r.timeframe); });

        // Fetch indicator candle sets and store evaluation snapshots for each required timeframe
        const indicatorsCache = {};
        let failedToLoadTf = false;

        for (const tf of requiredTimeframes) {
          if (!candleAggregator.hasHistory(key, tf)) {
            try {
              console.log(`[AutoTrade] Lazy-loading candles history for ${key} (${tf})...`);
              await candleAggregator.getOrFetchHistory(key, stock.exchange, stock.symbol, tf, () =>
                angelOne.fetchHistoricalCandles(stock.exchange, stock.symbol, tf)
              );
            } catch (err) {
              console.error(`[AutoTrade] Failed to load baseline candles for ${key} (${tf}):`, err.message);
              failedToLoadTf = true;
              break;
            }
          }

          const candles = candleAggregator.getCandles(key, tf);
          if (!candles || candles.length < 2) {
            failedToLoadTf = true;
            break;
          }

          const computed = indicatorService.computeAllIndicators(candles);
          const latest = {};
          const prev = {};

          for (const [indKey, arr] of Object.entries(computed)) {
            if (arr && arr.length > 0) {
              latest[indKey] = arr[arr.length - 1];
              prev[indKey] = arr.length > 1 ? arr[arr.length - 2] : null;
            } else {
              latest[indKey] = null;
              prev[indKey] = null;
            }
          }

          const lastCandle = candles[candles.length - 1];
          latest.open = +lastCandle.open;
          latest.high = +lastCandle.high;
          latest.low = +lastCandle.low;
          latest.close = +lastCandle.close;
          latest.volume = +lastCandle.volume;
          latest.ltp = price;

          const prevCandle = candles[candles.length - 2];
          prev.open = +prevCandle.open;
          prev.high = +prevCandle.high;
          prev.low = +prevCandle.low;
          prev.close = +prevCandle.close;
          prev.volume = +prevCandle.volume;
          prev.ltp = +prevCandle.close;

          indicatorsCache[tf] = { latest, prev };
        }

        if (failedToLoadTf) {
          continue;
        }

        // Determine if currently holding
        const positionItem = positions.find(
          (p) => p.security_id.toUpperCase() === stock.symbol.toUpperCase() && p.exchange.toUpperCase() === stock.exchange.toUpperCase()
        );
        const isHolding = positionItem && positionItem.net_qty > 0;
        const currentQty = isHolding ? positionItem.net_qty : 0;

        if (!isHolding) {
          // Evaluate Buy rules (all-AND)
          let buyTriggered = buyRules.length > 0;
          for (const rule of buyRules) {
            const tfInds = indicatorsCache[rule.timeframe];
            if (!evaluateCondition(rule, tfInds)) {
              buyTriggered = false;
              break;
            }
          }

          if (buyTriggered) {
            const targetQty = Math.max(1, Math.floor(capital / price));
            console.log(`[AutoTrade] BUY signal triggered for ${key} at ₹${price} using condition "${buyCondObj.name}". Qty: ${targetQty}`);

            const result = await hdfcService.placeOrder(user, stock, 'buy', price, targetQty);
            if (result && result.status === 'success') {
              const orderId = result.data.order_id;

              // Record Trade
              await Trade.create({
                userId: user._id,
                symbol: stock.symbol,
                exchange: stock.exchange,
                type: 'buy',
                price,
                quantity: targetQty,
                orderId,
                status: 'Traded',
                message: `Assigned rule: ${buyCondObj.name} | Mode: ${result.mode}`
              });

              // Clean up logs to keep latest 100 per user
              await pruneTradeLogs(user._id);

              // Send Notification Email
              try {
                await emailService.sendTradeEmail(user.email, {
                  symbol: stock.symbol,
                  exchange: stock.exchange,
                  type: 'buy',
                  price,
                  quantity: targetQty,
                  orderId,
                  mode: result.mode
                });
              } catch (mailErr) {
                console.error(`[AutoTrade] Failed to send email update:`, mailErr.message);
              }
            }
          }
        } else {
          // Evaluate Sell rules (all-AND)
          let sellTriggered = sellRules.length > 0;
          for (const rule of sellRules) {
            const tfInds = indicatorsCache[rule.timeframe];
            if (!evaluateCondition(rule, tfInds)) {
              sellTriggered = false;
              break;
            }
          }

          if (sellTriggered) {
            console.log(`[AutoTrade] SELL signal triggered for ${key} at ₹${price} using condition "${sellCondObj.name}". Qty: ${currentQty}`);

            const result = await hdfcService.placeOrder(user, stock, 'sell', price, currentQty);
            if (result && result.status === 'success') {
              const orderId = result.data.order_id;

              // Record Trade
              await Trade.create({
                userId: user._id,
                symbol: stock.symbol,
                exchange: stock.exchange,
                type: 'sell',
                price,
                quantity: currentQty,
                orderId,
                status: 'Traded',
                message: `Assigned rule: ${sellCondObj.name} | Mode: ${result.mode}`
              });

              // Clean up logs to keep latest 100 per user
              await pruneTradeLogs(user._id);

              // Send Notification Email
              try {
                await emailService.sendTradeEmail(user.email, {
                  symbol: stock.symbol,
                  exchange: stock.exchange,
                  type: 'sell',
                  price,
                  quantity: currentQty,
                  orderId,
                  mode: result.mode
                });
              } catch (mailErr) {
                console.error(`[AutoTrade] Failed to send email update:`, mailErr.message);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[AutoTradeEngine] Main cycle failed:', err.message);
  } finally {
    currentlyRunning = false;
  }
};

/**
 * Removes older trade logs to preserve only the latest 100 trades for a given user.
 */
async function pruneTradeLogs(userId) {
  try {
    const count = await Trade.countDocuments({ userId });
    if (count > 100) {
      const oldest = await Trade.find({ userId })
        .sort({ timestamp: 1 })
        .limit(count - 100);

      const idsToDelete = oldest.map((o) => o._id);
      await Trade.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`[AutoTrade] Pruned ${idsToDelete.length} old trades for user ${userId}`);
    }
  } catch (err) {
    console.error('[AutoTrade] Failed to prune trade logs:', err.message);
  }
}
