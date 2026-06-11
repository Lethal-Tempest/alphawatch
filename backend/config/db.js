
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
