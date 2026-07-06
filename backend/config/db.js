
// ─────────────────────────────────────────────────────────────────────────────
// backend/config/db.js
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('🔌 MongoDB connected.');

    // Direct cleanup of mock test data to keep console warning logs clean
    try {
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('watchlists').updateMany(
          {},
          { $pull: { stocks: { symbol: "TESTSTOCK" } } }
        );
        await db.collection('alerts').deleteMany({ symbol: "TESTSTOCK" });
        console.log('🧹 Cleaned up stale TESTSTOCK mock entries from database.');
      }
    } catch (e) {
      console.warn('⚠️ Mock data cleanup skipped:', e.message);
    }
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    if (err.message.includes('querySrv') || err.message.includes('ECONNREFUSED')) {
      console.error(
        '💡 Fix: Use the Standard (non-SRV) MongoDB connection string from\n' +
        '   Atlas Dashboard → Connect → Drivers → uncheck "Use SRV".'
      );
    }
    process.exit(1);
  }
};

module.exports = connectDB;
