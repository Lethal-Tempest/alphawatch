require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Watchlist = require('../models/Watchlist');
const candleAggregator = require('../services/candleAggregator');

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alphawatch';

async function runCheck() {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const watchlist = await Watchlist.findOne({ name: 'big' });
    if (!watchlist) {
      console.log('❌ Watchlist named "big" not found.');
      return;
    }

    console.log(`📋 Found Watchlist: "${watchlist.name}"`);
    console.log(`Stocks inside watchlist:`);
    for (const s of watchlist.stocks) {
      const key = `${s.exchange.toUpperCase()}:${s.symbol.toUpperCase()}`;
      
      const candles1d = candleAggregator.getCandles(key, '1d');
      const candles30m = candleAggregator.getCandles(key, '30m');

      console.log(`   • ${key}:`);
      console.log(`     - 1d candles cached count: ${candles1d.length}`);
      console.log(`     - 30m candles cached count: ${candles30m.length}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

runCheck();
