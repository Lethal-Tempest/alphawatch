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
    
    console.log('👤 Creating mock user with conditions pool...');
    const user = await User.create({
      email: 'test-bot-user@alphawatch.com',
      password: 'password123',
      autoTradeConfig: {
        enabled: true,
        capital: 50000
      },
      conditions: [
        {
          name: 'Buy Template 1',
          type: 'buy',
          rules: [{ timeframe: '5m', leftIndicator: 'close', operator: '>', rightType: 'value', rightValue: '100' }]
        },
        {
          name: 'Sell Template 1',
          type: 'sell',
          rules: [{ timeframe: '5m', leftIndicator: 'close', operator: '<', rightType: 'value', rightValue: '90' }]
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
          assignedSellConditionId: sellConditionId
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
    console.log(`✅ Buy execution verified! Quantity purchased: ${trades[0].quantity} at ₹${trades[0].price}`);

    console.log('📉 Adjusting price downward to trigger Sell...');
    liveMarketState['NSE:TESTSTOCK'].ltp = 85;
    mockCandles.push({ timestamp: Date.now(), open: 87, high: 88, low: 84, close: 85, volume: 1500 });
    
    console.log('🚀 Triggering Sell Auto-Trade Cycle...');
    await autoTradeEngine.runAutoTradeCycle(liveMarketState);

    trades = await Trade.find({ userId: user._id });
    console.log(`📊 Total Trades recorded: ${trades.length}`);
    if (trades.length !== 2 || trades[1].type !== 'sell') {
      throw new Error('Sell trade execution test failed.');
    }
    console.log('✅ Sell execution verified!');

    console.log('📦 Testing 100 trade log pruning limit...');
    await Trade.deleteMany({ userId: user._id });
    const bulkTrades = [];
    for (let i = 0; i < 105; i++) {
      bulkTrades.push({
        userId: user._id,
        symbol: 'TESTSTOCK',
        exchange: 'NSE',
        type: 'buy',
        price: 100,
        quantity: 1,
        orderId: `BULK-${i}`,
        timestamp: new Date(Date.now() + i * 1000),
        status: 'Traded'
      });
    }
    await Trade.insertMany(bulkTrades);

    console.log('🚀 Triggering another cycle to execute pruning...');
    await autoTradeEngine.runAutoTradeCycle(liveMarketState);

    const finalTradeCount = await Trade.countDocuments({ userId: user._id });
    console.log(`📊 Total Trade Logs in DB: ${finalTradeCount}`);
    if (finalTradeCount > 100) {
      throw new Error(`Pruning failed. DB stored ${finalTradeCount} entries.`);
    }
    console.log('✅ Database trade pruning verification successful!');

  } catch (err) {
    console.error('❌ Verification test failed:', err.message);
  } finally {
    console.log('🔌 Disconnecting Mongoose...');
    await mongoose.disconnect();
    console.log('👋 Done.');
  }
}

runTest();
