
// ─────────────────────────────────────────────────────────────────────────────
// backend/models/User.js
// BUG FIX: File was missing `const mongoose = require('mongoose')` — would
// crash at startup with "mongoose is not defined".
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  preferences: {
    defaultExchange: {
      type: String,
      enum: ['NSE', 'BSE'],
      default: 'NSE',
    },
    defaultInterval: {
      type: String,
      enum: ['1m', '5m', '15m', '30m', '1h', '1d'],
      default: '5m',
    },
    theme: {
      type: String,
      enum: ['dark', 'light'],
      default: 'dark',
    },
    activeIndicators: {
      type: [String],
      enum: ['SMA', 'EMA', 'RSI', 'MACD', 'BB'],
      default: [],
    },
  },
  createdAt: { type: Date, default: Date.now },
});

// Hash password before save (only when modified)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Instance method: compare a plaintext candidate against the stored hash
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Never expose the hashed password in JSON API responses
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
