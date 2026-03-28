/**
 * Scraper for Resident Advisor – Vancouver events
 * https://ra.co/events/ca/vancouver
 *
 * Tries the RA GraphQL API first; falls back to HTML parsing of the page.
 */
const axios = require('axios');
const { fetchPage, detectGenre } = require('./base');

const SOURCE = 'residentadvisor';
const DEFAULT_URL = 'https://ra.co/events/ca/vancouver';
const RA_GRAPHQL = 'https://ra.co/graphql';

const RA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Referer: 'https://ra.co/',
  Origin: 'https://ra.co',
};

/**
 * Fetch events from RA's GraphQL API (no auth required for basic listings).
 */
async function scrapeViaApi() {
  const today = new Date().toISOString().split('T')[0];
  const twoMonthsLater = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const body = {
    operationName: 'GET_DEFAULT_EVENTS_LISTING',
    variables: {
      filters: {
        areas: { slug: 'vancouver' },
        listingDate: { gte: today, lte: twoMonthsLater },
      },
      pageSize: 100,
      page: 1,
      ordering: 'DATEASC',
    },
    query: `query GET_DEFAULT_EVENTS_LISTING(
      $filters: FilterInput
      $pageSize: Int
      $page: Int
      $ordering: Ordering
    ) {
      eventListings(
        filters: $filters
        pageSize: $pageSize
        page: $page
        ordering: $ordering
      ) {
        data {
          id
          listingDate
          event {
            id
            title
            date
            startTime
            contentUrl
            images { filename }
            venue { name address }
            artists { name }
            genres { name }
            pick { blurb }
            cost
          }
        }
      }
    }`,
  };

  const response = await axios.post(RA_GRAPHQL, body, {
    headers: RA_HEADERS,
    timeout: 15000,
  });

  const listings =
    response.data?.data?.eventListings?.data;
  if (!Array.isArray(listings)) throw new Error('Unexpected RA API response');

  return listings
    .map((listing) => {
      const ev = listing.event;
      if (!ev || !ev.title) return null;

      const venue = ev.venue?.name || 'Resident Advisor Vancouver';
      const artists = (ev.artists || []).map((a) => a.name).join(', ');
      const genreText = (ev.genres || []).map((g) => g.name).join(' ');
      const description = ev.pick?.blurb || '';
      const genre = detectGenre(`${ev.title} ${genreText} ${description} ${artists}`);

      const imageUrl =
        ev.images && ev.images.length > 0
          ? `https://ra.co${ev.images[0].filename}`
          : null;

      const ticketUrl = ev.contentUrl
        ? `https://ra.co${ev.contentUrl}`
        : null;

      // RA dates come as YYYY-MM-DD; time as HH:MM
      const date = ev.date || listing.listingDate || null;
      const time = ev.startTime || null;

      return {
        source: SOURCE,
        source_id: String(ev.id),
        title: ev.title,
        artist: artists || null,
        venue,
        city: 'Vancouver',
        date,
        time,
        price_min: null,
        price_max: null,
        price_text: ev.cost || null,
        genre,
        ticket_url: ticketUrl,
        image_url: imageUrl,
        description,
      };
    })
    .filter(Boolean);
}

/**
 * Fallback: scrape the HTML page and extract __NEXT_DATA__ or visible cards.
 */
async function scrapeViaHtml(url) {
  const { $, html } = await fetchPage(url);
  const events = [];

  // RA uses Next.js – look for embedded JSON in __NEXT_DATA__
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      // Navigate to the event listings in the Next.js page props
      const pageProps =
        nextData?.props?.pageProps ||
        nextData?.props?.initialProps ||
        {};

      // Try various possible data shapes
      const listings =
        pageProps?.data?.eventListings?.data ||
        pageProps?.eventListings?.data ||
        [];

      for (const listing of listings) {
        const ev = listing.event || listing;
        if (!ev || !ev.title) continue;

        const venue = ev.venue?.name || 'Resident Advisor Vancouver';
        const artists = (ev.artists || []).map((a) => a.name).join(', ');
        const genreText = (ev.genres || []).map((g) => g.name).join(' ');
        const description = ev.pick?.blurb || '';
        const genre = detectGenre(`${ev.title} ${genreText} ${description}`);

        events.push({
          source: SOURCE,
          source_id: String(ev.id || ev.contentUrl || ev.title),
          title: ev.title,
          artist: artists || null,
          venue,
          city: 'Vancouver',
          date: ev.date || listing.listingDate || null,
          time: ev.startTime || null,
          price_min: null,
          price_max: null,
          price_text: ev.cost || null,
          genre,
          ticket_url: ev.contentUrl ? `https://ra.co${ev.contentUrl}` : null,
          image_url:
            ev.images && ev.images.length > 0
              ? `https://ra.co${ev.images[0].filename}`
              : null,
          description,
        });
      }

      if (events.length > 0) return events;
    } catch (_e) {
      // Ignore JSON parse errors and fall through to DOM scraping
    }
  }

  // Last resort: parse visible DOM elements
  const selectors = [
    '[class*="eventCard"]',
    '[class*="event-card"]',
    '[class*="listing"]',
    'article',
  ];

  for (const sel of selectors) {
    if ($(sel).length === 0) continue;
    $(sel).each((_i, el) => {
      const $el = $(el);
      const title = $el.find('h3, h2, [class*="title"]').first().text().trim();
      if (!title || title.length < 3) return;
      const href = $el.find('a').first().attr('href');
      const ticketUrl = href ? (href.startsWith('http') ? href : `https://ra.co${href}`) : null;
      const dateText = $el.find('time, [class*="date"]').first().text().trim() || null;
      const venue = $el.find('[class*="venue"]').first().text().trim() || 'Resident Advisor Vancouver';
      events.push({
        source: SOURCE,
        source_id: ticketUrl || title,
        title,
        artist: title,
        venue,
        city: 'Vancouver',
        date: dateText,
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

  return events;
}

async function scrape(url = DEFAULT_URL) {
  try {
    const events = await scrapeViaApi();
    if (events.length > 0) return events;
  } catch (_err) {
    // fall through to HTML scraping
  }
  return scrapeViaHtml(url);
}

module.exports = { scrape, SOURCE, DEFAULT_URL };
