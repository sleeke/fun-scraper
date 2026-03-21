require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const eventsRouter = require('./routes/events');
const participantsRouter = require('./routes/participants');
const scrapeRouter = require('./routes/scrape');

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

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/api/events', eventsRouter);
app.use('/api/events/:eventId/participants', participantsRouter);
app.use('/api/scrape', scrapeRouter);

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
