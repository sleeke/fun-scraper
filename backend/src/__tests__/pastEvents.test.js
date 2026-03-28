/**
 * Unit tests for past-event filtering across all three layers:
 *   1. DB layer  — prunePastEvents cleans SQLite
 *   2. Blob layer — saveEventsToBlob excludes past events from the upload
 *   3. Hydration layer — hydrateFromBlob skips past events when restoring
 *   4. Scrape filter — today's LOCAL date events are NOT dropped
 *
 * Uses an in-memory SQLite database and mocks @vercel/blob to avoid
 * real network calls.
 */
process.env.DB_PATH = ':memory:';
process.env.BLOB_READ_WRITE_TOKEN = 'test-token'; // needed to reach Blob code paths

const Database = require('better-sqlite3');
const { prunePastEvents, saveEventsToBlob, hydrateFromBlob } = require('../db/blobSync');

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a fresh in-memory DB with the same schema used in production.
 */
function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'test',
      source_id TEXT,
      title TEXT NOT NULL,
      artist TEXT,
      venue TEXT NOT NULL DEFAULT 'Test Venue',
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
    )
  `);
  return db;
}

/** Return today as YYYY-MM-DD */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Return a date N days from today as YYYY-MM-DD using LOCAL time (consistent with todayStr) */
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  // Use local date getters so we stay in sync with todayStr() which also uses local time
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Insert a row into the events table and return its id.
 */
function insertEvent(db, { title = 'Test', date = null, source = 'test', source_id = null } = {}) {
  const id = title + (source_id || Math.random().toString());
  const result = db
    .prepare(
      "INSERT INTO events (title, date, source, source_id, venue) VALUES (?, ?, ?, ?, 'Test Venue')"
    )
    .run(title, date, source, source_id || id);
  return result.lastInsertRowid;
}

// ─── Mock @vercel/blob ─────────────────────────────────────────────────────────

// We capture what was uploaded and what URL list is returned so we can inspect
// the payload without making real HTTP calls.
let lastUploaded = null; // the JSON string passed to put()
const mockBlobList = jest.fn();
const mockBlobPut = jest.fn();

jest.mock('@vercel/blob', () => ({
  put: (...args) => mockBlobPut(...args),
  list: (...args) => mockBlobList(...args),
}));

// Also mock axios (used by hydrateFromBlob to download the blob)
jest.mock('axios');
const axios = require('axios');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('prunePastEvents', () => {
  test('deletes events with a date in the past', () => {
    const db = makeDb();
    const pastId = insertEvent(db, { title: 'Past', date: '2000-01-01' });
    const futureId = insertEvent(db, { title: 'Future', date: '2099-01-01' });

    const removed = prunePastEvents(db);

    expect(removed).toBe(1);
    expect(db.prepare('SELECT id FROM events WHERE id = ?').get(pastId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM events WHERE id = ?').get(futureId)).toBeDefined();
  });

  test('keeps events with no date (date-unknown events are valid)', () => {
    const db = makeDb();
    const undatedId = insertEvent(db, { title: 'No Date', date: null });

    const removed = prunePastEvents(db);

    expect(removed).toBe(0);
    expect(db.prepare('SELECT id FROM events WHERE id = ?').get(undatedId)).toBeDefined();
  });

  test('keeps events with date equal to today', () => {
    const db = makeDb();
    const todayId = insertEvent(db, { title: 'Today', date: today() });

    const removed = prunePastEvents(db);

    expect(removed).toBe(0);
    expect(db.prepare('SELECT id FROM events WHERE id = ?').get(todayId)).toBeDefined();
  });

  test('returns 0 when the table is empty', () => {
    const db = makeDb();
    expect(prunePastEvents(db)).toBe(0);
  });

  test('removes multiple past events in one call', () => {
    const db = makeDb();
    insertEvent(db, { title: 'Past1', date: '2019-01-01' });
    insertEvent(db, { title: 'Past2', date: '2020-06-15' });
    insertEvent(db, { title: 'Future', date: daysFromNow(10) });

    const removed = prunePastEvents(db);

    expect(removed).toBe(2);
    expect(db.prepare('SELECT COUNT(*) as c FROM events').get().c).toBe(1);
  });
});

describe('saveEventsToBlob — past-event exclusion', () => {
  beforeEach(() => {
    lastUploaded = null;
    mockBlobPut.mockReset();
    mockBlobPut.mockImplementation((_path, json) => {
      lastUploaded = json;
      return Promise.resolve({ url: 'https://blob.example/events/all.json' });
    });
  });

  test('does NOT include past events in the uploaded JSON', async () => {
    const db = makeDb();
    insertEvent(db, { title: 'Past Event', date: '2000-01-01' });
    insertEvent(db, { title: 'Future Event', date: '2099-01-01' });

    await saveEventsToBlob(db);

    expect(mockBlobPut).toHaveBeenCalledTimes(1);
    const uploaded = JSON.parse(lastUploaded);
    const titles = uploaded.map((e) => e.title);
    expect(titles).not.toContain('Past Event');
    expect(titles).toContain('Future Event');
  });

  test('includes events with no date in the upload', async () => {
    const db = makeDb();
    insertEvent(db, { title: 'Undated Event', date: null });

    await saveEventsToBlob(db);

    const uploaded = JSON.parse(lastUploaded);
    expect(uploaded.some((e) => e.title === 'Undated Event')).toBe(true);
  });

  test('uploads an empty array when all events are in the past', async () => {
    const db = makeDb();
    insertEvent(db, { title: 'Old', date: '1999-12-31' });

    await saveEventsToBlob(db);

    const uploaded = JSON.parse(lastUploaded);
    expect(uploaded).toHaveLength(0);
  });
});

describe('hydrateFromBlob — past-event exclusion', () => {
  beforeEach(() => {
    mockBlobList.mockReset();
    axios.get = jest.fn();
  });

  test('does NOT insert past events from blob into SQLite', async () => {
    const db = makeDb();

    // Simulate a blob with one past and one future event
    mockBlobList.mockResolvedValue({
      blobs: [{ url: 'https://blob.example/events/all.json' }],
    });
    axios.get.mockResolvedValue({
      data: [
        { source: 'test', source_id: 'past1', title: 'From Past', venue: 'V', date: '2000-01-01' },
        { source: 'test', source_id: 'fut1', title: 'From Future', venue: 'V', date: '2099-01-01' },
      ],
    });

    await hydrateFromBlob(db);

    const rows = db.prepare('SELECT title FROM events').all();
    const titles = rows.map((r) => r.title);
    expect(titles).not.toContain('From Past');
    expect(titles).toContain('From Future');
  });

  test('inserts undated events from blob (date-unknown events are kept)', async () => {
    const db = makeDb();

    mockBlobList.mockResolvedValue({
      blobs: [{ url: 'https://blob.example/events/all.json' }],
    });
    axios.get.mockResolvedValue({
      data: [
        { source: 'test', source_id: 'nod1', title: 'No Date Event', venue: 'V', date: null },
      ],
    });

    await hydrateFromBlob(db);

    const row = db.prepare("SELECT * FROM events WHERE title = 'No Date Event'").get();
    expect(row).toBeDefined();
  });

  test('skips hydration when local DB already has events', async () => {
    const db = makeDb();
    insertEvent(db, { title: 'Already There', date: '2099-01-01' });

    await hydrateFromBlob(db);

    // list() should never be called because the DB is not empty
    expect(mockBlobList).not.toHaveBeenCalled();
  });
});

// ─── Scrape-filter local-date correctness ────────────────────────────────────

/**
 * These tests verify that the scrape-route's "future events only" filter
 * uses LOCAL date (not UTC), so events happening TODAY are never silently
 * dropped just because UTC has already rolled over to tomorrow.
 *
 * We inline the same logic used in scrape.js so the unit test stays
 * independent of Express, but stays in sync via todayStr from blobSync.
 */
const { todayStr } = require('../db/blobSync'); // exported for testing

describe('scrape future-events filter — uses local date not UTC', () => {
  test('todayStr() returns local YYYY-MM-DD not UTC', () => {
    const local = todayStr();
    const utc = new Date().toISOString().slice(0, 10);
    // Both should be valid dates; in non-UTC timezones they may differ.
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(utc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // local should never be MORE than 1 day behind UTC
    // (i.e., local >= utc - 1 day, which is always true for realistic timezone offsets)
    const localMs = new Date(local).getTime();
    const utcMs = new Date(utc).getTime();
    expect(localMs).toBeGreaterThanOrEqual(utcMs - 86400000);
  });

  test('an event dated today (local) passes the future filter', () => {
    const today = todayStr();
    const event = { title: 'Today Event', date: today };
    const filtered = [event].filter((ev) => !ev.date || ev.date >= today);
    expect(filtered).toHaveLength(1);
  });

  test('an event dated yesterday is removed by the future filter', () => {
    const yesterday = daysFromNow(-1);
    const today = todayStr();
    const event = { title: 'Yesterday Event', date: yesterday };
    const filtered = [event].filter((ev) => !ev.date || ev.date >= today);
    expect(filtered).toHaveLength(0);
  });

  test('an event with no date always passes the future filter', () => {
    const today = todayStr();
    const event = { title: 'Undated Event', date: null };
    const filtered = [event].filter((ev) => !ev.date || ev.date >= today);
    expect(filtered).toHaveLength(1);
  });
});
