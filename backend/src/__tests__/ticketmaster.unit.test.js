/**
 * Unit tests for the Ticketmaster scraper (backend/src/scrapers/ticketmaster.js).
 *
 * These tests never make real network requests — axios is mocked for the
 * entire file so the suite is fast, deterministic, and safe to run in CI
 * without any API key.
 */

const axios = require('axios');
const { scrape, SOURCE, DEFAULT_URL } = require('../scrapers/ticketmaster');

jest.mock('axios');

describe('Ticketmaster scraper – unit (mocked)', () => {
  afterEach(() => jest.resetAllMocks());

  // -----------------------------------------------------------------------
  // Module shape
  // -----------------------------------------------------------------------

  test('exports SOURCE constant "ticketmaster"', () => {
    expect(SOURCE).toBe('ticketmaster');
  });

  test('exports DEFAULT_URL pointing to the Discovery API', () => {
    expect(DEFAULT_URL).toBe('https://app.ticketmaster.com/discovery/v2/events.json');
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  test('returns [] when the API responds with 401 (missing/invalid key)', async () => {
    const err = new Error('Unauthorized');
    err.response = { status: 401 };
    axios.get.mockRejectedValue(err);

    await expect(scrape()).resolves.toEqual([]);
  });

  test('re-throws non-401 errors so callers can handle them', async () => {
    const err = new Error('Internal Server Error');
    err.response = { status: 500 };
    axios.get.mockRejectedValue(err);

    await expect(scrape()).rejects.toThrow('Internal Server Error');
  });

  test('re-throws network errors (no response object)', async () => {
    axios.get.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(scrape()).rejects.toThrow('ECONNREFUSED');
  });

  // -----------------------------------------------------------------------
  // Empty / missing data
  // -----------------------------------------------------------------------

  test('returns [] when the API response has no _embedded key', async () => {
    axios.get.mockResolvedValue({ data: {} });
    await expect(scrape()).resolves.toEqual([]);
  });

  test('returns [] when _embedded.events is an empty array', async () => {
    axios.get.mockResolvedValue({ data: { _embedded: { events: [] } } });
    await expect(scrape()).resolves.toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Field mapping — full event
  // -----------------------------------------------------------------------

  test('maps a complete API event object to the correct output shape', async () => {
    const mockEvent = {
      id: 'TM001',
      name: 'Test Artist Live',
      url: 'https://www.ticketmaster.com/event/TM001',
      info: 'An amazing show.',
      dates: { start: { localDate: '2026-05-01', localTime: '20:00:00' } },
      images: [
        { ratio: '4_3', width: 1024, url: 'https://example.com/wrong.jpg' },
        { ratio: '16_9', width: 640, url: 'https://example.com/correct.jpg' },
      ],
      priceRanges: [{ min: 25, max: 50 }],
      classifications: [
        { genre: { name: 'Electronic' }, subGenre: { name: 'Techno' } },
      ],
      _embedded: {
        venues: [{ name: 'Test Venue', city: { name: 'Vancouver' } }],
      },
    };
    axios.get.mockResolvedValue({ data: { _embedded: { events: [mockEvent] } } });

    const [ev] = await scrape();
    expect(ev.source).toBe('ticketmaster');
    expect(ev.source_id).toBe('TM001');
    expect(ev.title).toBe('Test Artist Live');
    expect(ev.artist).toBe('Test Artist Live');
    expect(ev.venue).toBe('Test Venue');
    expect(ev.city).toBe('Vancouver');
    expect(ev.date).toBe('2026-05-01');
    expect(ev.time).toBe('20:00:00');
    expect(ev.price_min).toBe(25);
    expect(ev.price_max).toBe(50);
    expect(ev.price_text).toBe('$25 - $50');
    expect(ev.genre).toBe('electronic');
    expect(ev.ticket_url).toBe('https://www.ticketmaster.com/event/TM001');
    expect(ev.image_url).toBe('https://example.com/correct.jpg');
    expect(ev.description).toBe('An amazing show.');
  });

  // -----------------------------------------------------------------------
  // Image selection
  // -----------------------------------------------------------------------

  test('prefers a 16_9 image wider than 500 px over other images', async () => {
    axios.get.mockResolvedValue({
      data: {
        _embedded: {
          events: [{
            id: 'TM002',
            name: 'Image Test Event',
            dates: { start: { localDate: '2026-06-01' } },
            images: [
              { ratio: '16_9', width: 400, url: 'https://example.com/too-small.jpg' },
              { ratio: '16_9', width: 800, url: 'https://example.com/preferred.jpg' },
              { ratio: '4_3',  width: 1200, url: 'https://example.com/wrong-ratio.jpg' },
            ],
            _embedded: { venues: [{ name: 'Venue', city: { name: 'Vancouver' } }] },
          }],
        },
      },
    });

    const [ev] = await scrape();
    expect(ev.image_url).toBe('https://example.com/preferred.jpg');
  });

  test('falls back to first image when no 16_9 image wider than 500 px exists', async () => {
    axios.get.mockResolvedValue({
      data: {
        _embedded: {
          events: [{
            id: 'TM003',
            name: 'Small Image Event',
            dates: { start: { localDate: '2026-06-01' } },
            images: [
              { ratio: '4_3', width: 300, url: 'https://example.com/fallback.jpg' },
            ],
            _embedded: { venues: [{ name: 'Venue', city: { name: 'Vancouver' } }] },
          }],
        },
      },
    });

    const [ev] = await scrape();
    expect(ev.image_url).toBe('https://example.com/fallback.jpg');
  });

  // -----------------------------------------------------------------------
  // Optional / missing fields
  // -----------------------------------------------------------------------

  test('handles a minimal event with no optional fields', async () => {
    axios.get.mockResolvedValue({
      data: {
        _embedded: {
          events: [{
            id: 'TM004',
            name: 'Minimal Event',
            dates: { start: { localDate: '2026-07-01' } },
            _embedded: { venues: [{}] },
          }],
        },
      },
    });

    const [ev] = await scrape();
    expect(ev.price_min).toBeNull();
    expect(ev.price_max).toBeNull();
    expect(ev.price_text).toBeNull();
    expect(ev.ticket_url).toBeNull();
    expect(ev.image_url).toBeNull();
    expect(ev.description).toBeNull();
    expect(ev.venue).toBe('Unknown Venue');
    expect(ev.city).toBe('Vancouver'); // default city
    expect(ev.time).toBeNull();
  });

  test('uses pleaseNote as description when info is absent', async () => {
    axios.get.mockResolvedValue({
      data: {
        _embedded: {
          events: [{
            id: 'TM005',
            name: 'PleaseNote Event',
            dates: { start: { localDate: '2026-08-01' } },
            pleaseNote: 'Please bring ID.',
            _embedded: { venues: [{ name: 'Venue', city: { name: 'Vancouver' } }] },
          }],
        },
      },
    });

    const [ev] = await scrape();
    expect(ev.description).toBe('Please bring ID.');
  });

  test('price_text is null when priceRanges is absent', async () => {
    axios.get.mockResolvedValue({
      data: {
        _embedded: {
          events: [{
            id: 'TM006',
            name: 'No Price Event',
            dates: { start: { localDate: '2026-09-01' } },
            _embedded: { venues: [{ name: 'Venue', city: { name: 'Vancouver' } }] },
          }],
        },
      },
    });

    const [ev] = await scrape();
    expect(ev.price_text).toBeNull();
  });

  test('price_text omits range when min equals max', async () => {
    axios.get.mockResolvedValue({
      data: {
        _embedded: {
          events: [{
            id: 'TM007',
            name: 'Fixed Price Event',
            dates: { start: { localDate: '2026-09-15' } },
            priceRanges: [{ min: 30, max: 30 }],
            _embedded: { venues: [{ name: 'Venue', city: { name: 'Vancouver' } }] },
          }],
        },
      },
    });

    const [ev] = await scrape();
    expect(ev.price_text).toBe('$30');
    expect(ev.price_min).toBe(30);
    expect(ev.price_max).toBe(30);
  });

  // -----------------------------------------------------------------------
  // Genre detection
  // -----------------------------------------------------------------------

  test('derives genre from classification names when available', async () => {
    axios.get.mockResolvedValue({
      data: {
        _embedded: {
          events: [{
            id: 'TM008',
            name: 'Hip Hop Night',
            dates: { start: { localDate: '2026-10-01' } },
            classifications: [{ genre: { name: 'Hip-Hop/Rap' }, subGenre: { name: 'Hip Hop' } }],
            _embedded: { venues: [{ name: 'Venue', city: { name: 'Vancouver' } }] },
          }],
        },
      },
    });

    const [ev] = await scrape();
    expect(ev.genre).toBe('hip-hop');
  });

  test('returns multiple events when the API response contains multiple events', async () => {
    const makeEvent = (id) => ({
      id,
      name: `Event ${id}`,
      dates: { start: { localDate: '2026-11-01' } },
      _embedded: { venues: [{ name: 'Venue', city: { name: 'Vancouver' } }] },
    });
    axios.get.mockResolvedValue({
      data: { _embedded: { events: [makeEvent('A'), makeEvent('B'), makeEvent('C')] } },
    });

    const events = await scrape();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.source_id)).toEqual(['A', 'B', 'C']);
  });
});
