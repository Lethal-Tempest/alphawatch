// backend/scratch/check_ws_connection.js
require('dotenv').config();
const { WebSocketV2 } = require('smartapi-javascript');
const angelOne = require('../services/angelOneService');

async function test() {
  try {
    console.log("Loading scrip master first...");
    await angelOne.syncScripMaster();

    console.log("Refreshing session...");
    const jwtToken = await angelOne.getAngelOneSession();
    const feedToken = angelOne.getFeedToken();
    const clientCode = process.env.ANGEL_CLIENT_CODE;
    const apiKey = process.env.ANGEL_API_KEY;

    console.log("Init WebSocketV2 with details:");
    console.log("- clientcode:", clientCode);
    console.log("- jwttoken:", jwtToken ? jwtToken.substring(0, 15) + "..." : "null");
    console.log("- apikey:", apiKey);
    console.log("- feedtype:", feedToken);

    const client = new WebSocketV2({
      clientcode: clientCode,
      jwttoken: `Bearer ${jwtToken}`,
      apikey: apiKey,
      feedtype: feedToken
    });

    client.customError(); // Enable custom error handling

    client.on('open', () => {
      console.log('✅ Connection opened!');
      // Subscribe to RELIANCE (token 2885 on NSE)
      client.fetchData({
        correlationID: "debug_sub_1",
        action: 1,
        mode: 2,
        exchangeType: 1,
        tokens: ["2885"]
      });
      console.log('Sent sub request for RELIANCE (2885)');
    });

    client.on('tick', (data) => {
      console.log('⏳ Tick received:', data);
    });

    client.on('error', (err) => {
      console.error('❌ Socket error event:', err);
    });

    client.on('close', (e) => {
      console.log('🔌 Connection closed:', e);
    });

    console.log("Calling client.connect()...");
    await client.connect();
    console.log("Client.connect() completed.");

    // Keep process alive for 30s to observe
    setTimeout(() => {
      console.log("Exiting debug process.");
      process.exit(0);
    }, 30000);

  } catch (err) {
    console.error('❌ Script failed:', err);
  }
}

test();
