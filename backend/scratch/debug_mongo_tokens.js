require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function debugTokens() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: 'dakshapjn@gmail.com' });
    if (!user) {
      console.log('User not found!');
      return;
    }

    console.log('Scoring systems:');
    user.scoringSystems.forEach(sys => {
      console.log(`\nSystem Name: ${sys.name}`);
      console.log(`Conditions size: ${sys.conditions.length}`);
      console.log('First 15 tokens:');
      console.log(JSON.stringify(sys.conditions.slice(0, 15), null, 2));
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

debugTokens();
