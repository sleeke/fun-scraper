/**
 * Scraper for Celebrities Night Club Vancouver
 * https://www.celebritiesnightclub.com/events
 */
const { fetchPage, detectGenre, parsePrice, parseDate, extractLineup } = require('./base');

const SOURCE = 'celebrities';
const DEFAULT_URL = 'https://www.celebritiesnightclub.com/events';

async function scrape(url = DEFAULT_URL) {
  const { $ } = await fetchPage(url);
  const events = [];

  // Try multiple common event card selectors
  const selectors = [
    '.event-item',
    '.eventlist-event',
    'article',
    '.entry',
    '.tribe-events-calendar-list__event-article',
    '.sqs-block-content .summary-item',
  ];

  let found = false;
  for (const sel of selectors) {
    if ($(sel).length > 0) {
      $(sel).each((_i, el) => {
        const event = extractEvent($, el, SOURCE);
        if (event) events.push(event);
      });
      found = true;
      break;
    }
  }

  // Fallback: look for any links that look like event pages
  if (!found || events.length === 0) {
    $('a[href*="/event"]').each((_i, el) => {
      const $el = $(el);
      const title = $el.text().trim();
      const href = $el.attr('href');
      if (title && title.length > 3 && href) {
        const ticketUrl = href.startsWith('http') ? href : `https://www.celebritiesnightclub.com${href}`;
        const allText = title;
        events.push({
          source: SOURCE,
          source_id: ticketUrl,
          title,
          artist: null,
          venue: 'Celebrities Night Club',
          city: 'Vancouver',
          date: null,
          price_min: null,
          price_max: null,
          price_text: null,
          genre: detectGenre(allText),
          ticket_url: ticketUrl,
          image_url: null,
          description: null,
        });
      }
    });
  }

  return events;
}

/**
 * Extract a normalized date from an event element.
 * Prioritises the HTML `datetime` attribute on <time> tags (most reliable),
 * then tries Squarespace month+day components, then falls back to text content.
 */
function extractEventDate($el) {
  // 1. <time datetime="YYYY-MM-DD"> or <time datetime="YYYY-MM-DDTHH:mm">
  const timeEl = $el.find('time').first();
  if (timeEl.length) {
    const dt = timeEl.attr('datetime');
    if (dt) {
      const parsed = parseDate(dt);
      if (parsed) return parsed;
    }
  }

  // 2. Squarespace: separate month + day elements
  const month = $el.find('.eventlist-datetag-month').first().text().trim();
  const day = $el.find('.eventlist-datetag-day').first().text().trim();
  if (month && day) {
    // Squarespace doesn't embed the year in these elements; guess current/next year
    const year = new Date().getFullYear();
    const parsed = parseDate(`${month} ${day}, ${year}`);
    if (parsed) return parsed;
  }

  // 3. Fall back to text content of date-related elements
  const dateText = $el
    .find('time, .event-date, .eventlist-datetag-startdate, .summary-metadata--primary')
    .first()
    .text()
    .trim();
  return parseDate(dateText);
}

function extractEvent($, el, source) {
  const $el = $(el);
  const title = $el.find('h1, h2, h3, .event-title, .eventlist-title, .summary-title').first().text().trim();
  if (!title) return null;

  const ticketUrl =
    $el.find('a[href*="ticket"], a[href*="eventbrite"], a.buy-tickets').first().attr('href') ||
    $el.find('a').first().attr('href') ||
    null;

  const date = extractEventDate($el);
  const priceText = $el.find('.event-price, .price, .ticket-price').first().text().trim();
  const { priceMin, priceMax, priceText: normalizedPrice } = parsePrice(priceText);
  const description = $el.find('.event-description, .eventlist-description, .summary-excerpt, p').first().text().trim();
  const imageUrl = $el.find('img').first().attr('src') || null;
  const genre = detectGenre(`${title} ${description}`);

  // Try specific artist/lineup elements, fall back to parsing description lines
  const artistEl = $el
    .find('[itemprop="performer"] [itemprop="name"], [itemprop="performer"], .event-artist, .artist-name, .headliner, .lineup-item, .performer, .lineup')
    .first()
    .text()
    .trim();
  const artist = artistEl || extractLineup(description) || null;

  return {
    source,
    source_id: ticketUrl || title,
    title,
    artist,
    venue: 'Celebrities Night Club',
    city: 'Vancouver',
    date,
    price_min: priceMin,
    price_max: priceMax,
    price_text: normalizedPrice,
    genre,
    ticket_url: ticketUrl,
    image_url: imageUrl,
    description,
  };
}

module.exports = { scrape, SOURCE, DEFAULT_URL };
