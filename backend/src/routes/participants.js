const express = require('express');
const router = express.Router({ mergeParams: true });
const { getDb } = require('../db/schema');

/**
 * GET /api/events/:eventId/participants
 */
router.get('/', (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const participants = db
    .prepare('SELECT * FROM participants WHERE event_id = ? ORDER BY added_at ASC')
    .all(req.params.eventId);

  res.json(participants);
});

/**
 * POST /api/events/:eventId/participants
 * Body: { name: string }
 */
router.post('/', (req, res) => {
  const db = getDb();
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  try {
    const info = db
      .prepare('INSERT INTO participants (event_id, name) VALUES (?, ?)')
      .run(req.params.eventId, name.trim());

    const participant = db
      .prepare('SELECT * FROM participants WHERE id = ?')
      .get(info.lastInsertRowid);

    res.status(201).json(participant);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Participant already added' });
    }
    throw err;
  }
});

/**
 * DELETE /api/events/:eventId/participants/:participantId
 */
router.delete('/:participantId', (req, res) => {
  const db = getDb();
  const info = db
    .prepare('DELETE FROM participants WHERE id = ? AND event_id = ?')
    .run(req.params.participantId, req.params.eventId);
  if (info.changes === 0) return res.status(404).json({ error: 'Participant not found' });
  res.json({ success: true });
});

module.exports = router;
