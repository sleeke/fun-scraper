/**
 * Scraper for Fortune Sound Club Vancouver
 * https://www.fortunesoundclub.com/events
 */
const { fetchPage, detectGenre, parsePrice, parseDate, extractLineup } = require('./base');

const SOURCE = 'fortune';
const DEFAULT_URL = 'https://www.fortunesoundclub.com/events';

async function scrape(url = DEFAULT_URL) {
  const { $ } = await fetchPage(url);
  const events = [];

  const selectors = [
    '.event-item',
    '.tribe-events-calendar-list__event-article',
    'article',
    '.entry',
    '.eventlist-event',
    '.sqs-block-content .summary-item',
  ];

  for (const sel of selectors) {
    if ($(sel).length > 0) {
      $(sel).each((_i, el) => {
        const event = extractEvent($, el);
        if (event) events.push(event);
      });
      break;
    }
  }

  return events;
}

function extractEvent($, el) {
  const $el = $(el);
  const title = $el.find('h1, h2, h3, .event-title, .tribe-events-calendar-list__event-title').first().text().trim();
  if (!title) return null;

  const ticketUrl =
    $el.find('a[href*="ticket"], a[href*="eventbrite"], a[href*="dice"], a[href*="fortune"]').first().attr('href') ||
    $el.find('a').first().attr('href') ||
    null;

  // Prefer datetime attribute on <time> elements; fall back to text
  const timeEl = $el.find('time').first();
  const dateRaw =
    (timeEl.length && timeEl.attr('datetime')) ||
    $el.find('time, .event-date, .tribe-event-date-start').first().text().trim() ||
    null;
  const date = parseDate(dateRaw);

  const priceText = $el.find('.tribe-tickets__sale_price, .event-price, .price').first().text().trim();
  const { priceMin, priceMax, priceText: normalizedPrice } = parsePrice(priceText);
  const description = $el.find('.tribe-events-calendar-list__event-description, .event-description, p').first().text().trim();
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
    source: SOURCE,
    source_id: ticketUrl || title,
    title,
    artist,
    venue: 'Fortune Sound Club',
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
