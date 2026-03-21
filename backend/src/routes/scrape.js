const express = require('express');
const router = express.Router();
const SCRAPERS = require('../scrapers');
const { getDb } = require('../db/schema');

/**
 * POST /api/scrape
 * Body: { source: string, url?: string }
 * Triggers a scrape for a given source and saves results to DB.
 */
router.post('/', async (req, res) => {
  const { source, url } = req.body;

  if (!source) {
    return res.status(400).json({ error: 'source is required', available: Object.keys(SCRAPERS) });
  }

  const scraper = SCRAPERS[source];
  if (!scraper) {
    return res.status(404).json({
      error: `Unknown source: ${source}`,
      available: Object.keys(SCRAPERS),
    });
  }

  try {
    const events = await scraper.scrape(url || scraper.DEFAULT_URL);
    const db = getDb();

    const stmt = db.prepare(`
      INSERT INTO events
        (source, source_id, title, artist, venue, city, date, time,
         price_min, price_max, price_text, genre, ticket_url, image_url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, source_id) DO UPDATE SET
        title = excluded.title,
        artist = excluded.artist,
        venue = excluded.venue,
        city = excluded.city,
        date = excluded.date,
        time = excluded.time,
        price_min = excluded.price_min,
        price_max = excluded.price_max,
        price_text = excluded.price_text,
        genre = excluded.genre,
        ticket_url = excluded.ticket_url,
        image_url = excluded.image_url,
        description = excluded.description,
        scraped_at = datetime('now')
    `);

    const checkStmt = db.prepare('SELECT id FROM events WHERE source = ? AND source_id = ?');

    const upsertMany = db.transaction((evts) => {
      let inserted = 0;
      let updated = 0;
      for (const ev of evts) {
        if (!ev.source_id) continue; // skip events without an identifier
        const existing = checkStmt.get(ev.source, ev.source_id);
        stmt.run(
          ev.source, ev.source_id, ev.title, ev.artist || null,
          ev.venue, ev.city || 'Vancouver', ev.date || null, ev.time || null,
          ev.price_min ?? null, ev.price_max ?? null, ev.price_text || null,
          ev.genre || null, ev.ticket_url || null, ev.image_url || null,
          ev.description || null
        );
        if (existing) updated++;
        else inserted++;
      }
      return { inserted, updated };
    });

    const result = upsertMany(events);
    res.json({ source, scraped: events.length, ...result });
  } catch (err) {
    console.error(`[scrape] Error scraping ${source}:`, err.message);
    res.status(502).json({ error: `Failed to scrape ${source}: ${err.message}` });
  }
});

/**
 * GET /api/scrape/sources
 * List available scrapers and their default URLs.
 */
router.get('/sources', (_req, res) => {
  const sources = Object.entries(SCRAPERS).map(([key, scraper]) => ({
    key,
    defaultUrl: scraper.DEFAULT_URL,
  }));
  res.json(sources);
});

module.exports = router;
