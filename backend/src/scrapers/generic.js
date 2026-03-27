/**
 * Generic event page scraper.
 * Tries JSON-LD structured data first, then Open Graph tags, then HTML fallbacks.
 * Returns a single event object (not saved to DB).
 */
const { fetchPage, parsePrice, parseDate } = require('./base');

/**
 * Extract a JSON-LD block of @type "Event" from a cheerio document.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {object|null}
 */
function extractJsonLd($) {
  let result = null;
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (result) return;
    try {
      const raw = $(el).html();
      if (!raw) return;
      const data = JSON.parse(raw);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item['@type'] === 'Event') {
          result = item;
          return false; // break
        }
        // Sometimes nested inside @graph
        if (item['@graph'] && Array.isArray(item['@graph'])) {
          const ev = item['@graph'].find((n) => n['@type'] === 'Event');
          if (ev) { result = ev; return false; }
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });
  return result;
}

/**
 * Resolve a possibly-relative URL against a base URL.
 */
function resolveUrl(href, baseUrl) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

/**
 * Scrape a single event page URL and return structured event data.
 * @param {string} url
 * @returns {Promise<object>}
 */
async function scrape(url) {
  const { $ } = await fetchPage(url);

  // --- JSON-LD (most reliable) ---
  const jsonLd = extractJsonLd($);

  let title = null;
  let date = null;
  let venue = null;
  let priceText = null;
  let ticketUrl = null;
  let imageUrl = null;
  let description = null;

  if (jsonLd) {
    title = jsonLd.name || null;

    // Date: prefer startDate
    const rawDate = jsonLd.startDate || jsonLd.doorTime || null;
    date = parseDate(rawDate);

    // Venue: location can be a Place or PostalAddress
    const loc = jsonLd.location;
    if (loc) {
      if (typeof loc === 'string') {
        venue = loc;
      } else if (loc.name) {
        venue = loc.name;
      } else if (loc['@type'] === 'PostalAddress') {
        venue = loc.addressLocality || loc.streetAddress || null;
      }
    }

    // Price: offers can be an Offer object or array
    const offers = jsonLd.offers;
    if (offers) {
      const offerList = Array.isArray(offers) ? offers : [offers];
      const prices = offerList
        .map((o) => o.price)
        .filter((p) => p != null && p !== '');
      if (prices.length > 0) {
        const nums = prices.map((p) => parseFloat(String(p).replace(/[^0-9.]/g, ''))).filter((n) => !isNaN(n));
        if (nums.length > 0) {
          const min = Math.min(...nums);
          const max = Math.max(...nums);
          // Map ISO currency codes to symbols; default to the code itself
          const currencyCode = (offerList[0]?.priceCurrency || '').toUpperCase();
          const currencySymbols = { USD: '$', CAD: '$', GBP: '£', EUR: '€', AUD: '$', NZD: '$' };
          const sym = currencySymbols[currencyCode] || (currencyCode ? `${currencyCode} ` : '');
          priceText = min === max ? `${sym}${min}` : `${sym}${min}–${sym}${max}`;
        }
        // Ticket URL from offers
        const offerUrl = offerList[0]?.url || offerList[0]?.['@id'] || null;
        ticketUrl = resolveUrl(offerUrl, url);
      }
    }

    // Image
    const img = jsonLd.image;
    if (img) {
      imageUrl = typeof img === 'string' ? img : (Array.isArray(img) ? img[0] : img.url || null);
      imageUrl = resolveUrl(imageUrl, url);
    }

    description = jsonLd.description || null;
  }

  // --- Open Graph fallbacks ---
  const og = (prop) => $(`meta[property="og:${prop}"]`).attr('content') || null;
  const meta = (name) => $(`meta[name="${name}"]`).attr('content') || null;

  if (!title) title = og('title') || $('title').text().trim() || null;
  if (!imageUrl) imageUrl = og('image') || null;
  if (!description) description = og('description') || meta('description') || null;

  // Ticket URL fallback: og:url or canonical
  if (!ticketUrl) {
    ticketUrl = og('url') || $('link[rel="canonical"]').attr('href') || url;
  }

  // --- HTML fallbacks for date, venue, price ---
  if (!date) {
    const timeEl = $('time').first();
    const rawDate =
      timeEl.attr('datetime') ||
      timeEl.text().trim() ||
      $('[class*="date"], [itemprop="startDate"]').first().attr('content') ||
      $('[class*="date"], [itemprop="startDate"]').first().text().trim() ||
      null;
    date = parseDate(rawDate);
  }

  if (!venue) {
    venue =
      $('[itemprop="name"][itemtype$="/Place"], [itemprop="location"] [itemprop="name"]').first().text().trim() ||
      $('[class*="venue"], [class*="location"]').first().text().trim() ||
      null;
    if (venue) venue = venue.replace(/\s+/g, ' ').trim();
    if (!venue) venue = null;
  }

  if (!priceText) {
    const rawPrice =
      $('[class*="price"], [itemprop="price"]').first().text().trim() ||
      $('[class*="ticket"]').first().text().trim() ||
      null;
    if (rawPrice) {
      const parsed = parsePrice(rawPrice);
      priceText = parsed.priceText;
    }
  }

  // Final ticket URL: look for a "buy tickets" / "get tickets" link
  if (!ticketUrl || ticketUrl === url) {
    const buyLink = $('a').filter((_i, el) => {
      const text = $(el).text().toLowerCase();
      const href = $(el).attr('href') || '';
      return (
        /buy|ticket|get ticket|purchase|register/i.test(text) ||
        /ticket|eventbrite|ticketmaster|universe\.com|dice\.fm|ra\.co\/events/i.test(href)
      );
    }).first().attr('href');
    if (buyLink) ticketUrl = resolveUrl(buyLink, url);
  }

  return {
    title: title || 'Event',
    date,
    venue,
    price_text: priceText,
    ticket_url: ticketUrl || url,
    image_url: imageUrl,
    description,
  };
}

module.exports = { scrape };
