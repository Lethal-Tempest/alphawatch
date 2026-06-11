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

exports.init = (io) => {
  ioInstance = io;
};

/**
 * Return all stock keys currently targeted by active alerts.
 * Polling loop uses this to keep active background polling alive.
 */
exports.getActiveAlertKeys = async () => {
  try {
    const activeAlerts = await Alert.find({ status: 'active' }).populate('watchlistId');
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
  if (!indicators) return false;
  const leftVal = indicators[cond.leftIndicator];
  if (leftVal == null) return false;

  let rightVal;
  if (cond.rightType === 'value') {
    rightVal = cond.rightValue;
  } else if (cond.rightType === 'indicator') {
    rightVal = indicators[cond.rightIndicator];
  }
  if (rightVal == null) return false;

  switch (cond.operator) {
    case '>':  return leftVal > rightVal;
    case '>=': return leftVal >= rightVal;
    case '==': return leftVal === rightVal;
    case '<=': return leftVal <= rightVal;
    case '<':  return leftVal < rightVal;
    case '!=': return leftVal !== rightVal;
    default:   return false;
  }
}

/**
 * Evaluate all active alerts targeting the ticked stock key.
 */
exports.evaluate = async (key, tick) => {
  try {
    const [exchange, symbol] = key.split(':');

    // Fetch active alerts populated with user (for email) and watchlist details
    const activeAlerts = await Alert.find({ status: 'active' })
      .populate('userId')
      .populate('watchlistId');

    if (!activeAlerts.length) return;

    // Filter alerts that target this specific stock
    const matchingAlerts = activeAlerts.filter(alert => {
      if (alert.targetType === 'specific_stocks') {
        return alert.stocks.some(
          s => s.symbol.toUpperCase() === symbol.toUpperCase() && s.exchange.toUpperCase() === exchange.toUpperCase()
        );
      } else if (alert.targetType === 'watchlist' && alert.watchlistId) {
        return alert.watchlistId.stocks.some(
          s => s.symbol.toUpperCase() === symbol.toUpperCase() && s.exchange.toUpperCase() === exchange.toUpperCase()
        );
      }
      return false;
    });

    if (!matchingAlerts.length) return;

    // Lazy-load historical candles for any timeframe used in the active alert conditions of this stock if not loaded
    const timeframesToLoad = new Set();
    for (const alert of matchingAlerts) {
      for (const cond of alert.conditions) {
        if (!candleAggregator.hasHistory(key, cond.timeframe)) {
          timeframesToLoad.add(cond.timeframe);
        }
      }
    }

    if (timeframesToLoad.size > 0) {
      const angelOne = require('./angelOneService');
      for (const tf of timeframesToLoad) {
        try {
          console.log(`[AlertEngine] Lazy-loading baseline historical candles for ${key} (${tf})...`);
          const parsedCandles = await angelOne.fetchHistoricalCandles(exchange, symbol, tf);
          candleAggregator.setHistoricalCandles(key, tf, parsedCandles);
          console.log(`[AlertEngine] Loaded ${parsedCandles.length} historical candles for ${key} (${tf})`);
        } catch (err) {
          console.error(`[AlertEngine] Failed to lazy-load historical candles for ${key} (${tf}):`, err.message);
        }
      }
    }

    // Lazy cache of indicator sets keyed by timeframe
    const indicatorsCache = {};

    const getIndicatorsForTimeframe = (tf) => {
      if (indicatorsCache[tf] !== undefined) {
        return indicatorsCache[tf];
      }

      const candles = candleAggregator.getCandles(key, tf);
      if (candles.length < 2) {
        indicatorsCache[tf] = null;
        return null;
      }

      const computed = indicatorService.computeAllIndicators(candles);
      const latest = {};

      for (const [indKey, arr] of Object.entries(computed)) {
        if (arr && arr.length > 0) {
          latest[indKey] = arr[arr.length - 1];
        } else {
          latest[indKey] = null;
        }
      }

      // Append core metrics
      const lastCandle = candles[candles.length - 1];
      latest.open = +lastCandle.open;
      latest.high = +lastCandle.high;
      latest.low = +lastCandle.low;
      latest.close = +lastCandle.close;
      latest.volume = +lastCandle.volume;
      latest.ltp = tick.ltp;

      indicatorsCache[tf] = latest;
      return latest;
    };

    for (const alert of matchingAlerts) {
      // Cooldown check: 1 minute (60,000 ms) cooldown per stock for repeating alerts
      if (alert.isRepeating && alert.lastTriggeredAt) {
        if (Date.now() - new Date(alert.lastTriggeredAt).getTime() < 60000) {
          continue;
        }
      }

      // Check all conditions (logical AND)
      let allPassed = true;
      const conditionSnapshot = [];

      for (const cond of alert.conditions) {
        const indicators = getIndicatorsForTimeframe(cond.timeframe);
        const passed = evaluateCondition(cond, indicators);

        if (!passed) {
          allPassed = false;
          break;
        }

        // Store condition parameters with triggered values for notification
        const leftVal = indicators ? indicators[cond.leftIndicator] : null;
        let rightVal = null;
        if (cond.rightType === 'value') {
          rightVal = cond.rightValue;
        } else if (cond.rightType === 'indicator' && indicators) {
          rightVal = indicators[cond.rightIndicator];
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
        // Trigger alert!
        const newStatus = alert.isRepeating ? 'active' : 'triggered';
        await Alert.findByIdAndUpdate(alert._id, {
          status: newStatus,
          triggeredAt: new Date(),
          lastTriggeredAt: new Date(),
        });

        // 1. Emit Socket.io event for browser toast notification and sound
        if (ioInstance && alert.userId) {
          ioInstance.to(`user:${alert.userId._id.toString()}`).emit('alert_triggered', {
            alertId: alert._id,
            alertName: alert.name,
            symbol,
            exchange,
            ltp: tick.ltp,
            conditions: conditionSnapshot,
            note: alert.note || '',
            triggeredAt: new Date().toISOString(),
          });
        }

        // 2. Send email notification via emailService
        if (alert.userId?.email) {
          emailService.sendAlertEmail(alert.userId.email, {
            _id: alert._id,
            name: alert.name,
            targetType: alert.targetType,
            conditions: conditionSnapshot
          }, symbol, exchange, tick.ltp);
        }

        console.log(`🔔 Alert Triggered: "${alert.name}" on ${exchange}:${symbol} | LTP: ₹${tick.ltp}`);
      }
    }
  } catch (err) {
    console.error(`[AlertEngine] Evaluation failed for ${key}:`, err.message);
  }
};
