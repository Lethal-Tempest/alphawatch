
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
  createdAt: { type: Date, default: Date.now },
});

// Prevent duplicate watchlist names per user
watchlistSchema.index({ userId: 1, name: 1 }, { unique: true });

// Virtual: quick stock count without loading all subdocuments
watchlistSchema.virtual('stockCount').get(function () {
  return this.stocks.length;
});

module.exports = mongoose.model('Watchlist', watchlistSchema);
