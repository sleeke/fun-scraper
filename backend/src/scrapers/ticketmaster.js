/**
 * Scraper for Ticketmaster events in Vancouver
 * Uses Ticketmaster Discovery API v2 (no auth needed for basic search)
 */
const axios = require('axios');
const { detectGenre, parsePrice } = require('./base');

const SOURCE = 'ticketmaster';
const DEFAULT_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
const API_KEY = process.env.TICKETMASTER_API_KEY || '';

async function scrape(url = DEFAULT_URL) {
  const params = {
    city: 'Vancouver',
    countryCode: 'CA',
    classificationName: 'music',
    size: 50,
    sort: 'date,asc',
  };
  if (API_KEY) params.apikey = API_KEY;

  let response;
  try {
    response = await axios.get(url, { params, timeout: 15000 });
  } catch (err) {
    // If API key is not set or request fails, return empty
    if (err.response && err.response.status === 401) {
      console.warn('[ticketmaster] API key required. Set TICKETMASTER_API_KEY env var.');
      return [];
    }
    throw err;
  }

  const data = response.data;
  const rawEvents = data?._embedded?.events || [];

  return rawEvents.map((ev) => {
    const venue = ev._embedded?.venues?.[0];
    const venueName = venue?.name || 'Unknown Venue';
    const city = venue?.city?.name || 'Vancouver';

    const priceRange = ev.priceRanges?.[0];
    const priceText = priceRange
      ? `$${priceRange.min}${priceRange.max !== priceRange.min ? ` - $${priceRange.max}` : ''}`
      : null;
    const { priceMin, priceMax } = parsePrice(priceText);

    const classificationText = [
      ev.classifications?.[0]?.genre?.name,
      ev.classifications?.[0]?.subGenre?.name,
      ev.name,
    ]
      .filter(Boolean)
      .join(' ');
    const genre = detectGenre(classificationText) || ev.classifications?.[0]?.genre?.name?.toLowerCase() || null;

    const ticketUrl = ev.url || null;
    const imageUrl = ev.images?.find((img) => img.ratio === '16_9' && img.width > 500)?.url || ev.images?.[0]?.url || null;

    const start = ev.dates?.start;
    const date = start?.localDate || null;
    const time = start?.localTime || null;

    return {
      source: SOURCE,
      source_id: ev.id,
      title: ev.name,
      artist: ev.name,
      venue: venueName,
      city,
      date,
      time,
      price_min: priceMin,
      price_max: priceMax,
      price_text: priceText,
      genre,
      ticket_url: ticketUrl,
      image_url: imageUrl,
      description: ev.info || ev.pleaseNote || null,
    };
  });
}

module.exports = { scrape, SOURCE, DEFAULT_URL };
