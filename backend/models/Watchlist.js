
// ─────────────────────────────────────────────────────────────────────────────
// backend/models/Watchlist.js
// BUG FIX: File was missing `const mongoose = require('mongoose')` — would
// crash at startup with "mongoose is not defined".
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Watchlist name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters'],
  },
  stocks: [
    {
      symbol: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
      },
      exchange: {
        type: String,
        required: true,
        enum: ['NSE', 'BSE'],
        uppercase: true,
      },
      addedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  isDefault: {
    type: Boolean,
    default: false,
  },
  scoreConditions: {
    type: [
      {
        timeframe: {
          type: String,
          enum: ['1m', '5m', '10m', '15m', '30m', '1h', '1d'],
          default: '5m'
        },
        leftType: {
          type: String,
          enum: ['value', 'indicator'],
          default: 'value'
        },
        leftValue: {
          type: Number,
          default: 0
        },
        leftIndicator: {
          type: String,
          default: 'close'
        },
        rightType: {
          type: String,
          enum: ['value', 'indicator'],
          default: 'value'
        },
        rightValue: {
          type: Number,
          default: 0
        },
        rightIndicator: {
          type: String,
          default: 'close'
        },
        multiplier: {
          type: Number,
          default: 1
        }
      }
    ],
    default: () => [
      {
        timeframe: '5m',
        leftType: 'value',
        leftValue: 0,
        leftIndicator: 'close',
        rightType: 'value',
        rightValue: 0,
        rightIndicator: 'close',
        multiplier: 1
      }
    ]
  },
  createdAt: { type: Date, default: Date.now },
});

// Prevent duplicate watchlist names per user
watchlistSchema.index({ userId: 1, name: 1 }, { unique: true });

// Virtual: quick stock count without loading all subdocuments
watchlistSchema.virtual('stockCount').get(function () {
  return this.stocks.length;
});

module.exports = mongoose.model('Watchlist', watchlistSchema);
