const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH ||
  (process.env.VERCEL ? '/tmp/events.db' : path.join(__dirname, '../../data/events.db'));

let _db = null;

function getDb() {
  if (_db) return _db;
  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id TEXT,
      title TEXT NOT NULL,
      artist TEXT,
      venue TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Vancouver',
      date TEXT,
      time TEXT,
      price_min REAL,
      price_max REAL,
      price_text TEXT,
      genre TEXT,
      genres TEXT,
      ticket_url TEXT,
      image_url TEXT,
      description TEXT,
      scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source, source_id)
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(event_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
    CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue);
    CREATE INDEX IF NOT EXISTS idx_events_genre ON events(genre);
    CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
  `);

  // Migrate: add genres column to existing databases that don't have it yet
  const cols = db.prepare("PRAGMA table_info(events)").all().map((c) => c.name);
  if (!cols.includes('genres')) {
    db.exec('ALTER TABLE events ADD COLUMN genres TEXT');
  }
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, closeDb };
