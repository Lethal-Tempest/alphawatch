const Watchlist = require('../models/Watchlist');
const angelOne = require('../services/angelOneService');
const candleAggregator = require('../services/candleAggregator');
const indicatorService = require('../services/indicatorService');
const { evaluateCondition } = require('../services/alertEngine');

const getIndicatorsAt = (computedIndicators, candles, tickLtp, i) => {
  if (i < 1) return null;
  const latest = {};
  const prev = {};

  for (const [indKey, arr] of Object.entries(computedIndicators)) {
    if (arr && arr.length > i) {
      latest[indKey] = arr[i];
      prev[indKey] = arr[i - 1];
    } else {
      latest[indKey] = null;
      prev[indKey] = null;
    }
  }

  const lastCandle = candles[i];
  latest.open = +lastCandle.open;
  latest.high = +lastCandle.high;
  latest.low = +lastCandle.low;
  latest.close = +lastCandle.close;
  latest.volume = +lastCandle.volume;
  latest.ltp = tickLtp;

  const prevCandle = candles[i - 1];
  prev.open = +prevCandle.open;
  prev.high = +prevCandle.high;
  prev.low = +prevCandle.low;
  prev.close = +prevCandle.close;
  prev.volume = +prevCandle.volume;
  prev.ltp = +prevCandle.close;

  return { latest, prev };
};

exports.runBacktest = async (req, res, next) => {
  try {
    const { watchlistId, timeframe, initialCapital, transactionCostPct, buyConditions, sellConditions } = req.body;

    if (!watchlistId || !timeframe || !initialCapital || buyConditions === undefined || sellConditions === undefined) {
      return res.status(400).json({ error: 'watchlistId, timeframe, initialCapital, buyConditions, and sellConditions are required.' });
    }

    const watchlist = await Watchlist.findById(watchlistId);
    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found.' });
    }

    const initCap = parseFloat(initialCapital) || 50000;
    const txCostPct = parseFloat(transactionCostPct) || 0.0;

    const results = [];

    for (const stock of watchlist.stocks) {
      const key = `${stock.exchange.toUpperCase()}:${stock.symbol.toUpperCase()}`;
      try {
        await candleAggregator.getOrFetchHistory(key, stock.exchange, stock.symbol, timeframe, () =>
          angelOne.fetchHistoricalCandles(stock.exchange, stock.symbol, timeframe)
        );

        const candles = candleAggregator.getCandles(key, timeframe);
        if (!candles || candles.length < 2) {
          results.push({
            symbol: stock.symbol,
            exchange: stock.exchange,
            initialCapital: initCap,
            finalAmount: initCap,
            percentageChange: 0,
            tradesCount: 0,
            candles: []
          });
          continue;
        }

        const computed = indicatorService.computeAllIndicators(candles);

        let capital = initCap;
        let position = 0;
        let holding = false;
        let lastTradeCandleIndex = -1;
        const trades = [];

        // Enrich candles with transaction details and indicator values
        const enrichedCandles = candles.map((c, idx) => {
          const inds = {};
          for (const [indKey, arr] of Object.entries(computed)) {
            inds[indKey] = (arr && arr.length > idx) ? arr[idx] : null;
          }
          return {
            timestamp: c.timestamp,
            open: +c.open,
            high: +c.high,
            low: +c.low,
            close: +c.close,
            volume: +c.volume,
            transactionPrice: '-',
            transactionType: null,
            indicators: inds
          };
        });

        for (let i = 1; i < candles.length; i++) {
          const currentCandle = candles[i];
          const price = +currentCandle.close;

          const indicators = getIndicatorsAt(computed, candles, price, i);

          if (!holding) {
            // Check buy conditions
            let buyPassed = buyConditions.length > 0;
            for (const cond of buyConditions) {
              if (!evaluateCondition(cond, indicators)) {
                buyPassed = false;
                break;
              }
            }

            if (buyPassed) {
              const costFactor = 1 + (txCostPct / 100);
              const buyValue = capital / costFactor;
              const transactionCost = capital - buyValue;

              position = buyValue / price;
              holding = true;
              lastTradeCandleIndex = i;
              capital = buyValue;

              trades.push({
                type: 'buy',
                index: i,
                price,
                shares: position,
                cost: transactionCost
              });

              enrichedCandles[i].transactionPrice = price.toFixed(2);
              enrichedCandles[i].transactionType = 'buy';
            }
          } else {
            // Check sell conditions
            if (i > lastTradeCandleIndex) {
              let sellPassed = sellConditions.length > 0;
              for (const cond of sellConditions) {
                if (!evaluateCondition(cond, indicators)) {
                  sellPassed = false;
                  break;
                }
              }

              if (sellPassed) {
                const sellValueRaw = position * price;
                const transactionCost = sellValueRaw * (txCostPct / 100);
                const sellValueNet = sellValueRaw - transactionCost;

                capital = sellValueNet;
                position = 0;
                holding = false;
                lastTradeCandleIndex = i;

                trades.push({
                  type: 'sell',
                  index: i,
                  price,
                  shares: position,
                  cost: transactionCost
                });

                enrichedCandles[i].transactionPrice = price.toFixed(2);
                enrichedCandles[i].transactionType = 'sell';
              }
            }
          }
        }

        const lastPrice = +candles[candles.length - 1].close;
        const finalAmount = holding ? (position * lastPrice) : capital;
        const percentageChange = ((finalAmount - initCap) / initCap) * 100;

        results.push({
          symbol: stock.symbol,
          exchange: stock.exchange,
          initialCapital: initCap,
          finalAmount: parseFloat(finalAmount.toFixed(2)),
          percentageChange: parseFloat(percentageChange.toFixed(2)),
          tradesCount: trades.length,
          candles: enrichedCandles
        });

      } catch (err) {
        console.error(`[Backtest] Failed for ${key}:`, err.message);
        results.push({
          symbol: stock.symbol,
          exchange: stock.exchange,
          initialCapital: initCap,
          finalAmount: initCap,
          percentageChange: 0,
          tradesCount: 0,
          candles: [],
          error: err.message
        });
      }
    }

    res.json({ success: true, results });

  } catch (error) { next(error); }
};
