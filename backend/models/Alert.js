// ─────────────────────────────────────────────────────────────────────────────
// backend/models/Alert.js
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const alertConditionSchema = new mongoose.Schema({
  timeframe: {
    type: String,
    enum: ['1m', '5m', '10m', '15m', '30m', '1h', '1d'],
    required: true,
  },
  leftIndicator: {
    type: String,
    required: true,
  },
  operator: {
    type: String,
    enum: ['>', '>=', '==', '<=', '<', '!='],
    required: true,
  },
  rightType: {
    type: String,
    enum: ['value', 'indicator'],
    required: true,
  },
  rightValue: {
    type: Number,
    required: false,
  },
  rightIndicator: {
    type: String,
    required: false,
  },
}, { _id: false });

const alertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  targetType: {
    type: String,
    enum: ['specific_stocks', 'watchlist'],
    required: true,
  },
  watchlistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Watchlist',
    default: null,
  },
  stocks: [
    {
      symbol: { type: String, required: true, uppercase: true, trim: true },
      exchange: { type: String, required: true, enum: ['NSE', 'BSE'], uppercase: true }
    }
  ],
  conditions: {
    type: [alertConditionSchema],
    required: true,
    validate: [v => v.length > 0, 'At least one condition is required']
  },
  isRepeating: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['active', 'triggered', 'dismissed'],
    default: 'active',
    index: true,
  },
  triggeredAt: {
    type: Date,
    default: null,
  },
  lastTriggeredAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});


module.exports = mongoose.model('Alert', alertSchema);
