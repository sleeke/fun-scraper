/**
 * Vercel Blob storage integration.
 *
 * Events are persisted as a single JSON file so that data survives across
 * serverless cold-starts and branches.  All fields present on each event
 * object are round-tripped — known columns land in named SQLite columns,
 * any future/extra fields are stored in the `extra` JSON column so no
 * data is ever silently dropped.
 *
 * Requires BLOB_READ_WRITE_TOKEN to be set in the environment (provided
 * automatically by Vercel when the blob store is linked to the project).
 * When the token is absent (local dev), all operations are no-ops.
 */

const { put, list } = require('@vercel/blob');

const BLOB_PATHNAME = 'events/events.json';
const ENABLED = !!(process.env.BLOB_READ_WRITE_TOKEN);

// Fields that have dedicated SQLite columns — everything else goes to `extra`.
const KNOWN_FIELDS = new Set([
  'source', 'source_id', 'title', 'artist', 'venue', 'city',
  'date', 'time', 'price_min', 'price_max', 'price_text',
  'genre', 'genres', 'ticket_url', 'image_url', 'description',
  // Internal SQLite fields that should not be re-inserted as extra data
  'id', 'scraped_at', 'participant_count', 'participant_names', 'extra',
]);

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Download the events JSON blob and return the raw events array, or null on
 * any failure (missing blob, network error, parse error).
 */
async function loadEventsFromBlob() {
  if (!ENABLED) return null;
  try {
    const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
    if (!blobs.length) {
      console.log('[blob] No existing events blob found — starting fresh');
      return null;
    }

    const res = await fetch(blobs[0].url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : [];
    console.log(`[blob] Loaded ${events.length} events (saved ${data.saved_at ?? 'unknown'})`);
    return events;
  } catch (err) {
    console.warn('[blob] Failed to load events from blob:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Prune past-dated events from SQLite, then serialise the remaining events
 * and upload them to Vercel Blob, replacing the previous file.
 * @param {import('better-sqlite3').Database} db
 */
async function saveAllEventsToBlob(db) {
  if (!ENABLED) return;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Remove events whose date has passed (null/empty dates are kept — they
  // may be recurring or have no fixed date yet).
  const pruned = db
    .prepare("DELETE FROM events WHERE date IS NOT NULL AND date != '' AND date < ?")
    .run(today);
  if (pruned.changes > 0) {
    console.log(`[blob] Pruned ${pruned.changes} past events from the database`);
  }

  const events = db.prepare('SELECT * FROM events').all();

  const payload = {
    version: 1,
    saved_at: new Date().toISOString(),
    count: events.length,
    events,
  };

  await put(BLOB_PATHNAME, JSON.stringify(payload), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  });

  console.log(`[blob] Saved ${events.length} events to blob storage`);
}

// ---------------------------------------------------------------------------
// Hydration (used on cold-start)
// ---------------------------------------------------------------------------

/**
 * Load events from blob storage and upsert them into the local SQLite DB.
 * Past-dated events are filtered out before inserting — they are stale.
 * Called once on server startup.
 */
async function hydrateDbFromBlob() {
  const events = await loadEventsFromBlob();
  if (!events || events.length === 0) return;

  // Lazy-require to avoid circular dependency at module load time
  const { getDb } = require('./db/schema');
  const db = getDb();

  const today = new Date().toISOString().slice(0, 10);
  const fresh = events.filter((ev) => !ev.date || ev.date >= today);
  if (fresh.length < events.length) {
    console.log(`[blob] Skipped ${events.length - fresh.length} past events during hydration`);
  }

  const stmt = db.prepare(`
    INSERT INTO events
      (source, source_id, title, artist, venue, city, date, time,
       price_min, price_max, price_text, genre, genres, ticket_url,
       image_url, description, extra, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_id) DO UPDATE SET
      title      = excluded.title,
      artist     = excluded.artist,
      venue      = excluded.venue,
      city       = excluded.city,
      date       = excluded.date,
      time       = excluded.time,
      price_min  = excluded.price_min,
      price_max  = excluded.price_max,
      price_text = excluded.price_text,
      genre      = excluded.genre,
      genres     = excluded.genres,
      ticket_url = excluded.ticket_url,
      image_url  = excluded.image_url,
      description = excluded.description,
      extra      = excluded.extra,
      scraped_at = excluded.scraped_at
  `);

  const upsert = db.transaction((evts) => {
    for (const ev of evts) {
      if (!ev.source_id) continue;

      // Collect any fields not in the known-column set into `extra`
      const extraObj = Object.fromEntries(
        Object.entries(ev).filter(([k]) => !KNOWN_FIELDS.has(k))
      );
      const extra = Object.keys(extraObj).length ? JSON.stringify(extraObj) : ev.extra ?? null;

      stmt.run(
        ev.source, ev.source_id, ev.title, ev.artist ?? null,
        ev.venue, ev.city ?? 'Vancouver', ev.date ?? null, ev.time ?? null,
        ev.price_min ?? null, ev.price_max ?? null, ev.price_text ?? null,
        ev.genre ?? null, ev.genres ?? null, ev.ticket_url ?? null,
        ev.image_url ?? null, ev.description ?? null,
        extra,
        ev.scraped_at ?? new Date().toISOString(),
      );
    }
  });

  upsert(fresh);
  console.log(`[blob] Hydrated SQLite with ${fresh.length} events from blob`);
}

module.exports = { loadEventsFromBlob, saveAllEventsToBlob, hydrateDbFromBlob, ENABLED };
