// backend/scratch/test_ws_direct.js
require('dotenv').config();
const { WebSocketV2 } = require('smartapi-javascript');
const angelOne = require('../services/angelOneService');

async function test() {
  try {
    console.log("Starting AngelOne WS Direct Test...");
    const jwtToken = await angelOne.getAngelOneSession();
    const feedToken = angelOne.getFeedToken();
    const clientCode = process.env.ANGEL_CLIENT_CODE;
    const apiKey = process.env.ANGEL_API_KEY;

    console.log("Session details retrieved:");
    console.log("- clientCode:", clientCode);
    console.log("- apiKey:", apiKey);
    console.log("- feedToken:", feedToken ? "exists" : "null");
    console.log("- jwtToken:", jwtToken ? "exists" : "null");

    if (!jwtToken || !feedToken) {
      throw new Error('Unable to retrieve valid session and feed tokens.');
    }

    const webSocketClient = new WebSocketV2({
      clientcode: clientCode,
      jwttoken: `Bearer ${jwtToken}`,
      apikey: apiKey,
      feedtype: feedToken
    });

    webSocketClient.on('open', () => {
      console.log('✅ Smart Stream connection opened!');
      // Subscribe to RELIANCE (token 2885 on exchange NSE = 1)
      const req = {
        correlationID: `test_sub_${Date.now()}`,
        action: 1,
        mode: 2,
        exchangeType: 1,
        tokens: ["2885"]
      };
      webSocketClient.fetchData(req);
      console.log('Sent subscribe request for RELIANCE (token 2885)');
    });

    webSocketClient.on('tick', (data) => {
      console.log('⏳ Received live tick data:', data);
    });

    webSocketClient.on('error', (err) => {
      console.error('❌ Smart Stream error:', err?.message || err);
    });

    webSocketClient.on('close', () => {
      console.log('🔌 Smart Stream disconnected.');
    });

    console.log("Connecting...");
    await webSocketClient.connect();
    console.log("Connect call completed.");

  } catch (err) {
    console.error('❌ Test failed:', err);
  }
}

test();
