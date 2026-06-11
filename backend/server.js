
// ─────────────────────────────────────────────────────────────────────────────
// backend/server.js — AlphaWatch Unified Backend Engine
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');

const connectDB    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const angelOne        = require('./services/angelOneService');
const polling         = require('./services/pollingLoop');
const alertEngine     = require('./services/alertEngine');
const candleAggregator = require('./services/candleAggregator');

const app        = express();
const httpServer = http.createServer(app);
const io         = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

polling.init(io);
alertEngine.init(io);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/watchlists',  require('./routes/watchlists'));
app.use('/api/alerts',      require('./routes/alerts'));
app.use('/api/search',      require('./routes/search'));
app.use('/api/stock',       require('./routes/market'));
app.use('/api/historical',  require('./routes/historical'));
app.use('/api/indicators',  require('./routes/indicators')); // ← NEW: server-side indicators

app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────────────
// Socket.io Connection Handler
// ─────────────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`user:${decoded.id}`);
      console.log(`🔑 Socket ${socket.id} authenticated as user ${decoded.id}`);
    } catch {
      socket.emit('auth_error', { error: 'Invalid or expired token' });
    }
  });

  socket.on('subscribe', ({ symbol, exchange }) => {
    if (!symbol || !exchange) return;
    const key = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
    socket.join(`ticker:${key}`);
    polling.subscribe(key);

    const liveTick = polling.getLiveState(key);
    if (liveTick) socket.emit('tick', liveTick);

    const history = {};
    for (const interval of Object.keys(candleAggregator.INTERVAL_MS)) {
      const candles = candleAggregator.getCandles(key, interval);
      if (candles.length > 0) history[interval] = candles;
    }
    if (Object.keys(history).length > 0) {
      socket.emit('candle_history', { key, intervals: history });
    }

    console.log(`📈 ${socket.id} subscribed to ${key}`);
  });

  socket.on('unsubscribe', ({ symbol, exchange }) => {
    if (!symbol || !exchange) return;
    const key = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
    socket.leave(`ticker:${key}`);
    polling.unsubscribe(key);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
    for (const key of polling.getSubscriptions()) {
      polling.unsubscribe(key);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Boot Sequence
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();
    await angelOne.syncScripMaster();
    await angelOne.getAngelOneSession();

    httpServer.listen(PORT, () => {
      console.log(`\n🚀 AlphaWatch Server running on http://localhost:${PORT}`);
      console.log(`🌐 WebSocket server ready`);
    });

    setInterval(polling.runPollingCycle, 5000);
    console.log('⏱️  Market polling loop started (5s interval)');

    setInterval(async () => {
      try { await angelOne.getAngelOneSession(); }
      catch (err) { console.error('[Session Refresh] Failed:', err.message); }
    }, 22 * 60 * 60 * 1000);

  } catch (err) {
    console.error('💥 Server failed to start:', err.message);
    process.exit(1);
  }
}

startServer();
