'use strict';

const pdfParse = require('pdf-parse');
const { detectGenre, parseDate } = require('../scrapers/base');
const SCRAPERS = require('../scrapers');

/**
 * Map of hostname substrings → scraper key.
 * Checked in order; first match wins.
 */
const HOSTNAME_TO_SOURCE = [
  ['thisisblueprint.com', 'thisisblueprint'],
  ['blueprintevents.ca', 'blueprint'],
  ['ticketmaster.com', 'ticketmaster'],
  ['ticketmaster.ca', 'ticketmaster'],
  ['celebritiesnightclub.com', 'celebrities'],
  ['redroom.ca', 'redroom'],
  ['fortunesoundclub.com', 'fortune'],
  ['industrial236.com', 'industrial236'],
  ['ra.co', 'residentadvisor'],
  ['residentadvisor.net', 'residentadvisor'],
];

/**
 * Known Vancouver venue slugs that appear in event URL paths.
 * Longer slugs must come first so they take priority over shorter overlapping ones.
 */
const VENUE_SLUGS = [
  ['queen-elizabeth-theatre', 'Queen Elizabeth Theatre'],
  ['commodore-ballroom', 'Commodore Ballroom'],
  ['fortune-sound-club', 'Fortune Sound Club'],
  ['pacific-coliseum', 'Pacific Coliseum'],
  ['rickshaw-theatre', 'Rickshaw Theatre'],
  ['venue-nightclub', 'Venue Nightclub'],
  ['temple-nightclub', 'Temple Nightclub'],
  ['rogers-arena', 'Rogers Arena'],
  ['vogue-theatre', 'Vogue Theatre'],
  ['industrial-236', 'Industrial 236'],
  ['pne-forum', 'PNE Forum'],
  ['commodore', 'Commodore Ballroom'],
  ['red-room', 'Red Room'],
  ['celebrities', 'Celebrities Nightclub'],
  ['rickshaw', 'Rickshaw Theatre'],
  ['orpheum', 'Orpheum Theatre'],
  ['media-club', 'Media Club'],
  ['bar-none', 'Bar None'],
  ['junction', 'The Junction'],
];

/**
 * Known Vancouver venue name patterns (for PDF text scanning).
 */
const VENUE_TEXT_PATTERNS = [
  [/pne\s+forum/i, 'PNE Forum'],
  [/commodore\s+ballroom/i, 'Commodore Ballroom'],
  [/rogers\s+arena/i, 'Rogers Arena'],
  [/vogue\s+theatre/i, 'Vogue Theatre'],
  [/rickshaw\s+theatre/i, 'Rickshaw Theatre'],
  [/fortune\s+sound/i, 'Fortune Sound Club'],
  [/red\s+room/i, 'Red Room'],
  [/celebrities\s+nightclub/i, 'Celebrities Nightclub'],
  [/industrial\s+236/i, 'Industrial 236'],
  [/queen\s+elizabeth\s+theatre/i, 'Queen Elizabeth Theatre'],
  [/orpheum\s+theatre/i, 'Orpheum Theatre'],
  [/pacific\s+coliseum/i, 'Pacific Coliseum'],
  [/venue\s+nightclub/i, 'Venue Nightclub'],
  [/media\s+club/i, 'Media Club'],
];

/**
 * Return the scraper source key for the given URL, or null if unknown.
 * @param {string} urlStr
 * @returns {string|null}
 */
function detectSourceFromUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const [host, source] of HOSTNAME_TO_SOURCE) {
      if (hostname === host || hostname.endsWith('.' + host)) return source;
    }
  } catch {
    // Invalid URL — ignore
  }
  return null;
}

/**
 * Extract date, title, and venue from a URL string using slug parsing.
 * Used as a fallback when live scraping does not yield complete details.
 *
 * Example:
 *   https://thisisblueprint.com/events/foundation-v13-5-disclosure-pne-forum-2026-04-18
 *   → { date: '2026-04-18', venue: 'PNE Forum', title: 'Foundation V13 5 Disclosure' }
 *
 * @param {string} urlStr
 * @returns {{ title: string|null, date: string|null, venue: string|null }}
 */
