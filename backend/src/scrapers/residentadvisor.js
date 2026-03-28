/**
 * Scraper for Resident Advisor – Vancouver events
 * https://ra.co/events/ca/vancouver
 *
 * Strategy (in order of reliability):
 *  1. GraphQL API  – direct POST with cookie-seeded session headers.
 *  2. Playwright   – render the page in a real browser, intercept the
 *                    GraphQL response or read __NEXT_DATA__.
 *  3. HTML parse   – last-resort cheerio scrape of the static HTML.
 */
const axios = require('axios');
const { fetchPage, getNextUserAgent, detectGenre } = require('./base');
const { interceptApiResponse, fetchPageRendered } = require('./browser');

const SOURCE = 'residentadvisor';
const DEFAULT_URL = 'https://ra.co/events/ca/vancouver';
const RA_GRAPHQL = 'https://ra.co/graphql';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRaHeaders(extraHeaders = {}) {
  return {
    'User-Agent': getNextUserAgent(),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Referer: 'https://ra.co/',
    Origin: 'https://ra.co',
    'ra-content-language': 'en',
    'Accept-Language': 'en-CA,en;q=0.9',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    ...extraHeaders,
  };
}

/**
 * Visit the RA landing page to collect session cookies and any CSRF tokens
 * embedded in the initial page HTML.
 *
 * @returns {Promise<string>} raw cookie header value, or ''
 */
async function seedCookies() {
  try {
    const response = await axios.get('https://ra.co/', {
      headers: {
        'User-Agent': getNextUserAgent(),
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-CA,en;q=0.9',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const setCookie = response.headers['set-cookie'];
    if (!Array.isArray(setCookie) || setCookie.length === 0) return '';

    // Flatten Set-Cookie array into a single Cookie header value
    return setCookie
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  } catch (_) {
    return '';
  }
}

/** Build the GraphQL request body for a given area slug. */
function buildGraphqlBody(areaSlug) {
  const today = new Date().toISOString().split('T')[0];
  const twoMonthsLater = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  return {
    operationName: 'GET_DEFAULT_EVENTS_LISTING',
    variables: {
      filters: {
        areas: { slug: areaSlug },
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
}

/** Map a raw RA event object to the canonical scraper shape. */
function mapRaEvent(ev, listing) {
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

  const ticketUrl = ev.contentUrl ? `https://ra.co${ev.contentUrl}` : null;
  const date = ev.date || (listing && listing.listingDate) || null;
  const time = ev.startTime || null;

  return {
    source: SOURCE,
    source_id: String(ev.id),
    title: ev.title,
    artist: artists || ev.title,
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
}

// ---------------------------------------------------------------------------
// Strategy 1: GraphQL API (with cookie seeding)
// ---------------------------------------------------------------------------

async function scrapeViaApi() {
  // Cookie seeding: get the RA homepage first so we look like a real browser
  const cookieHeader = await seedCookies();

  const extraHeaders = cookieHeader ? { Cookie: cookieHeader } : {};

  // Try two common area-slug formats RA has used over time
  const slugsToTry = ['vancouver', 'ca/vancouver'];

  for (const slug of slugsToTry) {
    try {
      const response = await axios.post(RA_GRAPHQL, buildGraphqlBody(slug), {
        headers: buildRaHeaders(extraHeaders),
        timeout: 20000,
      });

      const listings = response.data?.data?.eventListings?.data;
      if (!Array.isArray(listings)) continue;
      if (listings.length === 0) continue;

      const events = listings
        .map((listing) => mapRaEvent(listing.event, listing))
        .filter(Boolean);

      if (events.length > 0) {
        console.log(`[ra] GraphQL success with slug "${slug}" – ${events.length} events`);
        return events;
      }
    } catch (err) {
      console.warn(`[ra] GraphQL attempt with slug "${slug}" failed:`, err.message);
    }
  }

  throw new Error('GraphQL API returned no events for any slug variant');
}

// ---------------------------------------------------------------------------
// Strategy 2: Playwright (headless browser – intercepts the GraphQL call)
// ---------------------------------------------------------------------------

async function scrapeViaPlaywright(url) {
  console.log('[ra] Trying Playwright browser scrape…');

  // Let the browser load the page; intercept the GraphQL response in-flight
  const apiData = await interceptApiResponse(url, RA_GRAPHQL, { timeout: 45000 });

  if (apiData) {
    const listings = apiData?.data?.eventListings?.data;
    if (Array.isArray(listings) && listings.length > 0) {
      const events = listings
        .map((listing) => mapRaEvent(listing.event, listing))
        .filter(Boolean);
      if (events.length > 0) {
        console.log(`[ra] Playwright GraphQL intercept – ${events.length} events`);
        return events;
      }
    }
  }

  // Intercept didn't yield results; parse the rendered HTML directly
  const rendered = await fetchPageRendered(url, { timeout: 45000 });
  if (!rendered) return [];

  const { $, html } = rendered;
  return parseRaHtml($, html);
}

// ---------------------------------------------------------------------------
// Strategy 3: HTML parsing (static cheerio – works only if Next.js SSR is on)
// ---------------------------------------------------------------------------

async function scrapeViaHtml(url) {
  const { $, html } = await fetchPage(url);
  return parseRaHtml($, html);
}

/** Parse RA HTML (either static or Playwright-rendered) using multiple heuristics. */
function parseRaHtml($, html) {
  const events = [];

  // RA uses Next.js – look for embedded JSON in __NEXT_DATA__
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps =
        nextData?.props?.pageProps ||
        nextData?.props?.initialProps ||
        {};

      const listings =
        pageProps?.data?.eventListings?.data ||
        pageProps?.eventListings?.data ||
        [];

      for (const listing of listings) {
        const ev = listing.event || listing;
        const mapped = mapRaEvent(ev, listing);
        if (mapped) events.push(mapped);
      }

      if (events.length > 0) return events;
    } catch (_) {
      // Ignore JSON parse errors
    }
  }

  // Last resort: visible DOM cards
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
      const ticketUrl = href
        ? href.startsWith('http') ? href : `https://ra.co${href}`
        : null;
      const dateText = $el.find('time, [class*="date"]').first().text().trim() || null;
      const venue =
        $el.find('[class*="venue"]').first().text().trim() || 'Resident Advisor Vancouver';
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

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function scrape(url = DEFAULT_URL) {
  // 1. GraphQL API (fastest, most structured)
  try {
    const events = await scrapeViaApi();
    if (events.length > 0) return events;
  } catch (apiErr) {
    console.warn('[ra] GraphQL API failed:', apiErr.message);
  }

  // 2. Playwright (real browser — handles JS-rendered pages and anti-bot measures)
  try {
    const events = await scrapeViaPlaywright(url);
    if (events.length > 0) return events;
  } catch (pwErr) {
    console.warn('[ra] Playwright scrape failed:', pwErr.message);
  }

  // 3. Static HTML fallback
  try {
    return await scrapeViaHtml(url);
  } catch (htmlErr) {
    console.warn('[ra] HTML fallback failed:', htmlErr.message);
    return [];
  }
}

module.exports = { scrape, SOURCE, DEFAULT_URL };

