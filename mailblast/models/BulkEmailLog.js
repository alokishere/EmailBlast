const mongoose = require('mongoose');

const bulkEmailLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    googleId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    textLength: {
      type: Number,
      default: 0,
      min: 0,
    },
    hasHtml: {
      type: Boolean,
      default: false,
    },
    htmlLength: {
      type: Number,
      default: 0,
      min: 0,
    },
    recipientCount: {
      type: Number,
      required: true,
      min: 0,
    },
    recipients: {
      type: [String],
      default: [],
    },
    attachments: {
      type: [
        {
          filename: { type: String, default: '' },
          mimetype: { type: String, default: '' },
          size: { type: Number, default: 0, min: 0 },
        },
      ],
      default: [],
    },
    sent: {
      type: Number,
      default: 0,
      min: 0,
    },
    failed: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['success', 'partial', 'failed'],
      default: 'success',
    },
    results: {
      type: [
        {
          email: { type: String, required: true },
          status: { type: String, enum: ['sent', 'failed'], required: true },
          error: { type: String, default: '' },
        },
      ],
      default: [],
    },
    error: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.BulkEmailLog || mongoose.model('BulkEmailLog', bulkEmailLogSchema);
