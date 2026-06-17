require('dotenv').config();
// Also load project-root .env.local (higher priority for local dev)
require('dotenv').config({
  path: require('path').join(__dirname, '../../.env.local'),
  override: true,
});
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const eventsRouter = require('./routes/events');
const participantsRouter = require('./routes/participants');
const scrapeRouter = require('./routes/scrape');
const contributeRouter = require('./routes/contribute');

const app = express();

app.use(cors());
app.use(express.json());

// Rate limiting: general API limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limit for scrape endpoint (external HTTP requests)
const scrapeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.use('/api/scrape', scrapeLimiter);

// On startup (non-test only):
//   1. Prune past events from SQLite so stale data never accumulates across restarts.
//   2. Hydrate from Vercel Blob if the local DB is empty (cold-start recovery).
// Both are skipped in test environments (Jest sets NODE_ENV=test).
//
// hydrationReady is awaited by the middleware below so that the first incoming
// request blocks until the DB is populated rather than returning an empty list.
let hydrationReady = Promise.resolve();
if (process.env.NODE_ENV !== 'test') {
  const { getDb } = require('./db/schema');
  const { hydrateFromBlob, prunePastEvents, pruneNonVancouverEvents } = require('./db/blobSync');
  const startupDb = getDb();
  prunePastEvents(startupDb);
  pruneNonVancouverEvents(startupDb);
  hydrationReady = hydrateFromBlob(startupDb).catch((err) =>
    console.error('[startup] hydrateFromBlob error:', err.message)
  );
}

// Wait for DB hydration to complete before processing any API route so that the
// very first page load returns events instead of an empty list.
app.use('/api', (_req, _res, next) => {
  hydrationReady.then(() => next(), () => next());
});

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Root: redirect to health for convenience
app.get('/', (_req, res) => res.redirect('/api/health'));

// Routes
app.use('/api/events', eventsRouter);
app.use('/api/events/:eventId/participants', participantsRouter);
app.use('/api/scrape', scrapeRouter);
app.use('/api/contribute', contributeRouter);

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
