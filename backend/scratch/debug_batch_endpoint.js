require('dotenv').config();
const indicatorController = require('../controllers/indicatorController');
const angelService = require('../services/angelOneService');

async function testBatch() {
  try {
    console.log('Syncing Scrip Master...');
    await angelService.syncScripMaster();

    const req = {
      body: {
        stocks: [
          { symbol: 'ADMANUM', exchange: 'BSE' },
          { symbol: 'THYROCARE', exchange: 'NSE' },
          { symbol: 'CONSOFINVT', exchange: 'NSE' }
        ],
        intervals: ['1d', '30m']
      }
    };

    let responseData = null;
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        responseData = body;
        return this;
      }
    };

    console.log('Calling getBatchIndicators...');
    await indicatorController.getBatchIndicators(req, res, (err) => {
      if (err) console.error('Next called with error:', err);
    });

    console.log('Response Success:', responseData ? responseData.success : 'null');
    if (!responseData) {
      console.log('No response data returned.');
      return;
    }
    console.log('Response Keys:', Object.keys(responseData.indicators || {}));
    
    // Check ADMANUM keys
    const admanumKeys = Object.keys(responseData.indicators || {}).filter(k => k.includes('ADMANUM'));
    console.log('ADMANUM keys in response:', admanumKeys);
    admanumKeys.forEach(k => {
      const ind = responseData.indicators[k];
      console.log(`${k} indicator sizes:`);
      for (const [name, arr] of Object.entries(ind)) {
        if (Array.isArray(arr)) {
          console.log(`  ${name}: ${arr.length} elements (last value: ${arr[arr.length - 1]})`);
        }
      }
    });
  } catch (err) {
    console.error(err);
  }
}

testBatch();
