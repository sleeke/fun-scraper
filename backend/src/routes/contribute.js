'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const cheerio = require('cheerio');
const { getDb } = require('../db/schema');
const { detectGenre, parsePrice } = require('../scrapers/base');

// Memory storage — no disk writes required
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_VALID_YEAR = 2020;
const MAX_VALID_YEAR = 2099;
const MIN_PDF_TEXT_LENGTH = 10;
const MAX_FILE_UPLOADS = 5;
const MAX_URL_SUBMISSIONS = 10;

/** Regex that matches common date patterns in free-form text. */
const EVENT_DATE_PATTERN =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/i;

/** Regex to strip leading punctuation separators from a title remainder. */
const LEADING_SEPARATOR_PATTERN = /^\s*[-|:–—]\s*/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic source_id by base64-encoding a key string.
 * @param {string} prefix  - 'url' or 'file'
 * @param {string} key     - unique string for this event
 * @returns {string}
 */
function makeSourceId(prefix, key) {
  return `${prefix}-${Buffer.from(key).toString('base64').slice(0, 40)}`;
}

/**
 * Parse a date string to YYYY-MM-DD, accepting years MIN_VALID_YEAR–MAX_VALID_YEAR.
 * More permissive than the shared parseDate from base.js.
 */
function parseDatePermissive(text) {
  if (!text) return null;
  const clean = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(clean)) return clean.slice(0, 10);
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    if (y >= MIN_VALID_YEAR && y <= MAX_VALID_YEAR) {
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  return null;
}

/**
 * Extract events from a loaded cheerio document.
 * Tries JSON-LD structured data first, then Open Graph / heuristics.
 */
function extractEventsFromHtml($, pageUrl) {
  const events = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try { data = JSON.parse($(el).html()); } catch { return; }

    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (item['@type'] !== 'Event' && item['@type'] !== 'MusicEvent') continue;

      const startDate = item.startDate ? parseDate(item.startDate) : null;
      const startTime =
        item.startDate && item.startDate.length > 10
          ? item.startDate.slice(11, 16)
          : null;

      let priceText = null;
      if (item.offers) {
        const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        if (offers?.price != null) {
          priceText = `${offers.priceCurrency || ''}${offers.price}`.trim();
        }
      }
      const { priceMin, priceMax } = priceText ? parsePrice(priceText) : {};

      const venueName =
        (typeof item.location === 'string'
          ? item.location
          : item.location?.name) || 'Unknown Venue';

      const imageUrl =
        typeof item.image === 'string'
          ? item.image
          : item.image?.url || null;

      const performer = Array.isArray(item.performer)
        ? item.performer[0]?.name
        : item.performer?.name;

      events.push({
        source: 'contributed',
        source_id: makeSourceId('url', pageUrl + (item.name || '')),
        title: (item.name || 'Untitled Event').slice(0, 255),
        artist: performer || null,
        venue: venueName.slice(0, 255),
        city: 'Vancouver',
        date: startDate,
        time: startTime,
        price_min: priceMin ?? null,
        price_max: priceMax ?? null,
        price_text: priceText,
        ticket_url: item.url || pageUrl,
        image_url: imageUrl,
        description: item.description ? String(item.description).slice(0, 1000) : null,
        genre: detectGenre(`${item.name || ''} ${item.description || ''}`),
      });
    }
  });

  if (events.length > 0) return events;

  // Fallback: Open Graph meta + page title
  const ogTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="title"]').attr('content');
  const ogDescription =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  const title = (ogTitle || $('h1').first().text()).trim();

  if (title) {
    events.push({
      source: 'contributed',
      source_id: makeSourceId('url', pageUrl),
      title: title.slice(0, 255),
      artist: null,
      venue: 'Unknown Venue',
      city: 'Vancouver',
      date: null,
      time: null,
      price_min: null,
      price_max: null,
      price_text: null,
      ticket_url: pageUrl,
      image_url: ogImage || null,
      description: ogDescription ? ogDescription.slice(0, 1000) : null,
      genre: detectGenre(`${title} ${ogDescription || ''}`),
    });
  }

  return events;
}

/**
 * Heuristic parser: extract one or more events from a plain-text string.
 */
