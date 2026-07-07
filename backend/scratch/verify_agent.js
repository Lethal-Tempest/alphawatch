// backend/scratch/verify_agent.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Watchlist = require('../models/Watchlist');
const agentService = require('../services/agentService');

async function runVerification() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected.');

    // Find the test user created during browser verification
    const user = await User.findOne({ email: 'testagent@example.com' });
    if (!user) {
      console.error('❌ Test user testagent@example.com not found. Please register/login first in the browser.');
      process.exit(1);
    }
    console.log(`👤 Found test user: ${user.email} (ID: ${user._id})`);

    // Find user's default watchlist
    const watchlist = await Watchlist.findOne({ userId: user._id });
    if (!watchlist) {
      console.error('❌ Watchlist not found for test user.');
      process.exit(1);
    }
    console.log(`📋 Found watchlist: '${watchlist.name}' (ID: ${watchlist._id}) with ${watchlist.stocks.length} stocks.`);

    // 1. Verify custom score creation and assignment
    console.log('\n--- 1. Testing AWSL scoring system creation ---');
    const promptScore = `Create a custom score called 'Agent SMA Crossover' with formula: if 5m:close crossover 5m:sma20 then score = score + 50 fi and assign it to my current watchlist.`;
    console.log(`💬 User: "${promptScore}"`);
    
    let result = await agentService.runAgentChat(user._id, promptScore, watchlist._id);
    console.log(`🤖 AI: "${result.response}"`);
    console.log(`🔄 Refresh required: ${result.refreshRequired}`);

    // Verify watchlist was updated with the scoring system assignment
    const updatedWl = await Watchlist.findById(watchlist._id);
    console.log(`🔍 Watchlist assigned scoring system ID: ${updatedWl.assignedScoringSystemId || 'NONE'}`);

    // 2. Verify backtesting execution
    console.log('\n--- 2. Testing strategy backtesting ---');
    const promptBacktest = `Backtest a strategy where we buy when 1d:close > 1d:sma50 and sell when 1d:close < 1d:sma50 with initial capital 60000 on my current watchlist.`;
    console.log(`💬 User: "${promptBacktest}"`);

    result = await agentService.runAgentChat(user._id, promptBacktest, watchlist._id);
    console.log(`🤖 AI: "${result.response}"`);
    console.log(`🔄 Refresh required: ${result.refreshRequired}`);

    console.log('\n✅ Verification script complete.');
    process.exit(0);
  } catch (error) {
    console.error('💥 Verification failed:', error);
    process.exit(1);
  }
}

runVerification();
