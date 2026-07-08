const { WebSocketV2 } = require('smartapi-javascript');
const angelOne = require('./angelOneService');

let webSocketClient = null;
let wsConnected = false;
let onTickReceived = null;

// Map of currently subscribed tokens: token -> { key, exchangeType }
const subscribedTokens = new Map();

// Track last requested keys to resubscribe when socket reconnects / opens
let lastTargetKeys = new Set();

exports.init = (io, tickCb) => {
  onTickReceived = tickCb;
};

exports.connect = async () => {
  try {
    const jwtToken = await angelOne.getAngelOneSession();
    const feedToken = angelOne.getFeedToken();
    const clientCode = process.env.ANGEL_CLIENT_CODE;
    const apiKey = process.env.ANGEL_API_KEY;

    if (!jwtToken || !feedToken) {
      throw new Error('Unable to retrieve valid session and feed tokens.');
    }

    console.log('🔌 [WebSocket] Initializing AngelOne Smart Stream WebSocket...');
    
    webSocketClient = new WebSocketV2({
      clientcode: clientCode,
      jwttoken: `Bearer ${jwtToken}`,
      apikey: apiKey,
      feedtype: feedToken
    });

    // Configure simple reconnection inside SDK
    webSocketClient.reconnection('simple', 3000, 1);

    await webSocketClient.connect();
    wsConnected = true;
    console.log('✅ [WebSocket] Smart Stream connected successfully.');

    // Drain any pending subscriptions that queued during connection setup
    webSocketClient.on('open', () => {
      wsConnected = true;
      console.log('🔌 [WebSocket] Smart Stream opened. Syncing pending subscriptions...');
      exports.syncSubscriptions(lastTargetKeys);
    });

    webSocketClient.on('close', () => {
      wsConnected = false;
      console.log('🔌 [WebSocket] Smart Stream disconnected.');
    });

    webSocketClient.on('error', (err) => {
      wsConnected = false;
      console.error('❌ [WebSocket] Smart Stream error:', err?.message || err);
    });

    // Handle ticks
    webSocketClient.on('tick', (data) => {
      if (!data || !data.token) return;

      const token = String(data.token).trim();
      const scrip = angelOne.resolveTokenByCode(token);
      if (!scrip) {
        // Skip logs for unknown tokens to avoid console noise
        return;
      }

      const key = `${scrip.exch_seg.toUpperCase()}:${scrip.symbol.toUpperCase()}`;

      // Convert prices from paise (integer) to rupees (decimal) by dividing by 100
      const ltp = parseFloat(data.last_traded_price) / 100 || 0;
      const open = parseFloat(data.open_price_day) / 100 || 0;
      const high = parseFloat(data.high_price_day) / 100 || 0;
      const low = parseFloat(data.low_price_day) / 100 || 0;
      const prevClose = parseFloat(data.close_price) / 100 || 0;
      const volume = parseInt(data.vol_traded, 10) || 0;

      // Calculate percentChange dynamically: ((LTP - PrevClose) / PrevClose) * 100
      let percentChange = 0;
      if (prevClose > 0) {
        percentChange = ((ltp - prevClose) / prevClose) * 100;
      }

      const tick = {
        symbol: scrip.symbol.replace(/-EQ$|-BE$|-SM$|-ST$/, ''),
        exchange: scrip.exch_seg,
        ltp,
        open,
        high,
        low,
        prevClose,
        volume,
        percentChange,
        ts: Date.now()
      };

      if (onTickReceived) {
        onTickReceived(key, tick);
      }
    });

  } catch (err) {
    wsConnected = false;
    console.error('❌ [WebSocket] Connection failed:', err.message);
    // Retry connection after 5 seconds
    setTimeout(exports.connect, 5000);
  }
};

exports.reconnect = async () => {
  console.log('🔌 [WebSocket] Forcing reconnection...');
  wsConnected = false;
  if (webSocketClient) {
    try {
      webSocketClient.close();
    } catch (e) {}
  }
  subscribedTokens.clear();
  await exports.connect();
};

exports.syncSubscriptions = (allKeys) => {
  lastTargetKeys = new Set(allKeys);
  if (!wsConnected || !webSocketClient) return;

  const targetTokens = new Map();
  for (const key of allKeys) {
    const [exchange, symbol] = key.split(':');
    const scrip = angelOne.resolveToken(exchange, symbol);
    if (!scrip) continue;

    const exchangeType = exchange.toUpperCase() === 'NSE' ? 1 : 3;
    targetTokens.set(String(scrip.token), { key, exchangeType });
  }

  // Diff to find what to subscribe/unsubscribe
  const toSubscribeNSE = [];
  const toSubscribeBSE = [];
  for (const [token, info] of targetTokens.entries()) {
    if (!subscribedTokens.has(token)) {
      if (info.exchangeType === 1) toSubscribeNSE.push(token);
      else toSubscribeBSE.push(token);
    }
  }

  const toUnsubscribeNSE = [];
  const toUnsubscribeBSE = [];
  for (const [token, info] of subscribedTokens.entries()) {
    if (!targetTokens.has(token)) {
      if (info.exchangeType === 1) toUnsubscribeNSE.push(token);
      else toUnsubscribeBSE.push(token);
    }
  }

  // Send subscribe requests
  if (toSubscribeNSE.length > 0) {
    sendSubscriptionRequest(1, 1, toSubscribeNSE);
  }
  if (toSubscribeBSE.length > 0) {
    sendSubscriptionRequest(1, 3, toSubscribeBSE);
  }

  // Send unsubscribe requests
  if (toUnsubscribeNSE.length > 0) {
    sendSubscriptionRequest(0, 1, toUnsubscribeNSE);
  }
  if (toUnsubscribeBSE.length > 0) {
    sendSubscriptionRequest(0, 3, toUnsubscribeBSE);
  }

  // Update our local tracking map
  for (const token of [...toUnsubscribeNSE, ...toUnsubscribeBSE]) {
    subscribedTokens.delete(token);
  }
  for (const token of [...toSubscribeNSE, ...toSubscribeBSE]) {
    const info = targetTokens.get(token);
    subscribedTokens.set(token, info);
  }
};

function sendSubscriptionRequest(action, exchangeType, tokens) {
  try {
    // Guard: Only send if WebSocket is actually open (readyState 1)
    // The Angel One SDK uses an internal timer that can fire before the connection is ready.
    if (!webSocketClient || !wsConnected) {
      console.warn('⚠️  [WebSocket] Skipping subscription request — socket not open yet.');
      return;
    }

    const underlying = webSocketClient._ws || webSocketClient.ws;
    if (underlying && underlying.readyState !== 1) {
      console.warn(`⚠️  [WebSocket] Skipping subscription — readyState is ${underlying.readyState} (not OPEN).`);
      return;
    }

    const req = {
      correlationID: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      action,
      mode: 2, // Mode 2 = Quote
      exchangeType,
      tokens
    };
    webSocketClient.fetchData(req);
    console.log(`🔌 [WebSocket] Sent ${action === 1 ? 'Subscribe' : 'Unsubscribe'} request for ${tokens.length} tokens on exchange ${exchangeType}`);
  } catch (err) {
    console.error('❌ [WebSocket] Failed to send subscription request:', err.message);
  }
}

exports.isConnected = () => wsConnected;
