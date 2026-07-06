require('dotenv').config();
const angelService = require('../services/angelOneService');
const indicatorService = require('../services/indicatorService');

const targets = [
  { symbol: 'MARGOFIN', exchange: 'BSE' },
  { symbol: 'SILVERTUC', exchange: 'NSE' },
  { symbol: 'STOVEKRAFT', exchange: 'NSE' },
  { symbol: 'ADMANUM', exchange: 'BSE' },
  { symbol: 'THYROCARE', exchange: 'NSE' }
];

async function dump() {
  try {
    await angelService.syncScripMaster();

    for (const t of targets) {
      console.log(`\n=== DUMPING ${t.exchange}:${t.symbol} ===`);
      const candles1d = await angelService.fetchHistoricalCandles(t.exchange, t.symbol, '1d', 'low');
      const candles30m = await angelService.fetchHistoricalCandles(t.exchange, t.symbol, '30m', 'low');

      if (!candles1d.length || !candles30m.length) {
        console.log('Empty candles!');
        continue;
      }

      const ind1d = indicatorService.computeAllIndicators(candles1d);
      const ind30m = indicatorService.computeAllIndicators(candles30m);

      const macdLine = ind1d.macdLine[ind1d.macdLine.length - 1];
      const macdLinePrev = ind1d.macdLine[ind1d.macdLine.length - 2];
      const smiLine = ind1d.smiLine[ind1d.smiLine.length - 1];
      const smiSignal = ind1d.smiSignal[ind1d.smiSignal.length - 1];
      const ema50 = ind30m.ema50[ind30m.ema50.length - 1];
      const ema20 = ind30m.ema20[ind30m.ema20.length - 1];
      const mfi14 = ind30m.mfi14[ind30m.mfi14.length - 1];
      const deltaMfi14 = ind30m.deltaMfi14[ind30m.deltaMfi14.length - 1];
      const smiLine30m = ind30m.smiLine[ind30m.smiLine.length - 1];
      const smiSignal30m = ind30m.smiSignal[ind30m.smiSignal.length - 1];
      const adx = ind30m.adx[ind30m.adx.length - 1];
      const plusDI = ind30m.plusDI[ind30m.plusDI.length - 1];
      const minusDI = ind30m.minusDI[ind30m.minusDI.length - 1];
      const deltaDI = ind30m.deltaDI[ind30m.deltaDI.length - 1];

      console.log('1d macdLine (latest):', macdLine);
      console.log('1d macdLine (prev):', macdLinePrev);
      console.log('1d smiLine (latest):', smiLine);
      console.log('1d smiSignal (latest):', smiSignal);
      console.log('30m ema50 (latest):', ema50);
      console.log('30m ema20 (latest):', ema20);
      console.log('30m mfi14 (latest):', mfi14);
      console.log('30m deltaMfi14 (latest):', deltaMfi14);
      console.log('30m smiLine (latest):', smiLine30m);
      console.log('30m smiSignal (latest):', smiSignal30m);
      console.log('30m adx (latest):', adx);
      console.log('30m plusDI (latest):', plusDI);
      console.log('30m minusDI (latest):', minusDI);
      console.log('30m deltaDI (latest):', deltaDI);
    }
  } catch (err) {
    console.error(err);
  }
}

dump();
