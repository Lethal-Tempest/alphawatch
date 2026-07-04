const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
  },
  exchange: {
    type: String,
    required: true,
    uppercase: true,
  },
  type: {
    type: String,
    enum: ['buy', 'sell'],
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  orderId: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    default: 'Traded',
  },
  message: {
    type: String,
  },
});

module.exports = mongoose.model('Trade', tradeSchema);
