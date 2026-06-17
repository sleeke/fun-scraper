const express = require('express');
const multer = require('multer');
const router = express.Router();
const { getDb } = require('../db/schema');
const { analyzeImage } = require('../services/imageAnalyzer');
const { scrapeEventFromUrl, parseEventFromPdf } = require('../services/eventSubmission');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * GET /api/events
 * Query params: search, venue, genre, source, date, page, limit, has_participants
 */
router.get('/', (req, res) => {
  const db = getDb();
  const {
    search = '',
    venue = '',
    genre = '',
    source = '',
    date = '',
    page = 1,
    limit = 20,
    has_participants = '',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  // Compute today's date using LOCAL time so events happening today are never
  // dropped due to UTC being ahead of the server's local timezone.
  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Always exclude past events: only return events with no date, or date >= today.
  // First entry in where must match first entry in params.
  let where = ['(e.date IS NULL OR e.date >= ?)'];
  let params = [todayLocal];

  if (search) {
    where.push('(e.title LIKE ? OR e.artist LIKE ? OR e.venue LIKE ? OR e.description LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (venue) {
    where.push('e.venue LIKE ?');
    params.push(`%${venue}%`);
  }
  if (genre) {
    // Support comma-separated genres: match if genre is the primary genre OR appears in genres list
    where.push(
      "(e.genre = ? OR (',' || LOWER(COALESCE(e.genres,'')) || ',') LIKE ('%,' || LOWER(?) || ',%'))"
    );
    params.push(genre, genre);
  }
  if (source) {
    where.push('e.source = ?');
    params.push(source);
  }
  if (date) {
    where.push('e.date = ?');
    params.push(date);
  }
  if (has_participants === 'true' || has_participants === '1') {
    where.push('(SELECT COUNT(*) FROM participants p WHERE p.event_id = e.id) > 0');
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) as count FROM events e ${whereClause}`)
    .get(...params);

  const events = db
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(*) FROM participants p WHERE p.event_id = e.id) AS participant_count,
        (SELECT GROUP_CONCAT(p.name, ', ') FROM participants p WHERE p.event_id = e.id ORDER BY p.added_at ASC) AS participant_names
       FROM events e
       ${whereClause}
       ORDER BY
         CASE WHEN e.date IS NULL OR e.date = '' THEN 1 ELSE 0 END ASC,
         e.date ASC,
         e.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limitNum, offset);

  res.json({
    total: totalRow.count,
    page: pageNum,
    limit: limitNum,
    events,
  });
});

/**
 * GET /api/events/:id
 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const event = db
    .prepare('SELECT * FROM events WHERE id = ?')
    .get(req.params.id);

  if (!event) return res.status(404).json({ error: 'Event not found' });

  const participants = db
    .prepare('SELECT * FROM participants WHERE event_id = ? ORDER BY added_at ASC')
    .all(event.id);

  res.json({ ...event, participants });
});

/**
 * POST /api/events/from-url
 * Scrape (or URL-parse) event details from a URL and save the event.
 * Accepts: { url: string }
 */
router.post('/from-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  let eventData;
  try {
    eventData = await scrapeEventFromUrl(url);
  } catch (err) {
    return res.status(502).json({ error: `Failed to fetch URL: ${err.message}` });
  }

  if (!eventData) {
    return res.status(422).json({
      error: 'No events could be identified from this URL. Try using the form to enter event details manually.',
    });
  }

  const db = getDb();

  // Use upsert when source_id is present (same URL shouldn't create duplicates)
  const stmt = eventData.source_id
    ? db.prepare(`
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
      `)
    : db.prepare(`
        INSERT INTO events
          (source, source_id, title, artist, venue, city, date, time,
           price_min, price_max, price_text, genre, ticket_url, image_url, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

  const info = stmt.run(
    eventData.source || 'manual',
    eventData.source_id || null,
    eventData.title,
    eventData.artist || null,
    eventData.venue,
    eventData.city || 'Vancouver',
    eventData.date || null,
    eventData.time || null,
    eventData.price_min ?? null,
    eventData.price_max ?? null,
    eventData.price_text || null,
    eventData.genre || null,
    eventData.ticket_url || null,
    eventData.image_url || null,
    eventData.description || null,
  );

  let event = null;
  if (info.lastInsertRowid) {
    event = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  }
  if (!event && eventData.source_id) {
    event = db
      .prepare('SELECT * FROM events WHERE source = ? AND source_id = ?')
      .get(eventData.source || 'manual', eventData.source_id);
  }

  res.status(201).json(event || eventData);
});

/**
 * POST /api/events/from-pdf
 * Upload a PDF (or other document) and extract event details from its text.
 * Accepts: multipart/form-data with field "file"
 */
router.post('/from-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  let eventData;
  try {
    eventData = await parseEventFromPdf(req.file.buffer);
  } catch (err) {
    return res.status(500).json({ error: `Failed to parse file: ${err.message}` });
  }

  if (!eventData) {
    return res.status(422).json({
      error: 'No events could be identified in this document. Try using the form to enter event details manually.',
    });
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO events
      (source, source_id, title, artist, venue, city, date, time,
       price_min, price_max, price_text, genre, ticket_url, image_url, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    'manual',
    null,
    eventData.title,
    eventData.artist || null,
    eventData.venue,
    eventData.city || 'Vancouver',
    eventData.date || null,
    eventData.time || null,
    null,
    null,
    null,
    eventData.genre || null,
    null,
    null,
    eventData.description || null,
  );

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(event);
});

/**
 * POST /api/events
 * Create an event manually
 */
router.post('/', (req, res) => {
  const db = getDb();
  const {
    source, source_id, title, artist, venue, city,
    date, time, price_min, price_max, price_text,
    genre, ticket_url, image_url, description,
  } = req.body;

  if (!title || !venue) {
    return res.status(400).json({ error: 'title and venue are required' });
  }

  const stmt = db.prepare(`
    INSERT INTO events
      (source, source_id, title, artist, venue, city, date, time,
       price_min, price_max, price_text, genre, ticket_url, image_url, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    source || 'manual', source_id || null, title, artist || null,
    venue, city || 'Vancouver', date || null, time || null,
    price_min || null, price_max || null, price_text || null,
    genre || null, ticket_url || null, image_url || null, description || null
  );

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(event);
});

/**
 * DELETE /api/events/:id
 */
router.delete('/:id', (req, res) => {
  const db = getDb();
  const info = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Event not found' });
  res.json({ success: true });
});

/**
 * POST /api/events/:id/analyze
 * Analyze the event's flyer image using AI vision.
 * Requires OPENAI_API_KEY to be set in the environment.
 */
router.post('/:id/analyze', async (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  if (!event.image_url) {
    return res.status(422).json({ error: 'Event has no image to analyze' });
  }

  // Return cached result if already analyzed successfully
  if (event.image_analysis_status === 'completed' && event.image_analysis) {
    return res.json({
      cached: true,
      analysis: JSON.parse(event.image_analysis),
    });
  }

  // Mark as pending
  db.prepare(
    "UPDATE events SET image_analysis_status = 'pending' WHERE id = ?"
  ).run(event.id);

  try {
    const analysis = await analyzeImage(event.image_url);

    db.prepare(
      `UPDATE events
       SET image_analysis = ?, image_analysis_status = 'completed', analyzed_at = datetime('now')
       WHERE id = ?`
    ).run(JSON.stringify(analysis), event.id);

    return res.json({ cached: false, analysis });
  } catch (err) {
    db.prepare(
      "UPDATE events SET image_analysis_status = 'failed' WHERE id = ?"
    ).run(event.id);

    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
});

module.exports = router;
