require('dotenv').config();
const path = require('path');
const express = require('express');
const multer = require('multer');
const { sendEmail } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;
const SEND_DELAY_MS = 500;
const upload = multer({
  storage: multer.memoryStorage(),
});

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRecipients(rawEmails) {
  if (Array.isArray(rawEmails)) {
    return rawEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
  }

  if (typeof rawEmails !== 'string') {
    return [];
  }

  const trimmed = rawEmails.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
    }
  } catch (error) {
    // Fallback to comma/space parsing.
  }

  return trimmed
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/send-bulk', upload.array('attachments'), async (req, res) => {
  try {
    const subject = String(req.body.subject || '').trim();
    const text = String(req.body.text || '').trim();
    const html = String(req.body.html || '').trim();
    const recipients = Array.from(new Set(parseRecipients(req.body.emails)));

    if (!subject) {
      return res.status(400).json({ error: 'Subject is required.' });
    }
    if (!text && !html) {
      return res.status(400).json({ error: 'Either text or HTML body is required.' });
    }
    if (!recipients.length) {
      return res.status(400).json({ error: 'At least one recipient is required.' });
    }

    const invalidEmails = recipients.filter((email) => !isValidEmail(email));
    if (invalidEmails.length) {
      return res.status(400).json({
        error: 'One or more recipient emails are invalid.',
        invalidEmails,
      });
    }

    const attachments = (req.files || []).map((file) => ({
      filename: file.originalname,
      content: file.buffer,
      contentType: file.mimetype,
    }));

    const results = [];
// single at a time
    // for (let i = 0; i < recipients.length; i += 1) {
    //   const to = recipients[i];
    //   try {
    //     const info = await sendEmail({
    //       to,
    //       subject,
    //       text,
    //       html,
    //       attachments,
    //     });
    //     results.push({
    //       email: to,
    //       status: 'sent',
    //       messageId: info.messageId,
    //     });
    //   } catch (error) {
    //     results.push({
    //       email: to,
    //       status: 'failed',
    //       error: error.message,
    //     });
    //   }

    //   if (i < recipients.length - 1) {
    //     await sleep(SEND_DELAY_MS);
    //   }
    // }

// 5 email at a time 
    const BATCH_SIZE = 5; // ek saath kitne emails

for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
  const batch = recipients.slice(i, i + BATCH_SIZE);

  console.log(`Sending batch ${Math.floor(i/BATCH_SIZE) + 1} — ${batch.length} emails`);

  // 5 emails ek saath
  const batchResults = await Promise.all(
    batch.map(async (to) => {
      try {
        const info = await sendEmail({ to, subject, text, html, attachments });
        return { email: to, status: 'sent', messageId: info.messageId };
      } catch (error) {
        return { email: to, status: 'failed', error: error.message };
      }
    })
  );

  results.push(...batchResults);

  // Next batch se pehle wait karo
  if (i + BATCH_SIZE < recipients.length) {
    await sleep(SEND_DELAY_MS);
  }
}

    const sent = results.filter((item) => item.status === 'sent').length;
    const failed = results.length - sent;
    const statusCode = failed ? 207 : 200;

    return res.status(statusCode).json({
      ok: failed === 0,
      total: recipients.length,
      sent,
      failed,
      delayMs: SEND_DELAY_MS,
      results,
    });
  } catch (error) {
    console.error('Bulk send error:', error);
    return res.status(500).json({
      error: 'Failed to send bulk emails.',
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
