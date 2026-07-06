// ─────────────────────────────────────────────────────────────────────────────
// backend/services/alertEngine.js
//
// Evaluates multi-condition alerts. Performs background tracking.
// Fires Socket.io real-time browser alerts and nodemailer emails.
// ─────────────────────────────────────────────────────────────────────────────
const Alert = require('../models/Alert');
const candleAggregator = require('./candleAggregator');
const indicatorService = require('./indicatorService');
const emailService = require('./emailService');

let ioInstance;
const currentlyEvaluating = new Set();

exports.init = (io) => {
  ioInstance = io;
};

/**
 * Fetch all active alerts populated with user and watchlist details once.
 */
exports.getActiveAlerts = async () => {
  try {
    return await Alert.find({ status: 'active' })
      .populate('userId')
      .populate('watchlistId');
  } catch (err) {
    console.error('[AlertEngine] getActiveAlerts error:', err.message);
    return [];
  }
};

/**
 * Return all stock keys currently targeted by active alerts.
 * Polling loop uses this to keep active background polling alive.
 */
exports.getActiveAlertKeys = async (activeAlerts) => {
  try {
    if (!activeAlerts) {
      activeAlerts = await exports.getActiveAlerts();
    }
    const keys = new Set();
    for (const alert of activeAlerts) {
      if (alert.targetType === 'specific_stocks' && alert.stocks) {
        for (const stock of alert.stocks) {
          keys.add(`${stock.exchange.toUpperCase()}:${stock.symbol.toUpperCase()}`);
        }
      } else if (alert.targetType === 'watchlist' && alert.watchlistId && alert.watchlistId.stocks) {
        for (const stock of alert.watchlistId.stocks) {
          keys.add(`${stock.exchange.toUpperCase()}:${stock.symbol.toUpperCase()}`);
        }
      }
    }
    return Array.from(keys);
  } catch (err) {
    console.error('[AlertEngine] getActiveAlertKeys error:', err.message);
    return [];
  }
};

/**
 * Helper: evaluates a single operator condition against indicator values.
 */
function evaluateCondition(cond, indicators) {
  if (!indicators || !indicators.latest) return false;
  const leftVal = indicators.latest[cond.leftIndicator];
  if (leftVal == null) return false;

  let rightVal;
  if (cond.rightType === 'value') {
    rightVal = cond.rightValue;
  } else if (cond.rightType === 'indicator') {
    rightVal = indicators.latest[cond.rightIndicator];
  }
  if (rightVal == null) return false;

  switch (cond.operator) {
    case '>':  return leftVal > rightVal;
    case '>=': return leftVal >= rightVal;
    case '==': return leftVal === rightVal;
    case '<=': return leftVal <= rightVal;
    case '<':  return leftVal < rightVal;
    case '!=': return leftVal !== rightVal;
    case 'crossover': {
      const prevLeftVal = indicators.prev ? indicators.prev[cond.leftIndicator] : null;
      if (prevLeftVal == null) return false;
      let prevRightVal;
      if (cond.rightType === 'value') {
        prevRightVal = cond.rightValue;
      } else if (cond.rightType === 'indicator' && indicators.prev) {
        prevRightVal = indicators.prev[cond.rightIndicator];
      }
      if (prevRightVal == null) return false;
      return leftVal >= rightVal && prevLeftVal < prevRightVal;
    }
    case 'crossunder': {
      const prevLeftVal = indicators.prev ? indicators.prev[cond.leftIndicator] : null;
      if (prevLeftVal == null) return false;
      let prevRightVal;
      if (cond.rightType === 'value') {
        prevRightVal = cond.rightValue;
      } else if (cond.rightType === 'indicator' && indicators.prev) {
        prevRightVal = indicators.prev[cond.rightIndicator];
      }
      if (prevRightVal == null) return false;
      return leftVal <= rightVal && prevLeftVal > prevRightVal;
    }
    default:   return false;
  }
}

/**
 * Evaluate all active alerts targeting the ticked stock key.
 */