function parseEventDetailsFromUrl(urlStr) {
  let date = null;
  let venue = null;
  let title = null;

  try {
    const url = new URL(urlStr);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const slug = pathParts[pathParts.length - 1] || '';

    // 1. Extract YYYY-MM-DD from anywhere in the slug
    const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) date = dateMatch[1];

    // 2. Remove the date suffix to isolate the title+venue portion
    let remainder = slug.replace(/-?\d{4}-\d{2}-\d{2}$/, '').replace(/^-+|-+$/g, '');

    // 3. Detect known venue slug substrings (longest first)
    for (const [vSlug, vName] of VENUE_SLUGS) {
      // Match the venue slug as a complete hyphen-delimited segment
      const venueRe = new RegExp(`(^|-)(${vSlug})(-|$)`);
      if (venueRe.test(remainder)) {
        venue = vName;
        remainder = remainder.replace(venueRe, '$1').replace(/^-+|-+$/g, '');
        break;
      }
    }

    // 4. Convert remaining slug to a human-readable title
    if (remainder) {
      title = remainder
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
    }
  } catch {
    // Invalid URL — return nulls
  }

  return { title, date, venue };
}

/**
 * Scrape event details from a single event URL using the appropriate scraper,
 * falling back to URL slug parsing when the scraper yields no results or
 * returns an event that is missing date / venue information.
 *
 * @param {string} url
 * @returns {Promise<object|null>} Partial event object ready for DB insertion, or null
 */
async function scrapeEventFromUrl(url) {
  const source = detectSourceFromUrl(url);
  const urlDetails = parseEventDetailsFromUrl(url);

  let scrapedEvent = null;

  if (source && SCRAPERS[source]) {
    try {
      const events = await SCRAPERS[source].scrape(url);
      if (events.length > 0) {
        scrapedEvent = events[0];
      }
    } catch (err) {
      console.warn(`[eventSubmission] Scraping ${source} failed for ${url}:`, err.message);
    }
  }

  if (scrapedEvent) {
    // Merge URL-parsed details for any missing fields
    return {
      ...scrapedEvent,
      date: scrapedEvent.date || urlDetails.date,
      venue: scrapedEvent.venue || urlDetails.venue || 'Unknown Venue',
      title: scrapedEvent.title || urlDetails.title || url,
    };
  }

  // Build event entirely from URL parsing when scraping found nothing
  if (urlDetails.title || urlDetails.date) {
    return {
      source: source || 'manual',
      source_id: url,
      title: urlDetails.title || url,
      artist: urlDetails.title || null,
      venue: urlDetails.venue || 'Unknown Venue',
      city: 'Vancouver',
      date: urlDetails.date,
      time: null,
      price_min: null,
      price_max: null,
      price_text: null,
      genre: detectGenre(urlDetails.title || ''),
      ticket_url: url,
      image_url: null,
      description: null,
    };
  }

  return null;
}

/**
 * Parse event details from a PDF buffer using pdf-parse for text extraction.
 * Returns a partial event object when recognisable details are found, or null
 * when the document contains no usable event information.
 *
 * @param {Buffer} buffer
 * @returns {Promise<object|null>}
 */
async function parseEventFromPdf(buffer) {
  let text;
  try {
    const data = await pdfParse(buffer);
    text = data.text || '';
  } catch (err) {
    console.warn('[eventSubmission] PDF parse error:', err.message);
    return null;
  }

  if (!text.trim()) return null;

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const fullText = lines.join(' ');

  // --- Date extraction ---
  let date = null;

  // ISO format: 2026-04-18
  const isoMatch = fullText.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    date = isoMatch[1];
  }

  // Human-readable: "April 18, 2026" / "Apr 18 2026"
  if (!date) {
    const humanMatch = fullText.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/i
    );
    if (humanMatch) {
      date = parseDate(humanMatch[0]);
    }
  }

  // --- Venue extraction ---
  let venue = null;
  for (const [pattern, name] of VENUE_TEXT_PATTERNS) {
    if (pattern.test(fullText)) {
      venue = name;
      break;
    }
  }

  // --- Title: first substantial line ---
  const title = lines.find((l) => l.length >= 3) || null;

  if (!title) return null;

  return {
    source: 'manual',
    source_id: null,
    title,
    artist: title,
    venue: venue || 'Unknown Venue',
    city: 'Vancouver',
    date,
    time: null,
    price_min: null,
    price_max: null,
    price_text: null,
    genre: detectGenre(fullText),
    ticket_url: null,
    image_url: null,
    description: lines.slice(1, 5).join(' ').slice(0, 500) || null,
  };
}

module.exports = {
  detectSourceFromUrl,
  parseEventDetailsFromUrl,
  scrapeEventFromUrl,
  parseEventFromPdf,
};
