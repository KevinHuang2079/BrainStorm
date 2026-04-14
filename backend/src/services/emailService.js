const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // app password
  },
});

async function sendPasswordRecovery(toEmail, rawToken) {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;

    await transporter.sendMail({
        from: `"Brainstorm" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Reset your Brainstorm password',
        html: `
            <p>You requested a password reset.</p>
            <p>Click the link below — it expires in 1 hour:</p>
            <a href="${resetUrl}">${resetUrl}</a>
        `,
    });
}

module.exports = { sendPasswordRecovery };