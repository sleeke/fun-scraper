const axios = require('axios');
const cheerio = require('cheerio');

/** Pool of realistic desktop browser user-agent strings to rotate. */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
];

let _uaIndex = 0;

/** Returns a user agent string, cycling through the pool on each call. */
function getNextUserAgent() {
  const ua = USER_AGENTS[_uaIndex % USER_AGENTS.length];
  _uaIndex += 1;
  return ua;
}

function buildDefaultHeaders() {
  return {
    'User-Agent': getNextUserAgent(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-CA,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
  };
}

/**
 * Fetch HTML from a URL and return a cheerio instance.
 * @param {string} url
 * @param {object} [options] - axios options override
 * @returns {Promise<{$: CheerioAPI, html: string}>}
 */
async function fetchPage(url, options = {}) {
  const response = await axios.get(url, {
    headers: buildDefaultHeaders(),
    timeout: 15000,
    ...options,
  });
  const html = response.data;
  const $ = cheerio.load(html);
  return { $, html };
}

/**
 * Like fetchPage but retries on transient failures with exponential back-off.
 *
 * @param {string} url
 * @param {object} [options]          - axios options
 * @param {number} [options.retries=3]  - max attempts (not counting the first)
 * @param {number} [options.baseDelay=500] - initial delay in ms (doubles each retry)
 * @returns {Promise<{$: CheerioAPI, html: string}>}
 */
async function fetchPageWithRetry(url, options = {}) {
  const { retries = 3, baseDelay = 500, ...axiosOptions } = options;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: buildDefaultHeaders(),
        timeout: 20000,
        ...axiosOptions,
      });
      const html = response.data;
      const $ = cheerio.load(html);
      return { $, html };
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      // Don't retry on definitive client-side errors
      if (status === 404 || status === 401 || status === 403) throw err;
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

/**
 * Detect genre from a text string using keyword matching.
 * @param {string} text
 * @returns {string|null}
 */
function detectGenre(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const genreMap = [
    ['hip-hop', ['hip hop', 'hip-hop', 'rap', 'trap', 'r&b', 'rnb']],
    ['electronic', ['electronic', 'edm', 'techno', 'house', 'trance', 'dnb', 'drum and bass', 'dubstep', 'ambient', 'electronica', 'rave']],
    ['jazz', ['jazz', 'blues', 'soul', 'funk', 'swing']],
    ['rock', ['rock', 'metal', 'punk', 'grunge', 'indie', 'alternative', 'hardcore', 'emo', 'post-rock']],
    ['pop', ['pop', 'synth-pop', 'dance-pop', 'k-pop']],
    ['classical', ['classical', 'orchestra', 'symphony', 'opera', 'chamber']],
    ['country', ['country', 'folk', 'bluegrass', 'americana']],
    ['reggae', ['reggae', 'dub', 'ska', 'dancehall']],
    ['latin', ['latin', 'salsa', 'cumbia', 'bachata', 'reggaeton']],
  ];
  for (const [genre, keywords] of genreMap) {
    if (keywords.some((kw) => lower.includes(kw))) return genre;
  }
  return null;
}

/**
 * Normalize a price string into min/max numbers.
 * @param {string} text  e.g. "$20", "$20-$40", "Free", "$20 / $25"
 * @returns {{ priceMin: number|null, priceMax: number|null, priceText: string }}
 */
function parsePrice(text) {
  if (!text) return { priceMin: null, priceMax: null, priceText: null };
  const clean = text.trim();
  if (/free/i.test(clean)) {
    return { priceMin: 0, priceMax: 0, priceText: 'Free' };
  }
  const numbers = clean.match(/\$?([\d]+(?:\.\d{1,2})?)/g);
  if (!numbers || numbers.length === 0) {
    return { priceMin: null, priceMax: null, priceText: clean };
  }
  const values = numbers.map((n) => parseFloat(n.replace('$', '')));
  return {
    priceMin: Math.min(...values),
    priceMax: Math.max(...values),
    priceText: clean,
  };
}

/**
 * Parse a date string and normalize to YYYY-MM-DD where possible.
 * Handles: ISO datetimes, Squarespace "datetime" attributes, human-readable strings.
 * @param {string} text
 * @returns {string|null} YYYY-MM-DD or null
 */
function parseDate(text) {
  if (!text) return null;
  const clean = text.trim();
  if (!clean) return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  // ISO datetime — extract date part
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(clean)) return clean.slice(0, 10);

  // Try Date.parse (handles many human-readable formats)
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    // Sanity-check year
    if (y >= 2020 && y <= 2035) {
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// MusicBrainz artist genre lookup
// ---------------------------------------------------------------------------
const MB_RATE_LIMIT_MS = 1200; // 1 request per second; give a little extra headroom
let _lastMbRequest = 0;
const _artistGenreCache = new Map();

/**
 * Look up artist genres from MusicBrainz (free API, no auth required).
 * Returns up to 3 genre strings, or an empty array if not found / on error.
 * Results are cached for the lifetime of the process.
 *
 * @param {string} artistName
 * @returns {Promise<string[]>}
 */
async function lookupArtistGenres(artistName) {
  if (!artistName || artistName.trim().length < 2) return [];

  const key = artistName.toLowerCase().trim();
  if (_artistGenreCache.has(key)) return _artistGenreCache.get(key);

  // Enforce rate limiting
  const now = Date.now();
  const wait = MB_RATE_LIMIT_MS - (now - _lastMbRequest);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastMbRequest = Date.now();

  try {
    const response = await axios.get('https://musicbrainz.org/ws/2/artist/', {
      params: {
        query: `artist:"${artistName}"`,
        fmt: 'json',
        limit: 3,
      },
      headers: {
        'User-Agent': 'fun-scraper/1.0.0 (https://github.com/sleeke/fun-scraper)',
        Accept: 'application/json',
      },
      timeout: 8000,
    });

    const artists = response.data?.artists || [];
    if (artists.length === 0) {
      _artistGenreCache.set(key, []);
      return [];
    }

    // Prefer exact name match, fall back to first result
    const artist =
      artists.find((a) => a.name.toLowerCase() === key) || artists[0];

    // Use community-curated genres first, then fall back to tags
    const genres = (artist.genres || [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((g) => g.name);

    if (genres.length === 0) {
      const tagGenres = (artist.tags || [])
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((t) => t.name);
      genres.push(...tagGenres);
    }

    _artistGenreCache.set(key, genres);
    return genres;
  } catch (err) {
    console.warn(`[musicbrainz] Genre lookup failed for "${artistName}":`, err.message);
    _artistGenreCache.set(key, []);
    return [];
  }
}

module.exports = { fetchPage, fetchPageWithRetry, getNextUserAgent, detectGenre, parsePrice, parseDate, lookupArtistGenres };
