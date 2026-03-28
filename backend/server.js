const app = require('./src/app');
const { hydrateDbFromBlob } = require('./src/blob');

const PORT = process.env.PORT || 3001;

async function start() {
  // Restore persisted events from Vercel Blob before accepting requests.
  // On local dev (no BLOB_READ_WRITE_TOKEN) this is a no-op.
  try {
    await hydrateDbFromBlob();
  } catch (err) {
    console.warn('[blob] Hydration failed, starting with empty DB:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`fun-scraper API server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
