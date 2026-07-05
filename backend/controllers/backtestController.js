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

    const normalizeConditions = (conds) => {
      if (!Array.isArray(conds)) return [];
      return conds.map((c) => {
        if (c.leftIndicator && !c.rules) {
          return { rules: [c] };
        }
        return c;
      });
    };

    const buyGroups = normalizeConditions(buyConditions);
    const sellGroups = normalizeConditions(sellConditions);

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
            // Check buy conditions (OR-joined rule groups)
            let buyPassed = false;
            if (buyGroups.length > 0) {
              for (const group of buyGroups) {
                const rules = group.rules || [];
                if (rules.length === 0) continue;
                let groupPassed = true;
                for (const rule of rules) {
                  if (!evaluateCondition(rule, indicators)) {
                    groupPassed = false;
                    break;
                  }
                }
                if (groupPassed) {
                  buyPassed = true;
                  break; // OR condition matched
                }
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
            // Check sell conditions (OR-joined groups with partial sell percentages)
            if (i > lastTradeCandleIndex) {
              let triggeredGroup = null;
              if (sellGroups.length > 0) {
                for (const group of sellGroups) {
                  const rules = group.rules || [];
                  if (rules.length === 0) continue;
                  let groupPassed = true;
                  for (const rule of rules) {
                    if (!evaluateCondition(rule, indicators)) {
                      groupPassed = false;
                      break;
                    }
                  }
                  if (groupPassed) {
                    triggeredGroup = group;
                    break; // Execute first matching group
                  }
                }
              }

              if (triggeredGroup) {
                const sellPct = parseFloat(triggeredGroup.sellPct) || 100;
                const sharesToSell = position * (sellPct / 100);

                if (sharesToSell > 0) {
                  const sellValueRaw = sharesToSell * price;
                  const transactionCost = sellValueRaw * (txCostPct / 100);
                  const sellValueNet = sellValueRaw - transactionCost;

                  capital += sellValueNet;
                  position = position - sharesToSell;
                  lastTradeCandleIndex = i;

                  if (position < 0.0001) {
                    position = 0;
                    holding = false;
                  }

                  trades.push({
                    type: sellPct < 100 ? `sell (${sellPct}%)` : 'sell',
                    index: i,
                    price,
                    shares: sharesToSell,
                    cost: transactionCost
                  });

                  enrichedCandles[i].transactionPrice = price.toFixed(2);
                  enrichedCandles[i].transactionType = sellPct < 100 ? `sell (${sellPct}%)` : 'sell';
                }
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
