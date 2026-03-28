'use strict';

const { put, list } = require('@vercel/blob');
const axios = require('axios');

const BLOB_PATHNAME = 'events/all.json';

/**
 * Return today's date as a YYYY-MM-DD string in local time.
 * Events whose `date` field is before this value are considered past.
 */
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Delete all events from SQLite whose date is strictly before today.
 * Events with a null date are not deleted (date unknown = keep them).
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {number} number of rows deleted
 */
function prunePastEvents(db) {
  const today = todayStr();
  const result = db.prepare(
    "DELETE FROM events WHERE date IS NOT NULL AND date < ?"
  ).run(today);
  if (result.changes > 0) {
    console.log(`[blobSync] Pruned ${result.changes} past events (before ${today})`);
  }
  return result.changes;
}

/**
 * Remove events from SQLite that are not from Vancouver.
 *
 * Two passes:
 *   1. General city guard — deletes any event whose `city` column is set to a
 *      value other than a Vancouver-area city (catches future scraper bugs on
 *      any source).  The LIKE '%Vancouver%' pattern intentionally keeps both
 *      'Vancouver', 'North Vancouver', and 'West Vancouver' since all are part
 *      of the Greater Vancouver area served by this app.
 *   2. Stale RA source cleanup — the Resident Advisor scraper previously had a
 *      bug that returned London events labelled as Vancouver.  Any RA event that
 *      was scraped before today is considered potentially tainted and is removed
 *      so it can be re-populated by the corrected scraper.  RA events scraped
 *      today (or with no scraped_at) were inserted after the fix and are kept.
 *      This query runs on every startup but is a cheap no-op once all old events
 *      have been removed — no migration guard is needed.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ cityPruned: number, raPruned: number }} counts of deleted rows
 */
function pruneNonVancouverEvents(db) {
  // 1. General: remove events with an explicitly non-Vancouver city
  const cityResult = db.prepare(
    "DELETE FROM events WHERE city IS NOT NULL AND city NOT LIKE '%Vancouver%'"
  ).run();
  if (cityResult.changes > 0) {
    console.log(`[blobSync] Pruned ${cityResult.changes} event(s) with non-Vancouver city`);
  }

  // 2. Source-specific: purge RA events that were scraped before today — these
  //    may have been ingested by the broken scraper which returned London events.
  //    Events scraped today were stored after the fix and are trusted.
  const today = todayStr();
  const raResult = db.prepare(
    "DELETE FROM events WHERE source = 'residentadvisor' AND scraped_at IS NOT NULL AND date(scraped_at) < ?"
  ).run(today);
  if (raResult.changes > 0) {
    console.log(`[blobSync] Pruned ${raResult.changes} stale Resident Advisor event(s) scraped before ${today}`);
  }

  return { cityPruned: cityResult.changes, raPruned: raResult.changes };
}

/**
 * Serialise future/current events from SQLite and upload to Vercel Blob.
 * Past events (date < today) are excluded from the upload.
 * No-op if BLOB_READ_WRITE_TOKEN is not configured.
 * Errors are caught and logged so the scrape response is never affected.
 *
 * @param {import('better-sqlite3').Database} db
 */
async function saveEventsToBlob(db) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn('[blobSync] BLOB_READ_WRITE_TOKEN not set – skipping Blob save');
    return;
  }
  try {
    const today = todayStr();
    const events = db.prepare(
      "SELECT * FROM events WHERE date IS NULL OR date >= ?"
    ).all(today);
    const json = JSON.stringify(events);
    await put(BLOB_PATHNAME, json, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    console.log(`[blobSync] Saved ${events.length} events to Blob`);
  } catch (err) {
    console.error('[blobSync] saveEventsToBlob failed:', err.message);
  }
}

/**
 * Download events JSON from Vercel Blob and upsert into the local SQLite DB.
 * Runs only when the local DB is empty (cold-start recovery).
 * No-op if BLOB_READ_WRITE_TOKEN is not configured or no blob exists yet.
 * Errors are caught and logged – the app continues with whatever data is in SQLite.
 *
 * @param {import('better-sqlite3').Database} db
 */
async function hydrateFromBlob(db) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn('[blobSync] BLOB_READ_WRITE_TOKEN not set – skipping Blob hydration');
    return;
  }
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM events').get();
    if (row.count > 0) {
      console.log(`[blobSync] Local DB already has ${row.count} events – skipping hydration`);
      return;
    }

    const { blobs } = await list({ prefix: BLOB_PATHNAME });
    if (!blobs || blobs.length === 0) {
      console.log('[blobSync] No persisted events found in Blob – first run');
      return;
    }

    const response = await axios.get(blobs[0].url);
    let events = response.data;
    if (!Array.isArray(events)) {
      throw new Error('Blob data is not an array');
    }

    // Drop past events that may have been stored before this guard was added
    const today = todayStr();
    events = events.filter((ev) => !ev.date || ev.date >= today);

    const stmt = db.prepare(`
      INSERT INTO events
        (source, source_id, title, artist, venue, city, date, time,
         price_min, price_max, price_text, genre, genres, ticket_url, image_url,
         description, scraped_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
      ON CONFLICT(source, source_id) DO UPDATE SET
        title       = excluded.title,
        artist      = excluded.artist,
        venue       = excluded.venue,
        city        = excluded.city,
        date        = excluded.date,
        time        = excluded.time,
        price_min   = excluded.price_min,
        price_max   = excluded.price_max,
        price_text  = excluded.price_text,
        genre       = excluded.genre,
        genres      = excluded.genres,
        ticket_url  = excluded.ticket_url,
        image_url   = excluded.image_url,
        description = excluded.description
    `);

    const upsertMany = db.transaction((evts) => {
      let inserted = 0;
      for (const ev of evts) {
        if (!ev.source_id) continue;
        stmt.run(
          ev.source,
          ev.source_id,
          ev.title,
          ev.artist || null,
          ev.venue,
          ev.city || 'Vancouver',
          ev.date || null,
          ev.time || null,
          ev.price_min ?? null,
          ev.price_max ?? null,
          ev.price_text || null,
          ev.genre || null,
          ev.genres || null,
          ev.ticket_url || null,
          ev.image_url || null,
          ev.description || null,
          ev.scraped_at || null,
        );
        inserted++;
      }
      return inserted;
    });

    const total = upsertMany(events);
    console.log(`[blobSync] Hydration complete – upserted ${total} events from Blob`);
  } catch (err) {
    console.error('[blobSync] hydrateFromBlob failed:', err.message);
  }
}

module.exports = { saveEventsToBlob, hydrateFromBlob, prunePastEvents, pruneNonVancouverEvents, todayStr };
