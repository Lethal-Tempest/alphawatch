require('dotenv').config();
const angelOne = require('../services/angelOneService');
const angelOneSocket = require('../services/angelOneSocket');

async function runTest() {
  try {
    console.log('🔄 Syncing Scrip Master...');
    await angelOne.syncScripMaster();

    console.log('🔑 Logging in to AngelOne...');
    await angelOne.getAngelOneSession();

    console.log('🔌 Connecting to WebSocket...');
    angelOneSocket.init(null, (key, tick) => {
      console.log(`\n📥 [TICK RECEIVED] Key: ${key}`);
      console.log(JSON.stringify(tick, null, 2));
    });

    await angelOneSocket.connect();

    console.log('📡 Subscribing to THYROCARE (NSE) and ADMANUM (BSE)...');
    const allKeys = new Set([
      'NSE:THYROCARE',
      'BSE:ADMANUM'
    ]);
    
    // Sync subscriptions
    angelOneSocket.syncSubscriptions(allKeys);

    console.log('⌛ Waiting for ticks... Press Ctrl+C to stop.');
    // Keep process alive for 30 seconds
    setTimeout(() => {
      console.log('⏹️ Test finished. Exiting...');
      process.exit(0);
    }, 30000);

  } catch (err) {
    console.error('💥 Test failed:', err);
    process.exit(1);
  }
}

runTest();
