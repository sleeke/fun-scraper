/**
 * Scraper for StubHub Canada events in Vancouver, Squamish, and Whistler.
 * Scrapes the StubHub Canada website for concert listings, looking for
 * embedded JSON data (server-side props) and falling back to DOM parsing.
 */
const { fetchPage, detectGenre, parsePrice, parseDate } = require('./base');

const SOURCE = 'stubhub';
const DEFAULT_URL = 'https://www.stubhub.ca/secure/Search?q=Vancouver';
const BASE_URL = 'https://www.stubhub.ca';

// StubHub city search URLs for the target cities
const CITY_URLS = [
  { city: 'Vancouver', url: 'https://www.stubhub.ca/secure/Search?q=Vancouver' },
  { city: 'Squamish', url: 'https://www.stubhub.ca/secure/Search?q=Squamish' },
  { city: 'Whistler', url: 'https://www.stubhub.ca/secure/Search?q=Whistler' },
];

/**
 * Try to extract events from a JSON blob embedded in the HTML page.
 * StubHub server-renders its React pages and injects data into window.__SERVER_DATA__
 * or similar script tags, or uses Next.js __NEXT_DATA__.
 */
function extractFromJson(html, city) {
  const events = [];

  // Try __NEXT_DATA__
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps = nextData?.props?.pageProps || {};
      const rawEvents =
        pageProps?.events ||
        pageProps?.data?.events ||
        pageProps?.listings ||
        pageProps?.items ||
        [];

      for (const ev of rawEvents) {
        const mapped = mapJsonEvent(ev, city);
        if (mapped) events.push(mapped);
      }
      if (events.length > 0) return events;
    } catch (_e) {
      // ignore parse errors
    }
  }

  // Try window.__SERVER_DATA__ or similar patterns
  const serverDataPatterns = [
    /window\.__SERVER_DATA__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/,
    /window\.__data\s*=\s*(\{[\s\S]*?\});\s*<\/script>/,
    /__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/,
  ];

  for (const pattern of serverDataPatterns) {
    const match = html.match(pattern);
    if (!match) continue;
    try {
      const data = JSON.parse(match[1]);
      // Walk the object looking for arrays that look like event listings
      const candidates = findEventArrays(data);
      for (const arr of candidates) {
        for (const item of arr) {
          const mapped = mapJsonEvent(item, city);
          if (mapped) events.push(mapped);
        }
      }
      if (events.length > 0) return events;
    } catch (_e) {
      // ignore
    }
  }

  return events;
}

/**
 * Heuristic: walk a JSON object and return arrays that look like event listings.
 */
function findEventArrays(obj, depth = 0) {
  if (depth > 6 || !obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) {
    if (
      obj.length > 0 &&
      typeof obj[0] === 'object' &&
      (obj[0].name || obj[0].title || obj[0].eventId || obj[0].id)
    ) {
      return [obj];
    }
  }
  const results = [];
  for (const val of Object.values(obj)) {
    results.push(...findEventArrays(val, depth + 1));
  }
  return results;
}

/**
 * Map a raw JSON event object (from various StubHub data shapes) to canonical shape.
 */
function mapJsonEvent(ev, defaultCity) {
  if (!ev || typeof ev !== 'object') return null;

  const title = ev.name || ev.title || ev.eventName || '';
  if (!title || title.length < 2) return null;

  const id = String(ev.id || ev.eventId || ev.stubhubId || title);
  const venue = ev.venue?.name || ev.venueName || 'StubHub Venue';
  const city = ev.venue?.city || ev.city || defaultCity;

  const rawDate = ev.date || ev.eventDate || ev.dates?.start?.localDate || ev.startDate || null;
  const date = parseDate(rawDate);
  const time = ev.time || ev.dates?.start?.localTime || null;

  const priceText = ev.price
    ? `$${ev.price}`
    : ev.priceRange
    ? ev.priceRange
    : ev.minPrice
    ? `$${ev.minPrice}${ev.maxPrice && ev.maxPrice !== ev.minPrice ? ` - $${ev.maxPrice}` : ''}`
    : null;
  const { priceMin, priceMax } = parsePrice(priceText);

  const href = ev.url || ev.eventUrl || ev.link || null;
  const ticketUrl = href
    ? href.startsWith('http')
      ? href
      : `${BASE_URL}${href}`
    : null;

  const imageUrl = ev.image || ev.imageUrl || ev.images?.[0]?.url || null;
  const genre = detectGenre(`${title} ${ev.category || ev.genre || ev.classification || ''}`);

  return {
    source: SOURCE,
    source_id: id,
    title,
    artist: title,
    venue,
    city,
    date,
    time,
    price_min: priceMin,
    price_max: priceMax,
    price_text: priceText,
    genre,
    ticket_url: ticketUrl,
    image_url: imageUrl,
    description: ev.description || null,
  };
}

