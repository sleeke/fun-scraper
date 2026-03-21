const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-CA,en;q=0.9',
};

/**
 * Fetch HTML from a URL and return a cheerio instance.
 * @param {string} url
 * @param {object} [options] - axios options override
 * @returns {Promise<{$: CheerioAPI, html: string}>}
 */
async function fetchPage(url, options = {}) {
  const response = await axios.get(url, {
    headers: DEFAULT_HEADERS,
    timeout: 15000,
    ...options,
  });
  const html = response.data;
  const $ = cheerio.load(html);
  return { $, html };
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

module.exports = { fetchPage, detectGenre, parsePrice };
