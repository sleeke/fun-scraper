/**
 * Scraper for Blueprint Events Vancouver
 * https://www.blueprintevents.ca/events
 */
const { fetchPage, detectGenre, parsePrice, extractLineup } = require('./base');

const SOURCE = 'blueprint';
const DEFAULT_URL = 'https://www.blueprintevents.ca/events';

async function scrape(url = DEFAULT_URL) {
  const { $ } = await fetchPage(url);
  const events = [];

  // Blueprint uses a list of event cards
  $('article, .event-item, .tribe-events-calendar-list__event-article').each((_i, el) => {
    const $el = $(el);

    const title = $el.find('.tribe-event-url, .tribe-events-calendar-list__event-title, h2, h3').first().text().trim();
    if (!title) return;

    const ticketUrl =
      $el.find('a[href*="ticket"], a[href*="eventbrite"], a[href*="blueprintevents"]').first().attr('href') ||
      $el.find('a').first().attr('href') ||
      null;

    const dateText = $el.find('.tribe-event-date-start, time, .event-date').first().text().trim();
    const venue = $el.find('.tribe-venue, .event-venue, .venue').first().text().trim() || 'Blueprint Events Venue';
    const priceText = $el.find('.tribe-tickets__sale_price, .event-price, .price').first().text().trim();
    const { priceMin, priceMax, priceText: normalizedPrice } = parsePrice(priceText);
    const description = $el.find('.tribe-events-calendar-list__event-description, .event-description, p').first().text().trim();
    const imageUrl = $el.find('img').first().attr('src') || null;

    const allText = `${title} ${description}`;
    const genre = detectGenre(allText);

    // Try specific artist/lineup elements, fall back to parsing description lines
    const artistEl = $el
      .find('[itemprop="performer"] [itemprop="name"], [itemprop="performer"], .event-artist, .artist-name, .headliner, .lineup-item, .performer, .lineup')
      .first()
      .text()
      .trim();
    const artist = artistEl || extractLineup(description) || null;

    events.push({
      source: SOURCE,
      source_id: ticketUrl || title,
      title,
      artist,
      venue: venue || 'Blueprint Events Venue',
      city: 'Vancouver',
      date: dateText || null,
      price_min: priceMin,
      price_max: priceMax,
      price_text: normalizedPrice,
      genre,
      ticket_url: ticketUrl,
      image_url: imageUrl,
      description,
    });
  });

  return events;
}

module.exports = { scrape, SOURCE, DEFAULT_URL };
