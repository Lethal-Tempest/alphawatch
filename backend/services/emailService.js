// ─────────────────────────────────────────────────────────────────────────────
// backend/services/emailService.js
//
// Email sending engine for alert triggers.
// Automatically provisions Ethereal test accounts if SMTP details are missing.
// ─────────────────────────────────────────────────────────────────────────────
const nodemailer = require('nodemailer');

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    console.log('✉️  Using custom SMTP configuration for email alerts');
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10) || 587,
      secure: parseInt(port, 10) === 465,
      auth: { user, pass }
    });
  } else {
    console.log('✉️  No SMTP configuration found in environment. Creating runtime Ethereal Email test account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log(`✉️  Ethereal Test Account created — User: ${testAccount.user}`);
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
    } catch (err) {
      console.error('[EmailService] Failed to create Ethereal test account:', err.message);
      // Fallback to a mock transporter that logs mail to stdout
      transporter = {
        sendMail: async (options) => {
          console.log('✉️  [MOCK EMAIL] To:', options.to, '| Subject:', options.subject);
          return { messageId: 'mock-id-' + Date.now() };
        }
      };
    }
  }

  return transporter;
}

exports.sendAlertEmail = async (toEmail, alert, symbol, exchange, ltp) => {
  try {
    const client = await getTransporter();
    const from = process.env.SMTP_FROM || '"AlphaWatch Alerts" <alerts@alphawatch.com>';
    const subject = `🔔 Alert Triggered: ${alert.name} (${exchange}:${symbol})`;

    const conditionsHtml = alert.conditions.map(c => {
      const rhs = c.rightType === 'value' ? c.rightValue : c.rightIndicator;
      return `<li><b>${c.leftIndicator} (${c.timeframe})</b> ${c.operator} <b>${rhs}</b></li>`;
    }).join('');

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #4f46e5; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.03em;">AlphaWatch Alerts</h1>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.8;">Real-Time Condition Match</p>
        </div>
        <div style="padding: 24px; background-color: #ffffff; color: #1e293b; line-height: 1.6;">
          <p style="margin-top: 0;">Hi there,</p>
          <p>Your alert <b>"${alert.name}"</b> was triggered because the stock <b>${exchange}:${symbol}</b> satisfied all conditions:</p>
          
          <ul style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px; padding: 16px 16px 16px 32px; margin: 16px 0;">
            ${conditionsHtml}
          </ul>

          <div style="background-color: #f1f5f9; border-radius: 8px; padding: 12px 16px; margin: 16px 0; text-align: center;">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; display: block;">Trigger Price (LTP)</span>
            <span style="font-size: 24px; font-weight: 800; color: #0f172a; display: block; margin-top: 4px;">₹${Number(ltp).toFixed(2)}</span>
          </div>

          <p style="font-size: 11px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            Triggered At: ${new Date().toLocaleString('en-IN')}<br/>
            Alert ID: ${alert._id.toString()}<br/>
            Type: ${alert.targetType === 'watchlist' ? 'Watchlist' : 'Specific Stocks'}
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
          This email was sent dynamically by the AlphaWatch alert scanner engine.
        </div>
      </div>
    `;

    const info = await client.sendMail({
      from,
      to: toEmail,
      subject,
      html
    });

    console.log(`✉️  Alert email sent successfully to ${toEmail} [MessageID: ${info.messageId}]`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`✉️  [Ethereal Email Sandbox] View triggered email: ${previewUrl}`);
    }
  } catch (err) {
    console.error('[EmailService] Failed to send email alert:', err.message);
  }
};
