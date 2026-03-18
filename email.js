require('dotenv').config();
const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || process.env.Email_PASSWORD;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASSWORD,
  },
});

// Verify SMTP config at startup to fail fast when credentials are wrong.
transporter.verify((error) => {
  if (error) {
    console.error('Error connecting to email server:', error.message);
    return;
  }
  console.log('Email server is ready to send messages');
});

const sendEmail = async ({ to, subject, text, html, attachments = [] }) => {
  const info = await transporter.sendMail({
    from: `"Alok Vishwakarma" <${EMAIL_USER}>`,
    to,
    subject,
    text: text || '',
    ...(html ? { html } : {}),
    ...(attachments.length ? { attachments } : {}),
  });

  return info;
};

module.exports = {
  sendEmail,
};
