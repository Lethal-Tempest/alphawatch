require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Watchlist = require('../models/Watchlist');
const Trade = require('../models/Trade');
const autoTradeEngine = require('../services/autoTradeEngine');
const candleAggregator = require('../services/candleAggregator');
const indicatorService = require('../services/indicatorService');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alphawatch';

async function runTest() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected.');

  try {
    console.log('🧹 Cleaning old mock test data...');
    await User.deleteMany({ email: /test-bot-user/ });
    await Trade.deleteMany({});
    
    console.log('👤 Creating mock user with OR-joined conditions and partial sell...');
    const user = await User.create({
      email: 'test-bot-user@alphawatch.com',
      password: 'password123',
      autoTradeConfig: {
        enabled: true,
        capital: 50000
      },
      conditions: [
        {
          name: 'OR Buy template',
          type: 'buy',
          groups: [
            {
              rules: [{ timeframe: '5m', leftIndicator: 'close', operator: '>', rightType: 'value', rightValue: '1000' }] // FALSE
            },
            {
              rules: [{ timeframe: '5m', leftIndicator: 'close', operator: '>', rightType: 'value', rightValue: '100' }] // TRUE
            }
          ]
        },
        {
          name: 'OR Sell template with Partial Sell',
          type: 'sell',
          groups: [
            {
              sellPct: 40,
              rules: [{ timeframe: '5m', leftIndicator: 'close', operator: '<', rightType: 'value', rightValue: '90' }] // TRUE on 85
            },
            {
              sellPct: 100,
              rules: [{ timeframe: '5m', leftIndicator: 'close', operator: '<', rightType: 'value', rightValue: '60' }] // FALSE on 85
            }
          ]
        }
      ]
    });

    const buyConditionId = user.conditions[0]._id;
    const sellConditionId = user.conditions[1]._id;

    console.log(`📋 Creating mock watchlist (Buy rule ID: ${buyConditionId}, Sell rule ID: ${sellConditionId})...`);
    const watchlist = await Watchlist.create({
      userId: user._id,
      name: 'AutoTrade Test WL',
      stocks: [
        {
          symbol: 'TESTSTOCK',
          exchange: 'NSE',
          autoTradeEnabled: true,
          assignedBuyConditionId: buyConditionId,
          assignedSellConditionId: sellConditionId,
          tradeCapital: 10000
        }
      ]
    });

    console.log('🕯️ Mocking candle aggregator history for NSE:TESTSTOCK (5m)...');
    const key = 'NSE:TESTSTOCK';
    const mockCandles = [
      { timestamp: Date.now() - 600000, open: 105, high: 106, low: 104, close: 105, volume: 1000 },
      { timestamp: Date.now() - 300000, open: 105, high: 108, low: 104, close: 107, volume: 1200 }
    ];
    
    candleAggregator.getCandles = (stockKey, tf) => {
      if (stockKey === 'NSE:TESTSTOCK' && tf === '5m') {
        return mockCandles;
      }
      return [];
    };
    candleAggregator.hasHistory = (stockKey, tf) => {
      return stockKey === 'NSE:TESTSTOCK' && tf === '5m';
    };

    indicatorService.computeAllIndicators = () => {
      return {
        close: [105, 107]
      };
    };

    console.log('📈 Setting up mock live tick state...');
    const liveMarketState = {
      'NSE:TESTSTOCK': {
        symbol: 'TESTSTOCK',
        exchange: 'NSE',
        ltp: 107,
        volume: 1200,
        ts: Date.now()
      }
    };

    console.log('🚀 Triggering Buy Auto-Trade Cycle...');
    await autoTradeEngine.runAutoTradeCycle(liveMarketState);

    let trades = await Trade.find({ userId: user._id });
    console.log(`📊 Trades recorded after buy trigger: ${trades.length}`);
    if (trades.length !== 1 || trades[0].type !== 'buy') {
      throw new Error('Buy trade execution test failed.');
    }
    if (trades[0].quantity !== 93) {
      throw new Error(`Stock-specific capital check failed. Expected 93 shares, got ${trades[0].quantity}`);
    }
    console.log(`✅ Buy execution verified! Quantity purchased: ${trades[0].quantity} at ₹${trades[0].price}`);

    console.log('📉 Adjusting price downward to 85 to trigger 40% Partial Sell...');
    liveMarketState['NSE:TESTSTOCK'].ltp = 85;
    mockCandles.push({ timestamp: Date.now(), open: 87, high: 88, low: 84, close: 85, volume: 1500 });
    
    // We mock HDFC fetch positions returning the 93 shares
    const originalFetchPositions = require('../services/hdfcService').fetchPositions;
    require('../services/hdfcService').fetchPositions = async () => {
      return {
        status: 'success',
        data: {
          net: [
            {
              security_id: 'TESTSTOCK',
              exchange: 'NSE',
              net_qty: 93
            }
          ]
        }
      };
    };

    console.log('🚀 Triggering Sell Auto-Trade Cycle (Expected Partial Sell)...');
    await autoTradeEngine.runAutoTradeCycle(liveMarketState);

    trades = await Trade.find({ userId: user._id }).sort({ timestamp: 1 });
    console.log(`📊 Total Trades recorded: ${trades.length}`);
    if (trades.length !== 2 || trades[1].type !== 'sell') {
      throw new Error('Sell trade execution test failed.');
    }
    // Expected quantity to sell: 93 * 0.4 = 37.2 -> Math.floor is 37 shares!
    if (trades[1].quantity !== 37) {
      throw new Error(`Partial sell quantity check failed. Expected 37 shares, got ${trades[1].quantity}`);
    }
    console.log(`✅ Partial Sell execution verified! Quantity sold: ${trades[1].quantity} shares (${trades[1].message})`);

  } catch (err) {
    console.error('❌ Verification test failed:', err.stack || err.message);
  } finally {
    console.log('🔌 Disconnecting Mongoose...');
    await mongoose.disconnect();
    console.log('👋 Done.');
  }
}

runTest();
