const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

/**
 * GET /api/events
 * Query params: search, venue, genre, source, date, page, limit
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
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  let where = [];
  let params = [];

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
    where.push('e.genre = ?');
    params.push(genre);
  }
  if (source) {
    where.push('e.source = ?');
    params.push(source);
  }
  if (date) {
    where.push('e.date = ?');
    params.push(date);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) as count FROM events e ${whereClause}`)
    .get(...params);

  const events = db
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(*) FROM participants p WHERE p.event_id = e.id) AS participant_count
       FROM events e
       ${whereClause}
       ORDER BY e.date ASC, e.id DESC
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

module.exports = router;
