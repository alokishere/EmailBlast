const mongoose = require('mongoose');

let hasConnectedOnce = false;

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

  if (mongoose.connection.readyState === 1 || hasConnectedOnce) {
    return true;
  }

  try {
    const options = {
      serverSelectionTimeoutMS: 10000,
      autoIndex: true,
    };

    if (dbName) {
      options.dbName = dbName;
    }

    await mongoose.connect(mongoUri, options);

    hasConnectedOnce = true;
    console.log(
      `[db] MongoDB connected${dbName ? ` (db override: ${dbName})` : ' (db from URI)'}`
    );
    return true;
  } catch (error) {
    console.error('[db] MongoDB connection failed:', error.message);
    return false;
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
