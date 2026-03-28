/**
 * Scraper for Resident Advisor – Vancouver events
 * https://ra.co/events/ca/vancouver
 *
 * Strategy (in order of reliability):
 *  1. GraphQL API (GET_EVENT_LISTINGS, numeric area ID) – the format used by
 *     working community scrapers; tries to look up the area ID from the page
 *     HTML first, then falls back to a known Vancouver ID.
 *  2. GraphQL API (GET_DEFAULT_EVENTS_LISTING, slug-based) – legacy format.
 *  3. Playwright – render the page in a real browser, intercept the GraphQL
 *     response or read __NEXT_DATA__.
 *  4. HTML parse – last-resort cheerio scrape of the static HTML.
 *
 * IMPORTANT: all strategy errors are caught and logged; a 4xx from one method
 * never prevents the next method from being attempted.
 */
const axios = require('axios');
const { fetchPage, getNextUserAgent, detectGenre } = require('./base');
const { interceptApiResponse, fetchPageRendered } = require('./browser');

const SOURCE = 'residentadvisor';
const DEFAULT_URL = 'https://ra.co/events/ca/vancouver';
const RA_GRAPHQL = 'https://ra.co/graphql';

// ---------------------------------------------------------------------------
// Error formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a detailed error string that includes the scraping method, URL, HTTP
 * status (when available), and the original message.
 */
function formatError(err, method, url) {
  const status = err.response?.status;
  const statusText = err.response?.statusText || '';
  const bodySnippet = (() => {
    try {
      const body = err.response?.data;
      if (!body) return '';
      const str = typeof body === 'string' ? body : JSON.stringify(body);
      return str.slice(0, 200);
    } catch (_) {
      return '';
    }
  })();

  const parts = [`[ra:${method}]`, `url=${url}`];
  if (status) parts.push(`HTTP ${status}${statusText ? ' ' + statusText : ''}`);
  parts.push(err.message);
  if (bodySnippet) parts.push(`body=${bodySnippet}`);
  return parts.join(' | ');
}

// ---------------------------------------------------------------------------
// Shared request helpers
// ---------------------------------------------------------------------------

function buildRaHeaders(extraHeaders = {}) {
  return {
    'User-Agent': getNextUserAgent(),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Referer: 'https://ra.co/events/ca/vancouver',
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
 * Visit the RA landing page to collect session cookies.
 * A cookie-seeded request looks more like a real browser session.
 *
 * @returns {Promise<string>} raw Cookie header value, or ''
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

    return setCookie
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  } catch (err) {
    console.warn(formatError(err, 'cookie-seed', 'https://ra.co/'));
    return '';
  }
}

/**
 * Attempt to extract RA's numeric area ID from the __NEXT_DATA__ embedded in
 * the events page HTML.  Returns null if not found.
 *
 * @param {string} url  - RA events URL (e.g. DEFAULT_URL)
 * @param {string} cookieHeader
 * @returns {Promise<number|null>}
 */
async function lookupAreaId(url, cookieHeader) {
  try {
    const response = await axios.get(url, {
      headers: buildRaHeaders(cookieHeader ? { Cookie: cookieHeader } : {}),
      timeout: 15000,
    });
    const html = typeof response.data === 'string' ? response.data : '';

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) return null;

    const nextData = JSON.parse(nextDataMatch[1]);
    // RA embeds the area object in various pageProps shapes
    const area =
      nextData?.props?.pageProps?.area ||
      nextData?.props?.pageProps?.data?.area ||
      nextData?.props?.pageProps?.initialProps?.area;

    const id = area?.id ? Number(area.id) : null;
    if (id) console.log(`[ra:lookup] Found Vancouver area ID: ${id}`);
    return id;
  } catch (err) {
    console.warn(formatError(err, 'area-id-lookup', url));
    return null;
  }
}

// ---------------------------------------------------------------------------
// GraphQL query builders
// ---------------------------------------------------------------------------

/**
 * Newer RA API format (used by working community scrapers).
 * Uses numeric area ID with `eq` filter and includes __typename annotations.
 *
 * @param {number} areaId  - RA numeric area ID
 */
function buildEventListingsBody(areaId) {
  const today = new Date().toISOString().split('T')[0];
  const twoMonthsLater = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  return {
    operationName: 'GET_EVENT_LISTINGS',
    variables: {
      filters: {
        areas: { eq: areaId },
        listingDate: { gte: today, lte: twoMonthsLater },
      },
      filterOptions: { genre: true },
      pageSize: 100,
      page: 1,
    },
    query: `query GET_EVENT_LISTINGS(
      $filters: FilterInputDtoInput
      $filterOptions: FilterOptionsInputDtoInput
      $page: Int
      $pageSize: Int
    ) {
      eventListings(
        filters: $filters
        filterOptions: $filterOptions
        pageSize: $pageSize
        page: $page
      ) {
        data {
          id
          listingDate
          event {
            id
            date
            startTime
            endTime
            title
            contentUrl
            flyerFront
            images { id filename alt type crop __typename }
            pick { id blurb __typename }
            venue { id name contentUrl live __typename }
            artists { id name __typename }
            genres { name __typename }
            cost
            __typename
          }
          __typename
        }
        totalResults
        __typename
      }
    }`,
  };
}

