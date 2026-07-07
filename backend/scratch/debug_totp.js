const { authenticator } = require('otplib');
require('dotenv').config();
console.log("Node TOTP:", authenticator.generate(process.env.ANGEL_TOTP_SECRET));