/**
 * DOM-based fallback: parse visible event cards on the page.
 */
function extractFromDom($, city) {
  const events = [];

  // StubHub event listing selectors (various layouts over the years)
  const selectors = [
    '[data-testid*="event"]',
    '[class*="EventListing"]',
    '[class*="event-listing"]',
    '[class*="EventCard"]',
    '[class*="event-card"]',
    '.event-item',
    'article',
    'li[class*="event"]',
  ];

  for (const sel of selectors) {
    if ($(sel).length === 0) continue;

    $(sel).each((_i, el) => {
      const $el = $(el);
      const title = $el
        .find('h2, h3, h4, [class*="title"], [class*="name"], [data-testid*="title"]')
        .first()
        .text()
        .trim();
      if (!title || title.length < 2) return;

      const href = $el.find('a').first().attr('href');
      const ticketUrl = href
        ? href.startsWith('http')
          ? href
          : `${BASE_URL}${href}`
        : null;

      const dateText = $el.find('time, [class*="date"], [data-testid*="date"]').first().text().trim() || null;
      const venueName = $el.find('[class*="venue"], [data-testid*="venue"]').first().text().trim() || 'StubHub Venue';
      const priceText = $el.find('[class*="price"], [data-testid*="price"]').first().text().trim() || null;
      const { priceMin, priceMax } = parsePrice(priceText);
      const imageUrl = $el.find('img').first().attr('src') || null;

      events.push({
        source: SOURCE,
        source_id: ticketUrl || title,
        title,
        artist: title,
        venue: venueName,
        city,
        date: parseDate(dateText),
        time: null,
        price_min: priceMin,
        price_max: priceMax,
        price_text: priceText,
        genre: detectGenre(title),
        ticket_url: ticketUrl,
        image_url: imageUrl,
        description: null,
      });
    });

    if (events.length > 0) break;
  }

  // Final fallback: any link that looks like an event page
  if (events.length === 0) {
    $('a[href*="/concert"], a[href*="/event"], a[href*="/tickets"]').each((_i, el) => {
      const $el = $(el);
      const title = $el.text().trim();
      const href = $el.attr('href');
      if (!title || title.length < 3 || !href) return;
      const ticketUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      events.push({
        source: SOURCE,
        source_id: ticketUrl,
        title,
        artist: title,
        venue: 'StubHub Venue',
        city,
        date: null,
        time: null,
        price_min: null,
        price_max: null,
        price_text: null,
        genre: detectGenre(title),
        ticket_url: ticketUrl,
        image_url: null,
        description: null,
      });
    });
  }

  return events;
}

/**
 * Scrape one city URL and return a list of canonical events.
 */
async function scrapeCity({ city, url }) {
  try {
    const { $, html } = await fetchPage(url);

    // Try embedded JSON first (more reliable)
    const jsonEvents = extractFromJson(html, city);
    if (jsonEvents.length > 0) return jsonEvents;

    // Fall back to DOM parsing
    return extractFromDom($, city);
  } catch (err) {
    console.warn(`[stubhub] Failed to scrape ${city} (${url}):`, err.message);
    return [];
  }
}

async function scrape(url = DEFAULT_URL) {
  const allEvents = [];
  const seenIds = new Set();

  // If a custom URL was provided, scrape only that
  if (url !== DEFAULT_URL) {
    const events = await scrapeCity({ city: 'Vancouver', url });
    return events;
  }

  for (const cityConfig of CITY_URLS) {
    const events = await scrapeCity(cityConfig);
    for (const ev of events) {
      if (!ev.source_id || seenIds.has(ev.source_id)) continue;
      seenIds.add(ev.source_id);
      allEvents.push(ev);
    }
  }

  return allEvents;
}

module.exports = { scrape, SOURCE, DEFAULT_URL };
