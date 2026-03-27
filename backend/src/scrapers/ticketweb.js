/**
 * Scraper for TicketWeb Canada events in Vancouver, Squamish, and Whistler.
 * Scrapes the TicketWeb Canada website as the primary source; also queries the
 * Ticketmaster Discovery API (source=ticketweb) when TICKETMASTER_API_KEY is set.
 */
const axios = require('axios');
const { fetchPage, detectGenre, parsePrice, parseDate } = require('./base');

const SOURCE = 'ticketweb';
const DEFAULT_URL = 'https://www.ticketweb.ca/events';
const TM_API_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
const TICKETWEB_SITE = 'https://www.ticketweb.ca';
const API_KEY = process.env.TICKETMASTER_API_KEY || '';

// Cities to include
const CITIES = ['Vancouver', 'Squamish', 'Whistler'];

/**
 * Fetch events from the Ticketmaster Discovery API filtered to TicketWeb
 * events for a single city.
 */
async function fetchViaApi(city) {
  const params = {
    city,
    countryCode: 'CA',
    source: 'ticketweb',
    size: 50,
    sort: 'date,asc',
  };
  if (API_KEY) params.apikey = API_KEY;

  const response = await axios.get(TM_API_URL, { params, timeout: 15000 });
  const rawEvents = response.data?._embedded?.events || [];
  return rawEvents;
}

/**
 * Map a raw Discovery API event to the canonical shape.
 */
function mapApiEvent(ev) {
  const venue = ev._embedded?.venues?.[0];
  const venueName = venue?.name || 'TicketWeb Venue';
  const city = venue?.city?.name || 'Vancouver';

  const priceRange = ev.priceRanges?.[0];
  const priceText = priceRange
    ? `$${priceRange.min}${priceRange.max !== priceRange.min ? ` - $${priceRange.max}` : ''}`
    : null;
  const { priceMin, priceMax } = parsePrice(priceText);

  const classificationText = [
    ev.classifications?.[0]?.genre?.name,
    ev.classifications?.[0]?.subGenre?.name,
    ev.name,
  ]
    .filter(Boolean)
    .join(' ');
  const genre =
    detectGenre(classificationText) ||
    ev.classifications?.[0]?.genre?.name?.toLowerCase() ||
    null;

  const ticketUrl = ev.url || null;
  const imageUrl =
    ev.images?.find((img) => img.ratio === '16_9' && img.width > 500)?.url ||
    ev.images?.[0]?.url ||
    null;

  const start = ev.dates?.start;
  const date = start?.localDate || null;
  const time = start?.localTime || null;

  return {
    source: SOURCE,
    source_id: ev.id,
    title: ev.name,
    artist: ev.name,
    venue: venueName,
    city,
    date,
    time,
    price_min: priceMin,
    price_max: priceMax,
    price_text: priceText,
    genre,
    ticket_url: ticketUrl,
    image_url: imageUrl,
    description: ev.info || ev.pleaseNote || null,
  };
}

/**
 * Scrape the TicketWeb Canada website for a given city.
 * Uses the events listing page with a city search query.
 * Looks for embedded JSON data and falls back to DOM parsing.
 */
