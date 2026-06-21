require('dotenv').config();
const angelService = require('./services/angelOneService');

async function run() {
  try {
    console.log('Syncing scrip master to resolve token...');
    await angelService.syncScripMaster();

    const tokenInfo = angelService.resolveToken('BSE', 'ADMANUM');
    console.log('Resolved ADMANUM token info:', tokenInfo);

    if (!tokenInfo) {
      console.error('ADMANUM token not found in BSE scrip map');
      return;
    }

    console.log('Fetching historical candles for ADMANUM...');
    const candles = await angelService.fetchHistoricalCandles('BSE', 'ADMANUM', '1m', 'high');
    console.log('Total candles returned by API:', candles.length);
    if (candles.length > 0) {
      console.log('First candle:', candles[0]);
      console.log('Last candle:', candles[candles.length - 1]);
      
      // Let's filter candles that are on or after June 12, 2026 to see if any exist
      const recent = candles.filter(c => new Date(c.timestamp) >= new Date('2026-06-12'));
      console.log('Candles on or after June 12, 2026:', recent.length);
      if (recent.length > 0) {
        console.log('Recent candles details:');
        recent.forEach(c => console.log(c.timestamp, 'Vol:', c.volume));
      }
    }
  } catch (err) {
    console.error('Error running test:', err);
  }
}

run();