function parseEventsFromText(text, sourceRef) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const events = [];
  let cur = null;

  const pushCur = () => {
    if (cur && cur.title) events.push(cur);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(EVENT_DATE_PATTERN);

    if (dateMatch) {
      pushCur();
      const parsedDate = parseDatePermissive(dateMatch[0]);
      // Strip the date from the line and clean up leading separators (-, |, :)
      const rawTitle = line.replace(dateMatch[0], '').replace(LEADING_SEPARATOR_PATTERN, '').trim();
      const titleLine = rawTitle || lines[i + 1] || 'Untitled Event';
      cur = {
        source: 'contributed',
        source_id: makeSourceId('file', sourceRef + String(i)),
        title: titleLine.slice(0, 255),
        artist: null,
        venue: 'Unknown Venue',
        city: 'Vancouver',
        date: parsedDate,
        time: null,
        price_min: null,
        price_max: null,
        price_text: null,
        ticket_url: null,
        image_url: null,
        description: null,
        genre: null,
      };
      continue;
    }

    if (!cur) continue;

    // Try to enrich current event
    const priceMatch = line.match(/\$[\d]+(?:[.,]\d{1,2})?|\bfree\b/i);
    if (priceMatch && !cur.price_text) {
      const { priceMin, priceMax, priceText } = parsePrice(priceMatch[0]);
      cur.price_min = priceMin;
      cur.price_max = priceMax;
      cur.price_text = priceText;
      continue;
    }

    const timeMatch = line.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i);
    if (timeMatch && !cur.time) {
      cur.time = timeMatch[0];
      continue;
    }

    // "at Venue Name" pattern
    const venueMatch = line.match(/^at\s+(.+)/i);
    if (venueMatch && cur.venue === 'Unknown Venue') {
      cur.venue = venueMatch[1].slice(0, 255);
      continue;
    }

    // Accumulate into description
    if (line.length > 3) {
      cur.description = ((cur.description || '') + ' ' + line).trim().slice(0, 1000);
      // Auto-detect genre from accumulated text
      if (!cur.genre) cur.genre = detectGenre(line);
    }
  }

  pushCur();
  return events.filter((ev) => ev.date || (ev.title && ev.title !== 'Untitled Event'));
}

/**
 * Upsert events into the database.
 * Returns an array of saved event rows.
 */
function saveEvents(events) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO events
      (source, source_id, title, artist, venue, city, date, time,
       price_min, price_max, price_text, genre, ticket_url, image_url, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_id) DO UPDATE SET
      title       = excluded.title,
      artist      = excluded.artist,
      venue       = excluded.venue,
      date        = excluded.date,
      time        = excluded.time,
      price_text  = excluded.price_text,
      ticket_url  = excluded.ticket_url,
      image_url   = excluded.image_url,
      description = excluded.description
  `);

  const saved = [];
  const tx = db.transaction((evts) => {
    for (const ev of evts) {
      const info = stmt.run(
        ev.source, ev.source_id, ev.title, ev.artist || null,
        ev.venue, ev.city || 'Vancouver', ev.date || null, ev.time || null,
        ev.price_min ?? null, ev.price_max ?? null, ev.price_text || null,
        ev.genre || null, ev.ticket_url || null, ev.image_url || null,
        ev.description || null
      );
      const id =
        info.lastInsertRowid ||
        db
          .prepare('SELECT id FROM events WHERE source = ? AND source_id = ?')
          .get(ev.source, ev.source_id)?.id;
      if (id) saved.push(db.prepare('SELECT * FROM events WHERE id = ?').get(id));
    }
  });
  tx(events);
  return saved;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/contribute/form
 * Create a single event via JSON body.
 * Accepts: { title, venue, artist, city, date, time, price_text,
 *             genre, ticket_url, image_url, description }
 * The frontend handles any image-file-to-data-URL conversion before posting.
 */
router.post('/form', (req, res) => {
  const {
    title, venue, artist, city, date, time,
    price_text, genre, ticket_url, image_url, description,
  } = req.body;

  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!venue || !String(venue).trim()) {
    return res.status(400).json({ error: 'venue is required' });
  }

  const { priceMin, priceMax } = price_text ? parsePrice(price_text) : {};
  const normalizedDate = date ? parseDate(date) : null;
  const autoGenre = genre || detectGenre(`${title} ${description || ''}`);

  const db = getDb();
  try {
    const info = db.prepare(`
      INSERT INTO events
        (source, title, artist, venue, city, date, time,
         price_min, price_max, price_text, genre, ticket_url, image_url, description)
      VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(title).trim(),
      artist ? String(artist).trim() : null,
      String(venue).trim(),
      city ? String(city).trim() : 'Vancouver',
      normalizedDate,
      time ? String(time).trim() : null,
      priceMin ?? null,
      priceMax ?? null,
      price_text ? String(price_text).trim() : null,
      autoGenre,
      ticket_url ? String(ticket_url).trim() : null,
      image_url ? String(image_url).trim() : null,
      description ? String(description).trim() : null
    );
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json(event);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A very similar event already exists' });
    }
    throw err;
  }
});

