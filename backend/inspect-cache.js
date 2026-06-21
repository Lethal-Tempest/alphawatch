const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'cache/candleBuffer.json');

if (fs.existsSync(CACHE_FILE)) {
  const raw = fs.readFileSync(CACHE_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const buffer = parsed.candleBuffer || {};
  
  // Find BSE:ADMANUM key
  const keys = Object.keys(buffer);
  console.log('Available keys in cache:', keys);
  
  const admanumKey = keys.find(k => k.includes('ADMANUM'));
  if (admanumKey) {
    console.log('Found key:', admanumKey);
    const intervals = Object.keys(buffer[admanumKey]);
    console.log('Available intervals:', intervals);
    
    intervals.forEach(inv => {
      const candles = buffer[admanumKey][inv] || [];
      const valid = candles.filter(c => c.volume > 0);
      console.log(`Interval: ${inv}, Total cached: ${candles.length}, Non-zero volume: ${valid.length}`);
      if (valid.length > 0) {
        console.log('First non-zero candle:', valid[0]);
        console.log('Last non-zero candle:', valid[valid.length - 1]);
      }
    });
  } else {
    console.log('ADMANUM key not found in cache.');
  }
} else {
  console.log('Cache file does not exist.');
}
