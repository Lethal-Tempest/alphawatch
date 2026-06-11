
// ─────────────────────────────────────────────────────────────────────────────
// backend/controllers/authController.js
// FIX: JWT sign() payload now includes `email` so the frontend can decode it
// without a separate /me call. Previously only `id` was in the payload, causing
// App.jsx's `payload.email` to always be undefined.
// ─────────────────────────────────────────────────────────────────────────────
const User     = require('../models/User');
const Watchlist = require('../models/Watchlist');
const jwt      = require('jsonwebtoken');

exports.register = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      res.status(400);
      throw new Error('Email and password (min 6 chars) required.');
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400);
      throw new Error('User already exists.');
    }

    const user = await User.create({ email, password });

    // Create a default watchlist for every new user
    await Watchlist.create({ userId: user._id, name: 'My Watchlist', stocks: [], isDefault: true });

    res.status(201).json({ success: true, message: 'Registered successfully. Please sign in.' });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      res.status(401);
      throw new Error('Invalid credentials.');
    }

    // FIX: include `email` in JWT payload so the client can decode user info
    // without a separate /api/auth/me round-trip.
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: { id: user._id, email: user.email },
    });
  } catch (error) {
    next(error);
  }
};
