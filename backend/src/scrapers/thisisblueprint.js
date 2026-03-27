/**
 * Scraper for This Is Blueprint – Vancouver electronic / club events
 * https://thisisblueprint.com/
 *
 * The site uses a standard WordPress / The Events Calendar setup.
 */
const { fetchPage, detectGenre, parsePrice } = require('./base');

const SOURCE = 'thisisblueprint';
const DEFAULT_URL = 'https://thisisblueprint.com/events/';

async function scrape(url = DEFAULT_URL) {
  const { $ } = await fetchPage(url);
  const events = [];

  // The Events Calendar plugin (common WordPress events plugin) uses these selectors
  const selectors = [
    '.tribe-events-calendar-list__event-article',
    '.tribe-common-g-row.tribe-events-calendar-list__event-row',
    '.type-tribe_events',
    'article.tribe_events_cat',
    'article[id*="tribe_events"]',
    'article[class*="tribe"]',
    '.eventlist-event',
    '.event-item',
    'article',
  ];

  for (const sel of selectors) {
    if ($(sel).length === 0) continue;

    $(sel).each((_i, el) => {
      const event = extractEvent($, el);
      if (event) events.push(event);
    });

    if (events.length > 0) break;
  }

  // Fallback: look for /event/ links
  if (events.length === 0) {
    const seen = new Set();
    $('a[href*="/event"]').each((_i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      const title = $el.text().trim();
      if (!href || !title || title.length < 3 || seen.has(href)) return;
      seen.add(href);
      const ticketUrl = href.startsWith('http') ? href : `https://thisisblueprint.com${href}`;
      events.push({
        source: SOURCE,
        source_id: ticketUrl,
        title,
        artist: title,
        venue: 'This Is Blueprint',
        city: 'Vancouver',
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

function extractEvent($, el) {
  const $el = $(el);

  const title = $el
    .find(
      '.tribe-event-url, .tribe-events-calendar-list__event-title a, ' +
      'h1 a, h2 a, h3 a, .entry-title a, h1, h2, h3, .event-title'
    )
    .first()
    .text()
    .trim();

  if (!title || title.length < 2) return null;

  // Prefer ticket / detail links; fall back to first link
  const ticketUrl =
    $el.find('a[href*="ticket"], a[href*="eventbrite"], a[href*="dice"], a[href*="ra.co"]').first().attr('href') ||
    $el.find('a[href*="/event"]').first().attr('href') ||
    $el.find('a').first().attr('href') ||
    null;

  const normalizedTicketUrl =
    ticketUrl && !ticketUrl.startsWith('http')
      ? `https://thisisblueprint.com${ticketUrl}`
      : ticketUrl;

  const dateText =
    $el.find('time, .tribe-event-date-start, .tribe-events-schedule__datetime, .event-date').first().attr('datetime') ||
    $el.find('time, .tribe-event-date-start, .tribe-events-schedule__datetime, .event-date').first().text().trim() ||
    null;

  const venue =
    $el.find('.tribe-venue, .tribe-events-calendar-list__event-venue, .event-venue, .venue').first().text().trim() ||
    'This Is Blueprint';

  const priceText =
    $el.find('.tribe-tickets__sale_price, .tribe-ticket-cost, .event-price, .price').first().text().trim();
  const { priceMin, priceMax, priceText: normalizedPrice } = parsePrice(priceText);

  const description =
    $el.find('.tribe-events-calendar-list__event-description, .entry-content, .event-description, p').first().text().trim();

  const imageUrl =
    $el.find('img').first().attr('src') ||
    $el.find('img').first().attr('data-src') ||
    null;

  const genre = detectGenre(`${title} ${description}`);

  return {
    source: SOURCE,
    source_id: normalizedTicketUrl || title,
    title,
    artist: title,
    venue: venue || 'This Is Blueprint',
    city: 'Vancouver',
    date: dateText || null,
    time: null,
    price_min: priceMin,
    price_max: priceMax,
    price_text: normalizedPrice,
    genre,
    ticket_url: normalizedTicketUrl,
    image_url: imageUrl,
    description: description || null,
  };
}

module.exports = { scrape, SOURCE, DEFAULT_URL };
