const express = require('express');
const router = express.Router();
const SCRAPERS = require('../scrapers');
const { getDb } = require('../db/schema');
const { lookupArtistGenres, detectGenre } = require('../scrapers/base');

/**
 * Enrich events with MusicBrainz genres for artists that don't yet have
 * a strong genre signal from keyword detection.
 * Capped at 10 unique artist lookups per scrape to stay within rate limits.
 */
async function enrichWithMusicBrainz(events) {
  // Only look up artists where title ≠ artist (i.e., we have a real artist name)
  // and the event title isn't too generic
  const candidates = events.filter(
    (ev) => ev.artist && ev.artist.trim().length > 1
  );
  const uniqueArtists = [
    ...new Set(candidates.map((ev) => ev.artist.trim())),
  ].slice(0, 10);

  if (uniqueArtists.length === 0) return events;

  const artistGenreMap = new Map();
  for (const artist of uniqueArtists) {
    const genres = await lookupArtistGenres(artist);
    if (genres.length > 0) {
      console.log(`[musicbrainz] ${artist} → ${genres.join(', ')}`);
      artistGenreMap.set(artist.trim(), genres);
    }
  }

  return events.map((ev) => {
    const mbGenres = artistGenreMap.get(ev.artist?.trim());
    if (!mbGenres || mbGenres.length === 0) return ev;

    // Use MusicBrainz genres; keep keyword-detected genre as primary if present
    const primaryGenre = ev.genre || detectGenre(mbGenres.join(' ')) || mbGenres[0];
    return {
      ...ev,
      genre: primaryGenre,
      genres: mbGenres.join(', '),
    };
  });
}

/**
 * Turn an axios/network error into a human-readable message.
 */
function describeError(err) {
  if (err.response) {
    const s = err.response.status;
    if (s === 401 || s === 403) return `Access denied (HTTP ${s}) — site may be blocking scrapers`;
    if (s === 404) return `Events page not found (HTTP 404)`;
    if (s === 429) return `Rate limited (HTTP 429) — too many requests, try again later`;
    if (s >= 500) return `Remote server error (HTTP ${s})`;
    return `HTTP ${s}: ${err.message}`;
  }
  if (err.code === 'ECONNREFUSED') return 'Connection refused — site may be down';
  if (err.code === 'ENOTFOUND') return 'Host not found — check URL or network';
  if (err.code === 'ETIMEDOUT' || /timeout/i.test(err.message))
    return 'Request timed out — site too slow or blocking bots';
  return err.message;
}

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
    let events = await scraper.scrape(url || scraper.DEFAULT_URL);
    console.log(`[scrape] ${source}: fetched ${events.length} raw events`);

    // Enrich genres via MusicBrainz
    try {
      events = await enrichWithMusicBrainz(events);
    } catch (enrichErr) {
      console.warn(`[scrape] MusicBrainz enrichment failed for ${source}:`, enrichErr.message);
      // Non-fatal; continue with whatever genres we have
    }

    const db = getDb();

    const stmt = db.prepare(`
      INSERT INTO events
        (source, source_id, title, artist, venue, city, date, time,
         price_min, price_max, price_text, genre, genres, ticket_url, image_url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        genres = excluded.genres,
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
          ev.genre || null, ev.genres || null,
          ev.ticket_url || null, ev.image_url || null,
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
    const friendlyMsg = describeError(err);
    console.error(`[scrape] Error scraping ${source}: ${friendlyMsg}`, {
      source,
      originalError: err.message,
      stack: err.stack,
    });
    res.status(502).json({
      error: `Failed to scrape ${source}: ${friendlyMsg}`,
      source,
      details: err.message,
    });
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
