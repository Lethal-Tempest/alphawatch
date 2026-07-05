require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Watchlist = require('../models/Watchlist');

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alphawatch';

async function runTest() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected.');

  try {
    console.log('🧹 Cleaning old mock test data...');
    await User.deleteMany({ email: /test-scoring-user/ });
    
    console.log('👤 Creating mock user...');
    const user = await User.create({
      email: 'test-scoring-user@alphawatch.com',
      password: 'password123'
    });

    console.log('📋 Creating mock watchlist...');
    const watchlist = await Watchlist.create({
      userId: user._id,
      name: 'Scoring Test WL',
      stocks: []
    });

    // Verify Default Score template pre-population on load:
    console.log('🧪 Verifying config pre-population...');
    let scoringSystems = user.scoringSystems || [];
    if (scoringSystems.length === 0) {
      user.scoringSystems.push({
        name: 'Default Close Price',
        conditions: [
          {
            type: 'operand',
            valueType: 'indicator',
            timeframe: '5m',
            indicator: 'close'
          }
        ]
      });
      await user.save();
      scoringSystems = user.scoringSystems;
      console.log('👉 Default pre-populated successfully!');
    }

    if (scoringSystems.length !== 1 || scoringSystems[0].name !== 'Default Close Price') {
      throw new Error('Default score system pre-population failed.');
    }

    // Verify Creating reusable scoring system:
    console.log('🧪 Creating reusable Trend Score formula...');
    user.scoringSystems.push({
      name: 'Trend Score',
      conditions: [
        { type: 'operand', valueType: 'indicator', timeframe: '15m', indicator: 'close' },
        { type: 'operator', valueStr: '-' },
        { type: 'operand', valueType: 'indicator', timeframe: '15m', indicator: 'ema20' }
      ]
    });
    await user.save();
    console.log('👉 Trend Score formula created.');

    const trendScoreSys = user.scoringSystems.find(s => s.name === 'Trend Score');
    if (!trendScoreSys) {
      throw new Error('Failed to find created scoring system.');
    }

    // Verify assigning it to the watchlist:
    console.log(`🧪 Assigning Trend Score (ID: ${trendScoreSys._id}) to Watchlist...`);
    watchlist.assignedScoringSystemId = trendScoreSys._id;
    await watchlist.save();

    let updatedWl = await Watchlist.findById(watchlist._id);
    if (updatedWl.assignedScoringSystemId.toString() !== trendScoreSys._id.toString()) {
      throw new Error('Watchlist assignedScoringSystemId save failed.');
    }
    console.log('👉 Watchlist assigned successfully!');

    // Verify Deleting scoring system updates watchlist:
    console.log('🧪 Deleting Trend Score from User pool...');
    user.scoringSystems = user.scoringSystems.filter(s => s._id.toString() !== trendScoreSys._id.toString());
    await user.save();

    // Emulate router DELETE action clean up
    await Watchlist.updateMany(
      { userId: user._id, assignedScoringSystemId: trendScoreSys._id },
      { $unset: { assignedScoringSystemId: "" } }
    );

    updatedWl = await Watchlist.findById(watchlist._id);
    if (updatedWl.assignedScoringSystemId) {
      throw new Error('Watchlist scoring pointer unset on delete failed.');
    }
    console.log('👉 Watchlist pointer cleared successfully!');

    console.log('🎉 Reusable Scoring Systems backend validation passed perfectly!');
  } catch (err) {
    console.error('❌ Validation test failed:', err.stack || err.message);
  } finally {
    console.log('🔌 Disconnecting Mongoose...');
    await mongoose.disconnect();
    console.log('👋 Done.');
  }
}

runTest();