async function fetchViaWeb(city, baseUrl) {
  // For Vancouver use the events listing page (or any custom URL provided by the caller);
  // for other cities use a city-specific search query.
  const pageUrl =
    city === 'Vancouver'
      ? baseUrl
      : `${TICKETWEB_SITE}/search?q=${encodeURIComponent(city)}&pageNum=1&pageSize=50`;
  const events = [];

  try {
    const { $, html } = await fetchPage(pageUrl);

    // Check for embedded JSON (Next.js __NEXT_DATA__ or similar)
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps = nextData?.props?.pageProps || {};
      const rawEvents =
        pageProps?.events ||
        pageProps?.data?.events ||
        pageProps?.results ||
        [];

      for (const ev of rawEvents) {
        const id = String(ev.id || ev.eventId || '');
        if (!id) continue;
        const title = ev.name || ev.title || '';
        if (!title) continue;

        const priceText = ev.priceRange || null;
        const { priceMin, priceMax } = parsePrice(priceText);

        events.push({
          source: SOURCE,
          source_id: id,
          title,
          artist: title,
          venue: ev.venue?.name || 'TicketWeb Venue',
          city: ev.venue?.city || city,
          date: parseDate(ev.date || ev.startDate || ev.dates?.start?.localDate) || null,
          time: ev.time || ev.dates?.start?.localTime || null,
          price_min: priceMin,
          price_max: priceMax,
          price_text: priceText,
          genre: detectGenre(title),
          ticket_url: ev.url || (ev.id ? `${TICKETWEB_SITE}/event/${ev.id}` : null),
          image_url: ev.images?.[0]?.url || ev.image || null,
          description: ev.info || ev.description || null,
        });
      }

      if (events.length > 0) return events;
    }

    // DOM fallback: look for event cards/links
    const selectors = [
      '.event-listing',
      '.event-item',
      '[class*="eventCard"]',
      'article',
    ];

    for (const sel of selectors) {
      if ($(sel).length === 0) continue;
      $(sel).each((_i, el) => {
        const $el = $(el);
        const title = $el.find('h2, h3, [class*="title"], [class*="event-name"]').first().text().trim();
        if (!title || title.length < 2) return;

        const href = $el.find('a').first().attr('href');
        const ticketUrl = href
          ? href.startsWith('http')
            ? href
            : `${TICKETWEB_SITE}${href}`
          : null;

        const dateText = $el.find('time, [class*="date"]').first().text().trim() || null;
        const priceText = $el.find('[class*="price"]').first().text().trim() || null;
        const { priceMin, priceMax } = parsePrice(priceText);

        events.push({
          source: SOURCE,
          source_id: ticketUrl || title,
          title,
          artist: title,
          venue: $el.find('[class*="venue"]').first().text().trim() || 'TicketWeb Venue',
          city,
          date: parseDate(dateText),
          time: null,
          price_min: priceMin,
          price_max: priceMax,
          price_text: priceText,
          genre: detectGenre(title),
          ticket_url: ticketUrl,
          image_url: $el.find('img').first().attr('src') || null,
          description: null,
        });
      });
      if (events.length > 0) break;
    }

    // Final fallback: look for event links
    if (events.length === 0) {
      $('a[href*="/event/"]').each((_i, el) => {
        const $el = $(el);
        const title = $el.text().trim();
        const href = $el.attr('href');
        if (!title || title.length < 3 || !href) return;
        const ticketUrl = href.startsWith('http') ? href : `${TICKETWEB_SITE}${href}`;
        events.push({
          source: SOURCE,
          source_id: ticketUrl,
          title,
          artist: title,
          venue: 'TicketWeb Venue',
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
  } catch (err) {
    console.warn(`[ticketweb] Web scrape failed for ${city} (${pageUrl}):`, err.message);
  }

  return events;
}

async function scrape(url = DEFAULT_URL) {
  const allEvents = [];
  const seenIds = new Set();

  // Try Discovery API for each city when API key is available
  let apiWorked = false;
  if (API_KEY) {
    for (const city of CITIES) {
      try {
        const rawEvents = await fetchViaApi(city);
        if (rawEvents.length > 0) {
          apiWorked = true;
          for (const ev of rawEvents) {
            const mapped = mapApiEvent(ev);
            if (!mapped.source_id || seenIds.has(mapped.source_id)) continue;
            seenIds.add(mapped.source_id);
            allEvents.push(mapped);
          }
        }
      } catch (err) {
        if (err.response?.status === 401) {
          console.warn('[ticketweb] API key invalid or missing. Falling back to web scrape.');
          break;
        }
        console.warn(`[ticketweb] API failed for ${city}:`, err.message);
      }
    }
  }

  // Scrape website for any city not yet covered by the API
  for (const city of CITIES) {
    const cityAlreadyCovered = apiWorked && allEvents.some((e) => e.city === city);
    if (cityAlreadyCovered) continue;

    const webEvents = await fetchViaWeb(city, url);
    for (const ev of webEvents) {
      if (!ev.source_id || seenIds.has(ev.source_id)) continue;
      seenIds.add(ev.source_id);
      allEvents.push(ev);
    }
  }

  return allEvents;
}

module.exports = { scrape, SOURCE, DEFAULT_URL };
