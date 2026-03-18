const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const isAuth = require('../middleware/isAuth');
const { connectDB, isPersistenceEnabled } = require('../config/db');
const User = require('../models/User');
const BulkEmailLog = require('../models/BulkEmailLog');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseEmails(raw) {
  if (Array.isArray(raw)) {
    return raw.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
  }

  if (typeof raw !== 'string') {
    return [];
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
    }
  } catch (error) {
    // Fall through to delimiter parsing.
  }

  return trimmed
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || '';
}

async function buildRawMessage({ from, to, subject, text, html, attachments }) {
  const transporter = nodemailer.createTransport({
    service: false,
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
    ...(attachments.length
      ? {
          attachments: attachments.map((file) => ({
            filename: file.originalname,
            content: file.buffer,
            contentType: file.mimetype || 'application/octet-stream',
          })),
        }
      : {}),
  });

  const messageBuffer = Buffer.isBuffer(info.message)
    ? info.message
    : Buffer.from(String(info.message), 'utf8');

  return messageBuffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function persistBulkLog({
  req,
  subject,
  text,
  html,
  emails,
  attachments,
  sent,
  failed,
  results,
  error = '',
}) {
  if (!isPersistenceEnabled() || !req.user?.id) {
    return;
  }

  const connected = await connectDB();
  if (!connected) {
    return;
  }

  try {
    const user = await User.findOneAndUpdate(
      { googleId: req.user.id },
      {
        $set: {
          provider: 'google',
          name: req.user.name || '',
          email: req.user.email || '',
          photo: req.user.photo || '',
          lastSeenAt: new Date(),
          lastIp: getClientIp(req),
          lastUserAgent: req.get('user-agent') || '',
          isActive: true,
          isDeleted: false,
        },
        $setOnInsert: {
          firstLoginAt: new Date(),
          lastLoginAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    const status = failed === 0 ? 'success' : sent > 0 ? 'partial' : 'failed';

    await BulkEmailLog.create({
      user: user._id,
      googleId: req.user.id,
      email: req.user.email || '',
      subject,
      textBody: text,
      textLength: text.length,
      hasHtml: Boolean(html),
      htmlBody: html,
      htmlLength: html.length,
      recipientCount: emails.length,
      recipients: emails,
      attachments: attachments.map((file) => ({
        filename: file.originalname || '',
        mimetype: file.mimetype || '',
        size: Number(file.size || file.buffer?.length || 0),
      })),
      sent,
      failed,
      status,
      results,
      error,
    });
  } catch (dbError) {
    console.error('[send] Failed to persist bulk email log:', dbError.message);
  }
}

router.post('/send-bulk', isAuth, upload.array('attachments'), async (req, res) => {
  try {
    const subject = String(req.body.subject || '').trim();
    const text = String(req.body.text || '').trim();
    const html = String(req.body.html || '').trim();
    const emails = Array.from(new Set(parseEmails(req.body.emails)));

    if (!subject) {
      return res.status(400).json({ error: 'Subject is required.' });
    }

    if (!text && !html) {
      return res.status(400).json({ error: 'Text is required when HTML is not provided.' });
    }

    if (!emails.length) {
      return res.status(400).json({ error: 'At least one recipient email is required.' });
    }

    const invalidEmails = emails.filter((email) => !isValidEmail(email));
    if (invalidEmails.length) {
      return res.status(400).json({
        error: 'Invalid recipient email(s) found.',
        invalidEmails,
      });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: req.user.accessToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const attachments = req.files || [];

    console.log(`[send] Bulk send started. Recipients=${emails.length} Attachments=${attachments.length}`);

    const results = [];

    for (const email of emails) {
      try {
        const raw = await buildRawMessage({
          from: `"${req.user.name}" <${req.user.email}>`,
          to: email,
          subject,
          text,
          html,
          attachments,
        });

        await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        });

        results.push({ email, status: 'sent' });
        console.log('[send] Recipient sent');
      } catch (error) {
        const errorMessage =
          error?.response?.data?.error?.message || error.message || 'Unknown send error';

        results.push({
          email,
          status: 'failed',
          error: errorMessage,
        });

        console.error(`[send] Recipient failed: ${errorMessage}`);
      }
    }

    const sent = results.filter((item) => item.status === 'sent').length;
    const failed = results.length - sent;

    await persistBulkLog({
      req,
      subject,
      text,
      html,
      emails,
      attachments,
      sent,
      failed,
      results,
    });

    return res.status(failed ? 207 : 200).json({
      total: emails.length,
      sent,
      failed,
      results,
    });
  } catch (error) {
    console.error('[send] Bulk send route error:', error);
    await persistBulkLog({
      req,
      subject: String(req.body?.subject || '').trim(),
      text: String(req.body?.text || '').trim(),
      html: String(req.body?.html || '').trim(),
      emails: parseEmails(req.body?.emails),
      attachments: req.files || [],
      sent: 0,
      failed: parseEmails(req.body?.emails).length || 0,
      results: [],
      error: error.message || 'Unknown send error',
    });

    return res.status(500).json({
      error: 'Failed to send bulk email.',
      details: error.message,
    });
  }
});

module.exports = router;
