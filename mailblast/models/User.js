const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    provider: {
      type: String,
      default: 'google',
      trim: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    photo: {
      type: String,
      default: '',
      trim: true,
    },
    loginCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    firstLoginAt: {
      type: Date,
    },
    lastLoginAt: {
      type: Date,
    },
    lastLogoutAt: {
      type: Date,
    },
    lastIp: {
      type: String,
      default: '',
      trim: true,
    },
    lastUserAgent: {
      type: String,
      default: '',
      trim: true,
    },
    lastSeenAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
