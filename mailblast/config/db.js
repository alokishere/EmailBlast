const mongoose = require('mongoose');

let connectPromise = null;
let hasNormalizedUserIndexes = false;

function isPersistenceEnabled() {
  return String(process.env.ENABLE_PERSISTENCE || 'false').toLowerCase() === 'true';
}

async function connectDB() {
  if (!isPersistenceEnabled()) {
    console.log('[db] Persistence disabled (ENABLE_PERSISTENCE=false). Running session-only mode.');
    return false;
  }

  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;

  if (!mongoUri) {
    console.warn('[db] MONGO_URI not set. MongoDB persistence is disabled.');
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    return true;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    try {
      const options = {
        serverSelectionTimeoutMS: 10000,
        autoIndex: true,
      };

      if (dbName) {
        options.dbName = dbName;
      }

      await mongoose.connect(mongoUri, options);
      await normalizeUserIndexes();

      console.log(
        `[db] MongoDB connected${dbName ? ` (db override: ${dbName})` : ' (db from URI)'}`
      );
      return true;
    } catch (error) {
      console.error('[db] MongoDB connection failed:', error.message);
      return false;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

async function normalizeUserIndexes() {
  if (hasNormalizedUserIndexes) {
    return;
  }

  try {
    const User = require('../models/User');
    const indexes = await User.collection.indexes();
    const emailIndex = indexes.find((idx) => idx.name === 'email_1');

    if (emailIndex && emailIndex.unique) {
      await User.collection.dropIndex('email_1');
      await User.collection.createIndex({ email: 1 }, { name: 'email_1' });
      console.log('[db] Normalized users.email_1 index to non-unique.');
    }
  } catch (error) {
    console.warn('[db] User index normalization skipped:', error.message);
  } finally {
    hasNormalizedUserIndexes = true;
  }
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  isMongoConnected,
  isPersistenceEnabled,
};
