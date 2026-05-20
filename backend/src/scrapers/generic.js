/**
 * Generic event scraper for user-submitted URLs.
 *
 * Extraction strategy (priority order — each step fills gaps from the previous):
 *   1. JSON-LD  — schema.org Event / MusicEvent structured data
 *   2. Open Graph meta tags
 *   3. HTML heuristics (h1, datetime attributes, first large image)
 *
 * Returns an array with one event object (never saves to DB).
 */
const { fetchPage, detectGenre, parseDate } = require('./base');

const SOURCE = 'user_submitted';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the time portion from an ISO datetime string.
 * "2026-06-15T20:00:00-07:00" → "20:00"
 */
function extractTime(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

/**
 * Coerce a JSON-LD value that may be a string, object with .name, or array
 * into a plain string (or null).
 */
function strOf(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.trim() || null;
  if (Array.isArray(val)) return strOf(val[0]);
  if (typeof val === 'object') return strOf(val.name || val['@id'] || val.url);
  return null;
}

/**
 * Turn a schema.org Offer (or array of Offers) into a price_text string.
 */
function normOffer(offers) {
  if (!offers) return null;
  const o = Array.isArray(offers) ? offers[0] : offers;
  if (!o || typeof o !== 'object') return null;
  const price = o.price ?? o.lowPrice;
  if (price == null) return null;
  const currency = o.priceCurrency || 'CAD';
  return `${currency} $${price}`;
}

// ---------------------------------------------------------------------------
// Extraction steps
// ---------------------------------------------------------------------------

/**
 * Merge a schema.org Event JSON-LD entry into the running event object.
 */
function mergeJsonLd(event, entry) {
  const title = strOf(entry.name);
  const venue = strOf(entry.location?.name) || strOf(entry.location);
  const city = strOf(entry.location?.address?.addressLocality);
  const startDate = strOf(entry.startDate);
  const performer = Array.isArray(entry.performer) ? entry.performer[0] : entry.performer;
  const artist = strOf(performer?.name || performer);
  const rawImage = Array.isArray(entry.image) ? entry.image[0] : entry.image;
  const imageUrl = typeof rawImage === 'object' ? strOf(rawImage?.url || rawImage) : strOf(rawImage);
  const description = strOf(entry.description);
  const ticketUrl = strOf(entry.url);
  const priceText = normOffer(entry.offers);

  return {
    ...event,
    title: title || event.title,
    venue: venue || event.venue,
    city: city || event.city,
    date: startDate ? (parseDate(startDate) || event.date) : event.date,
    time: startDate ? (extractTime(startDate) || event.time) : event.time,
    artist: artist || event.artist,
    image_url: imageUrl || event.image_url,
    description: description || event.description,
    ticket_url: ticketUrl || event.ticket_url,
    price_text: priceText || event.price_text,
  };
}

/**
 * Fill gaps in the event object using Open Graph meta tags.
 */
function mergeOpenGraph(event, $) {
  const get = (property) =>
    $(`meta[property="${property}"]`).attr('content') ||
    $(`meta[name="${property}"]`).attr('content') ||
    null;

  return {
    ...event,
    title: event.title || get('og:title'),
    description: event.description || get('og:description'),
    image_url: event.image_url || get('og:image'),
  };
}

/**
 * Last-resort fallbacks using basic HTML selectors and datetime attributes.
 */
function mergeHeuristics(event, $) {
  // Title: h1 → <title>
  const h1 = $('h1').first().text().trim() || null;
  const title = event.title || h1 || $('title').text().trim() || null;

  // Date: elements with datetime or data-date attributes
  let date = event.date;
  if (!date) {
    $('[datetime], [data-date]').each((_i, el) => {
      const attr =
        $(el).attr('datetime') || $(el).attr('data-date');
      const parsed = parseDate(attr || '');
      if (parsed) {
        date = parsed;
        return false; // break
      }
    });
  }

  // Image: first <img> that looks meaningfully sized
  let imageUrl = event.image_url;
  if (!imageUrl) {
    $('img').each((_i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      const w = parseInt($(el).attr('width') || '0', 10);
      const h = parseInt($(el).attr('height') || '0', 10);
      if (src && src.startsWith('http') && (w > 100 || h > 100)) {
        imageUrl = src;
        return false; // break
      }
    });
  }

  return {
    ...event,
    title,
    date: date || event.date,
    image_url: imageUrl,
  };
}

// ---------------------------------------------------------------------------
// Main scrape function
// ---------------------------------------------------------------------------

/**
 * Scrape a single event page and return a best-effort event object.
 * @param {string} url
 * @returns {Promise<Array>} Array containing one event object
 */
async function scrape(url) {
  const { $ } = await fetchPage(url);

  let event = {
    source: SOURCE,
    source_id: url.slice(0, 500),
    title: null,
    artist: null,
    venue: null,
    city: 'Vancouver',
    date: null,
    time: null,
    price_min: null,
    price_max: null,
    price_text: null,
    genre: null,
    genres: null,
    ticket_url: url,
    image_url: null,
    description: null,
  };

  // Step 1: JSON-LD — find first schema.org Event or MusicEvent
  let foundJsonLd = false;
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (foundJsonLd) return;
    try {
      const raw = $(el).html() || '{}';
      const data = JSON.parse(raw);

      // Flatten: handle @graph arrays and top-level arrays
      const entries = [];
      if (Array.isArray(data)) {
        entries.push(...data);
      } else if (data['@graph']) {
        entries.push(...(Array.isArray(data['@graph']) ? data['@graph'] : [data['@graph']]));
      } else {
        entries.push(data);
      }

      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const type = entry['@type'];
        if (type === 'Event' || type === 'MusicEvent') {
          event = mergeJsonLd(event, entry);
          foundJsonLd = true;
          break;
        }
      }
    } catch {
      // Invalid JSON-LD — skip silently
    }
  });

  // Step 2: Open Graph
  event = mergeOpenGraph(event, $);

  // Step 3: HTML heuristics
  event = mergeHeuristics(event, $);

  // Genre detection from available text signals
  if (!event.genre) {
    const text = [event.title, event.description, event.artist]
      .filter(Boolean)
      .join(' ');
    event.genre = detectGenre(text);
  }

  return [event];
}

module.exports = { scrape, SOURCE };