/**
 * POST /api/contribute/url
 * Fetch one or more URLs and extract events from them.
 * Body: { urls: string[] }
 */
router.post('/url', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls must be a non-empty array' });
  }

  const results = [];
  for (const rawUrl of urls.slice(0, MAX_URL_SUBMISSIONS)) {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!url || !/^https?:\/\//i.test(url)) {
      results.push({ url: rawUrl, events: [], error: 'Invalid URL — must start with http:// or https://' });
      continue;
    }

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; fun-scraper/1.0; +https://github.com/sleeke/fun-scraper)',
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        timeout: 15000,
        maxContentLength: 5 * 1024 * 1024,
      });

      const $ = cheerio.load(response.data);
      const extracted = extractEventsFromHtml($, url);

      if (extracted.length === 0) {
        results.push({ url, events: [], error: 'No event information found on this page' });
        continue;
      }

      const saved = saveEvents(extracted);
      results.push({ url, events: saved });
    } catch (err) {
      const msg = err.response
        ? `HTTP ${err.response.status} — could not load page`
        : err.code === 'ENOTFOUND'
        ? 'Host not found — check the URL'
        : err.code === 'ETIMEDOUT' || /timeout/i.test(err.message)
        ? 'Request timed out — site too slow or not accessible'
        : err.message || 'Failed to fetch URL';
      results.push({ url, events: [], error: msg });
    }
  }

  res.json({ results });
});

/**
 * POST /api/contribute/file
 * Extract events from uploaded files (PDF, plain text).
 * Accepts: multipart/form-data with field "files" (multiple allowed).
 */
router.post('/file', upload.array('files', MAX_FILE_UPLOADS), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const results = [];

  for (const file of req.files) {
    const filename = file.originalname;
    const isPdf =
      file.mimetype === 'application/pdf' ||
      filename.toLowerCase().endsWith('.pdf');
    const isTxt =
      file.mimetype === 'text/plain' ||
      filename.toLowerCase().endsWith('.txt');

    if (isPdf) {
      try {
        const data = await pdfParse(file.buffer);
        const text = data.text || '';

        if (text.trim().length < MIN_PDF_TEXT_LENGTH) {
          results.push({
            filename,
            events: [],
            error:
              'Could not extract text from this PDF. It may be a scanned image without selectable text.',
          });
          continue;
        }

        const extracted = parseEventsFromText(text, filename);
        if (extracted.length === 0) {
          results.push({
            filename,
            events: [],
            error:
              'No events could be identified in this document. Try using the form to enter event details manually.',
          });
          continue;
        }

        results.push({ filename, events: saveEvents(extracted) });
      } catch (err) {
        results.push({
          filename,
          events: [],
          error: `Failed to parse PDF: ${err.message}`,
        });
      }
    } else if (isTxt) {
      const text = file.buffer.toString('utf-8');
      const extracted = parseEventsFromText(text, filename);
      if (extracted.length === 0) {
        results.push({
          filename,
          events: [],
          error: 'No events could be identified in this file.',
        });
        continue;
      }
      results.push({ filename, events: saveEvents(extracted) });
    } else {
      results.push({
        filename,
        events: [],
        error: `Unsupported file type "${file.mimetype}". Please upload a PDF (.pdf) or plain-text (.txt) file.`,
      });
    }
  }

  res.json({ results });
});

module.exports = router;