/**
 * Legacy RA API format (slug-based area filter).
 *
 * @param {string} areaSlug  - e.g. 'vancouver' or 'ca/vancouver'
 */
function buildDefaultEventListingsBody(areaSlug) {
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

// ---------------------------------------------------------------------------
// Event mapping
// ---------------------------------------------------------------------------

/** Map a raw RA event object to the canonical scraper shape. */
function mapRaEvent(ev, listing) {
  if (!ev || !ev.title) return null;

  const venue = ev.venue?.name || 'Resident Advisor Vancouver';
  const artists = (ev.artists || []).map((a) => a.name).join(', ');
  const genreText = (ev.genres || []).map((g) => g.name).join(' ');
  const description = ev.pick?.blurb || '';
  const genre = detectGenre(`${ev.title} ${genreText} ${description} ${artists}`);

  // Prefer flyerFront, then images array
  const rawImage = ev.flyerFront || (ev.images && ev.images.length > 0 ? ev.images[0].filename : null);
  const imageUrl = rawImage
    ? rawImage.startsWith('http') ? rawImage : `https://ra.co${rawImage}`
    : null;

  const rawUrl = ev.contentUrl;
  const ticketUrl = rawUrl
    ? rawUrl.startsWith('http') ? rawUrl : `https://ra.co${rawUrl}`
    : null;

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
// Strategy 1a: GraphQL API – GET_EVENT_LISTINGS (numeric area ID)
// ---------------------------------------------------------------------------

async function scrapeViaNumericAreaId(areaId, cookieHeader) {
  const extraHeaders = cookieHeader ? { Cookie: cookieHeader } : {};
  const url = RA_GRAPHQL;

  console.log(`[ra:graphql-numeric] Trying area ID ${areaId}…`);
  const response = await axios.post(url, buildEventListingsBody(areaId), {
    headers: buildRaHeaders(extraHeaders),
    timeout: 20000,
  });

  const listings = response.data?.data?.eventListings?.data;
  if (!Array.isArray(listings)) {
    console.warn(`[ra:graphql-numeric] Unexpected response shape | url=${url} | area=${areaId}`);
    return [];
  }

  const events = listings.map((l) => mapRaEvent(l.event, l)).filter(Boolean);
  console.log(`[ra:graphql-numeric] area=${areaId} – ${events.length} events`);
  return events;
}

// ---------------------------------------------------------------------------
// Strategy 1b: GraphQL API – GET_DEFAULT_EVENTS_LISTING (slug-based)
// ---------------------------------------------------------------------------

async function scrapeViaSlug(slug, cookieHeader) {
  const extraHeaders = cookieHeader ? { Cookie: cookieHeader } : {};
  const url = RA_GRAPHQL;

  console.log(`[ra:graphql-slug] Trying slug "${slug}"…`);
  const response = await axios.post(url, buildDefaultEventListingsBody(slug), {
    headers: buildRaHeaders(extraHeaders),
    timeout: 20000,
  });

  const listings = response.data?.data?.eventListings?.data;
  if (!Array.isArray(listings)) {
    console.warn(`[ra:graphql-slug] Unexpected response shape | url=${url} | slug=${slug}`);
    return [];
  }

  const events = listings.map((l) => mapRaEvent(l.event, l)).filter(Boolean);
  console.log(`[ra:graphql-slug] slug="${slug}" – ${events.length} events`);
  return events;
}

// ---------------------------------------------------------------------------
// Strategy 1 (combined): all GraphQL attempts
// ---------------------------------------------------------------------------

async function scrapeViaApi(pageUrl) {
  const cookieHeader = await seedCookies();

  // 1a. Numeric area ID (GET_EVENT_LISTINGS) – try page-extracted ID first,
  //     then fall back to commonly observed Vancouver area IDs.
  const extractedId = await lookupAreaId(pageUrl, cookieHeader);
  // Known Vancouver IDs tried in order (page-extracted takes precedence)
  const areaIdsToTry = extractedId
    ? [extractedId]
    : [13, 306, 15, 1];

  for (const areaId of areaIdsToTry) {
    try {
      const events = await scrapeViaNumericAreaId(areaId, cookieHeader);
      if (events.length > 0) return events;
    } catch (err) {
      console.warn(formatError(err, 'graphql-numeric', `${RA_GRAPHQL} (area=${areaId})`));
    }
  }

  // 1b. Slug-based (GET_DEFAULT_EVENTS_LISTING)
  for (const slug of ['vancouver', 'ca/vancouver']) {
    try {
      const events = await scrapeViaSlug(slug, cookieHeader);
      if (events.length > 0) return events;
    } catch (err) {
      console.warn(formatError(err, 'graphql-slug', `${RA_GRAPHQL} (slug=${slug})`));
    }
  }

  throw new Error('[ra:graphql] All GraphQL variants returned no events');
}

// ---------------------------------------------------------------------------
// Strategy 2: Playwright (headless browser – intercepts the GraphQL call)
// ---------------------------------------------------------------------------

async function scrapeViaPlaywright(url) {
  console.log(`[ra:playwright] Starting headless browser scrape | url=${url}`);

  // Let the browser load the page; intercept the GraphQL response in-flight
  let apiData;
  try {
    apiData = await interceptApiResponse(url, RA_GRAPHQL, { timeout: 45000 });
  } catch (err) {
    console.warn(formatError(err, 'playwright-intercept', url));
    apiData = null;
  }

  if (apiData) {
    const listings = apiData?.data?.eventListings?.data;
    if (Array.isArray(listings) && listings.length > 0) {
      const events = listings.map((l) => mapRaEvent(l.event, l)).filter(Boolean);
      if (events.length > 0) {
        console.log(`[ra:playwright] GraphQL intercept succeeded – ${events.length} events`);
        return events;
      }
    }
    console.warn(`[ra:playwright] GraphQL intercept returned empty/invalid data | url=${url}`);
  } else {
    console.warn(`[ra:playwright] GraphQL intercept returned null – falling back to rendered HTML | url=${url}`);
  }

  // Intercept missed; parse the fully-rendered HTML directly
  let rendered;
  try {
    rendered = await fetchPageRendered(url, { timeout: 45000 });
  } catch (err) {
    console.warn(formatError(err, 'playwright-render', url));
    return [];
  }

  if (!rendered) {
    console.warn(`[ra:playwright] fetchPageRendered returned null (no browser available) | url=${url}`);
    return [];
  }

  const { $, html } = rendered;
  return parseRaHtml($, html, 'playwright-html');
}

// ---------------------------------------------------------------------------
// Strategy 3: HTML parsing (static cheerio)
// ---------------------------------------------------------------------------

async function scrapeViaHtml(url) {
  console.log(`[ra:html] Static HTML scrape | url=${url}`);
  let result;
  try {
    result = await fetchPage(url);
  } catch (err) {
    console.warn(formatError(err, 'html', url));
    throw err;
  }
  const { $, html } = result;
  return parseRaHtml($, html, 'html');
}

/** Parse RA HTML (static or rendered) using multiple heuristics. */
function parseRaHtml($, html, method = 'html') {
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

      if (events.length > 0) {
        console.log(`[ra:${method}] Extracted ${events.length} events from __NEXT_DATA__`);
        return events;
      }
    } catch (parseErr) {
      console.warn(`[ra:${method}] __NEXT_DATA__ parse failed:`, parseErr.message);
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
    if (events.length > 0) {
      console.log(`[ra:${method}] Extracted ${events.length} events from DOM selector "${sel}"`);
      break;
    }
  }

  if (events.length === 0) {
    console.warn(`[ra:${method}] No events found in HTML`);
  }

  return events;
}

// ---------------------------------------------------------------------------
// Main entry point – all strategies tried regardless of previous 4xx errors
// ---------------------------------------------------------------------------

async function scrape(url = DEFAULT_URL) {
  // Strategy 1: GraphQL API (all variants – numeric area ID, then slug)
  // A 4xx from one variant does NOT abort the cascade; each is caught separately.
  try {
    const events = await scrapeViaApi(url);
    if (events.length > 0) return events;
    console.warn('[ra] All GraphQL variants succeeded but returned 0 events – trying browser');
  } catch (apiErr) {
    console.warn(`[ra] GraphQL strategies exhausted: ${apiErr.message} – falling through to browser`);
  }

  // Strategy 2: Playwright headless browser
  try {
    const events = await scrapeViaPlaywright(url);
    if (events.length > 0) return events;
    console.warn('[ra] Playwright returned 0 events – trying static HTML');
  } catch (pwErr) {
    console.warn(`[ra] Playwright failed: ${pwErr.message} – falling through to static HTML`);
  }

  // Strategy 3: Static HTML / cheerio (last resort)
  try {
    const events = await scrapeViaHtml(url);
    if (events.length === 0) console.warn('[ra] All scraping strategies exhausted – 0 events returned');
    return events;
  } catch (htmlErr) {
    console.error(`[ra] Static HTML fallback failed: ${htmlErr.message}`);
    return [];
  }
}

module.exports = { scrape, SOURCE, DEFAULT_URL };