exports.evaluateAll = async (activeAlerts, liveMarketState) => {
  try {
    if (!activeAlerts || !activeAlerts.length) return;

    for (const alert of activeAlerts) {
      const alertIdStr = alert._id.toString();
      if (currentlyEvaluating.has(alertIdStr)) {
        console.log(`[AlertEngine] Skipping evaluation for alert "${alert.name}" (${alertIdStr}) — already in progress.`);
        continue;
      }
      currentlyEvaluating.add(alertIdStr);
      try {
        // 1. Cooldown check: 1 minute cooldown per alert
        if (alert.isRepeating && alert.lastTriggeredAt) {
          if (Date.now() - new Date(alert.lastTriggeredAt).getTime() < 60000) {
            continue;
          }
        }

        // 2. Identify the target stock keys for this alert
        const targetStocks = [];
        if (alert.targetType === 'specific_stocks' && alert.stocks) {
          for (const stock of alert.stocks) {
            targetStocks.push({ symbol: stock.symbol.toUpperCase(), exchange: stock.exchange.toUpperCase() });
          }
        } else if (alert.targetType === 'watchlist' && alert.watchlistId && alert.watchlistId.stocks) {
          for (const stock of alert.watchlistId.stocks) {
            targetStocks.push({ symbol: stock.symbol.toUpperCase(), exchange: stock.exchange.toUpperCase() });
          }
        }

        if (targetStocks.length === 0) continue;

        // 3. Evaluate conditions for each target stock that has a current tick
        const triggeredStocks = [];

        for (const stock of targetStocks) {
          const key = `${stock.exchange}:${stock.symbol}`;
          const tick = liveMarketState[key];
          if (!tick) continue;

          // Check if indicator baseline history needs lazy loading
          const timeframesToLoad = [];
          for (const cond of alert.conditions) {
            if (!candleAggregator.hasHistory(key, cond.timeframe)) {
              timeframesToLoad.push(cond.timeframe);
            }
          }

          if (timeframesToLoad.length > 0) {
            const angelOne = require('./angelOneService');
            for (const tf of timeframesToLoad) {
              try {
                console.log(`[AlertEngine] Lazy-loading baseline historical candles for ${key} (${tf})...`);
                await candleAggregator.getOrFetchHistory(key, stock.exchange, stock.symbol, tf, () =>
                  angelOne.fetchHistoricalCandles(stock.exchange, stock.symbol, tf)
                );
                console.log(`[AlertEngine] Loaded historical candles for ${key} (${tf})`);
              } catch (err) {
                console.error(`[AlertEngine] Failed to lazy-load historical candles for ${key} (${tf}):`, err.message);
              }
            }
          }

          // Cache indicators for this stock & timeframe
          const indicatorsCache = {};
          const getIndicatorsForTimeframe = (tf) => {
            if (indicatorsCache[tf] !== undefined) return indicatorsCache[tf];
            const candles = candleAggregator.getCandles(key, tf);
            if (candles.length < 2) {
              indicatorsCache[tf] = null;
              return null;
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
            latest.ltp = tick.ltp;

            const prevCandle = candles[candles.length - 2];
            prev.open = +prevCandle.open;
            prev.high = +prevCandle.high;
            prev.low = +prevCandle.low;
            prev.close = +prevCandle.close;
            prev.volume = +prevCandle.volume;
            prev.ltp = +prevCandle.close;

            indicatorsCache[tf] = { latest, prev };
            return indicatorsCache[tf];
          };

          // Evaluate all conditions (logical AND)
          let allPassed = true;
          const conditionSnapshot = [];

          for (const cond of alert.conditions) {
            const indicators = getIndicatorsForTimeframe(cond.timeframe);
            const passed = evaluateCondition(cond, indicators);

            if (!passed) {
              allPassed = false;
              break;
            }

            const leftVal = (indicators && indicators.latest) ? indicators.latest[cond.leftIndicator] : null;
            let rightVal = null;
            if (cond.rightType === 'value') {
              rightVal = cond.rightValue;
            } else if (cond.rightType === 'indicator' && indicators && indicators.latest) {
              rightVal = indicators.latest[cond.rightIndicator];
            }

            conditionSnapshot.push({
              timeframe: cond.timeframe,
              leftIndicator: cond.leftIndicator,
              operator: cond.operator,
              rightType: cond.rightType,
              rightValue: cond.rightValue,
              rightIndicator: cond.rightIndicator,
              leftActual: leftVal,
              rightActual: rightVal
            });
          }

          if (allPassed) {
            triggeredStocks.push({
              symbol: stock.symbol,
              exchange: stock.exchange,
              ltp: tick.ltp,
              conditions: conditionSnapshot
            });
          }
        }

        // 4. Trigger the alert if one or more stocks met criteria
        if (triggeredStocks.length > 0) {
          const newStatus = alert.isRepeating ? 'active' : 'triggered';
          await Alert.findByIdAndUpdate(alert._id, {
            status: newStatus,
            triggeredAt: new Date(),
            lastTriggeredAt: new Date(),
          });

          // Send Socket.io event for the triggered alert with all matching stocks (single consolidated toast)
          if (ioInstance && alert.userId) {
            ioInstance.to(`user:${alert.userId._id.toString()}`).emit('alert_triggered', {
              alertId: alert._id,
              alertName: alert.name,
              stocks: triggeredStocks.map(stock => ({
                symbol: stock.symbol,
                exchange: stock.exchange,
                ltp: stock.ltp,
                conditions: stock.conditions,
              })),
              note: alert.note || '',
              triggeredAt: new Date().toISOString(),
            });
          }

          // Send a single combined email alert for all matched stocks!
          if (alert.userId?.email) {
            emailService.sendCombinedAlertEmail(alert.userId.email, {
              _id: alert._id,
              name: alert.name,
              targetType: alert.targetType,
            }, triggeredStocks);
          }

          // Print single consolidated alert trigger box
          const border = "━".repeat(70);
          console.log(`\n┏${border}┓`);
          console.log(`┃ 🔔 ALERT TRIGGERED: "${alert.name}"`);
          console.log(`┃ User: ${alert.userId?.email || 'N/A'}`);
          console.log(`┃ Type: ${alert.targetType === 'watchlist' ? 'Watchlist' : 'Specific Stocks'}`);
          console.log(`┣${border}┫`);
          for (const stock of triggeredStocks) {
            console.log(`┃ 📈 Stock: ${stock.exchange}:${stock.symbol} | LTP: ₹${Number(stock.ltp).toFixed(2)}`);
            console.log(`┃    Conditions Met:`);
            for (const cond of stock.conditions) {
              const rhs = cond.rightType === 'value' ? Number(cond.rightValue).toFixed(2) : `${cond.rightIndicator} (${Number(cond.rightActual).toFixed(2)})`;
              const lhsVal = Number(cond.leftActual).toFixed(2);
              console.log(`┃      ✓ ${cond.leftIndicator} (${cond.timeframe}): ${lhsVal} ${cond.operator} ${rhs}`);
            }
            if (triggeredStocks.indexOf(stock) < triggeredStocks.length - 1) {
              console.log(`┃`);
            }
          }
          console.log(`┗${border}┛\n`);
        }
      } finally {
        currentlyEvaluating.delete(alertIdStr);
      }
    }
  } catch (err) {
    console.error(`[AlertEngine] evaluateAll failed:`, err.message);
  }
};

exports.evaluateCondition = evaluateCondition;

exports.evaluateAlertImmediately = async (alertId) => {
  try {
    // 1. Fetch the alert
    const alert = await Alert.findById(alertId).populate('userId').populate('watchlistId');
    if (!alert || alert.status !== 'active') return;

    // 2. Identify target stocks
    const targetStocks = [];
    if (alert.targetType === 'specific_stocks' && alert.stocks) {
      for (const stock of alert.stocks) {
        targetStocks.push({ symbol: stock.symbol.toUpperCase(), exchange: stock.exchange.toUpperCase() });
      }
    } else if (alert.targetType === 'watchlist' && alert.watchlistId && alert.watchlistId.stocks) {
      for (const stock of alert.watchlistId.stocks) {
        targetStocks.push({ symbol: stock.symbol.toUpperCase(), exchange: stock.exchange.toUpperCase() });
      }
    }
    if (targetStocks.length === 0) return;

    // 3. Resolve token mappings & fetch quotes
    const angelOne = require('./angelOneService');
    const items = [];
    const keyToScrip = {};
    for (const stock of targetStocks) {
      const key = `${stock.exchange}:${stock.symbol}`;
      const scripMatch = angelOne.resolveToken(stock.exchange, stock.symbol);
      if (scripMatch) {
        items.push({ exchange: stock.exchange, token: scripMatch.token, symbol: stock.symbol });
        keyToScrip[key] = scripMatch;
      }
    }
    if (items.length === 0) return;

    // Fetch batch quotes (using high priority queue entry)
    const fetchedQuotes = await angelOne.fetchQuotesBatch(items, 'high');
    if (!fetchedQuotes || fetchedQuotes.length === 0) return;

    const quoteMap = {};
    for (const q of fetchedQuotes) {
      const qKey = `${q.exchange.toUpperCase()}:${q.symbolToken}`;
      quoteMap[qKey] = q;
    }

    const localMarketState = {};
    const now = new Date();
    const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const timeInt = nowIST.getHours() * 100 + nowIST.getMinutes();
    const isMarketOpen = timeInt >= 915 && timeInt <= 1530;

    for (const stock of targetStocks) {
      const key = `${stock.exchange}:${stock.symbol}`;
      const scripMatch = keyToScrip[key];
      if (!scripMatch) continue;

      const qKey = `${scripMatch.exch_seg.toUpperCase()}:${scripMatch.token}`;
      const data = quoteMap[qKey];
      if (!data) continue;

      const tick = {
        symbol: stock.symbol,
        exchange: stock.exchange,
        ltp:           parseFloat(data.ltp)           || 0,
        open:          parseFloat(data.open)          || 0,
        high:          parseFloat(data.high)          || 0,
        low:           parseFloat(data.low)           || 0,
        prevClose:     parseFloat(data.close)         || 0,
        volume:        parseInt(data.tradeVolume, 10) || 0,
        percentChange: parseFloat(data.percentChange) || 0,
        ts:            Date.now(),
      };

      localMarketState[key] = tick;

      // Update aggregator buffer if market is open and volume exists
      if (isMarketOpen && tick.volume > 0) {
        candleAggregator.updateCandleBuffer(key, tick);
      }
    }

    // 4. Evaluate immediately!
    await exports.evaluateAll([alert], localMarketState);
  } catch (err) {
    console.error(`[AlertEngine] evaluateAlertImmediately failed:`, err.message);
  }
};
