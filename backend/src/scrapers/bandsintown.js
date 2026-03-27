/**
 * Scraper for Bandsintown events in Vancouver, Squamish, and Whistler.
 * Tries the Bandsintown public REST API first; falls back to scraping
 * the Bandsintown website (Next.js, embeds __NEXT_DATA__ JSON).
 */
const axios = require('axios');
const { fetchPage, detectGenre, parseDate } = require('./base');

const SOURCE = 'bandsintown';
const DEFAULT_URL = 'https://rest.bandsintown.com/events/search';
const APP_ID = process.env.BANDSINTOWN_APP_ID || 'fun-scraper';

const LOCATIONS = [
  { city: 'Vancouver', apiQuery: 'Vancouver,BC', webSlug: 'vancouver--british-columbia' },
  { city: 'Squamish', apiQuery: 'Squamish,BC', webSlug: 'squamish--british-columbia' },
  { city: 'Whistler', apiQuery: 'Whistler,BC', webSlug: 'whistler--british-columbia' },
];

const BIT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

/**
 * Fetch events from the Bandsintown REST API for a single location.
 */
async function fetchViaApi(baseUrl, location) {
  const response = await axios.get(baseUrl, {
    params: {
      app_id: APP_ID,
      location: location.apiQuery,
      radius: 50,
      date: 'upcoming',
      per_page: 50,
    },
    headers: BIT_HEADERS,
    timeout: 15000,
  });
  const data = response.data;
  return Array.isArray(data) ? data : (data?.events || data?.data || []);
}

/**
 * Map a raw Bandsintown API event object to the canonical event shape.
 */
function mapApiEvent(ev, defaultCity) {
  const id = String(ev.id || '');
  if (!id) return null;

  const lineup = ev.lineup || [];
  const artist = lineup.join(', ') || ev.title || 'Unknown Artist';
  const venue = ev.venue?.name || 'Unknown Venue';
  const city = ev.venue?.city || defaultCity;

  const date = parseDate(ev.datetime) || null;
  const time = ev.datetime ? (ev.datetime.split('T')[1] || '').slice(0, 5) || null : null;

  const ticketUrl =
    (ev.offers || []).find((o) => o.type === 'Tickets' || o.type === 'tickets')?.url ||
    ev.url ||
    null;

  const imageUrl = ev.artist?.thumb_url || null;
  const genre = detectGenre(`${artist} ${ev.description || ''}`);

  return {
    source: SOURCE,
    source_id: id,
    title: artist,
    artist,
    venue,
    city,
    date,
    time,
    price_min: null,
    price_max: null,
    price_text: null,
    genre,
    ticket_url: ticketUrl,
    image_url: imageUrl,
    description: ev.description || null,
  };
}

/**
 * Scrape a Bandsintown city page via the website (Next.js __NEXT_DATA__ fallback).
 */
async function fetchViaWeb(location) {
  const url = `https://www.bandsintown.com/en/c/${location.webSlug}/concerts`;
  const events = [];

  try {
    const { $, html } = await fetchPage(url);

    // Bandsintown uses Next.js — look for __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps = nextData?.props?.pageProps || {};

      // Try various data shapes Bandsintown has used over time
      const rawEvents =
        pageProps?.events ||
        pageProps?.data?.events ||
        pageProps?.cityEvents ||
        pageProps?.concertList ||
        [];

      for (const ev of rawEvents) {
        const id = String(ev.id || ev.event_id || '');
        if (!id) continue;

        const artist = (ev.lineup || []).join(', ') || ev.artist?.name || ev.title || 'Unknown Artist';
        const venue = ev.venue?.name || 'Unknown Venue';
        const city = ev.venue?.city || location.city;
        const date = parseDate(ev.datetime || ev.date) || null;
        const time = ev.datetime ? (ev.datetime.split('T')[1] || '').slice(0, 5) || null : null;

        const ticketUrl =
          (ev.offers || []).find((o) => /ticket/i.test(o.type || ''))?.url ||
          (ev.ticket_url) ||
          (ev.url ? (ev.url.startsWith('http') ? ev.url : `https://www.bandsintown.com${ev.url}`) : null);

        events.push({
          source: SOURCE,
          source_id: id,
          title: artist,
          artist,
          venue,
          city,
          date,
          time,
          price_min: null,
          price_max: null,
          price_text: null,
          genre: detectGenre(artist),
          ticket_url: ticketUrl,
          image_url: ev.image_url || ev.artist?.thumb_url || null,
          description: ev.description || null,
        });
      }

      if (events.length > 0) return events;
    }

    // Last resort: DOM scraping
    const selectors = [
      '[data-event-id]',
      '[class*="event-item"]',
      '[class*="eventItem"]',
      'article',
    ];
    for (const sel of selectors) {
      if ($(sel).length === 0) continue;
      $(sel).each((_i, el) => {
        const $el = $(el);
        const title = $el.find('h3, h2, [class*="title"], [class*="artist"]').first().text().trim();
        if (!title || title.length < 2) return;
        const href = $el.find('a').first().attr('href');
        const ticketUrl = href
          ? href.startsWith('http')
            ? href
            : `https://www.bandsintown.com${href}`
          : null;
        const dateText = $el.find('time, [class*="date"]').first().text().trim() || null;
        events.push({
          source: SOURCE,
          source_id: ticketUrl || title,
          title,
          artist: title,
          venue: $el.find('[class*="venue"]').first().text().trim() || 'Bandsintown Venue',
          city: location.city,
          date: parseDate(dateText),
          time: null,
          price_min: null,
          price_max: null,
          price_text: null,
          genre: detectGenre(title),
          ticket_url: ticketUrl,
          image_url: $el.find('img').first().attr('src') || null,
          description: null,
        });
      });
      if (events.length > 0) break;
    }
  } catch (err) {
    console.warn(`[bandsintown] Web scrape failed for ${location.city}:`, err.message);
  }

  return events;
}

async function scrape(url = DEFAULT_URL) {
  const allEvents = [];
  const seenIds = new Set();

  // Try the REST API for each location
  let apiWorked = false;
  for (const location of LOCATIONS) {
    try {
      const raw = await fetchViaApi(url, location);
      if (Array.isArray(raw) && raw.length > 0) {
        apiWorked = true;
        for (const ev of raw) {
          const mapped = mapApiEvent(ev, location.city);
          if (!mapped || seenIds.has(mapped.source_id)) continue;
          seenIds.add(mapped.source_id);
          allEvents.push(mapped);
        }
      }
    } catch (err) {
      console.warn(`[bandsintown] API failed for ${location.city}:`, err.message);
    }
  }

  // Determine which cities still need coverage via web scraping
  const coveredCities = apiWorked ? new Set(allEvents.map((e) => e.city)) : new Set();
  for (const location of LOCATIONS) {
    if (coveredCities.has(location.city)) continue;
    const webEvents = await fetchViaWeb(location);
    for (const ev of webEvents) {
      if (seenIds.has(ev.source_id)) continue;
      seenIds.add(ev.source_id);
      allEvents.push(ev);
    }
  }

  return allEvents;
}

module.exports = { scrape, SOURCE, DEFAULT_URL };
