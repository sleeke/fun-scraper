/**
 * Unit tests for the blueprint scraper.
 * HTTP calls are mocked — no real network required.
 */
const axios = require('axios');

jest.mock('axios');

const { scrape, SOURCE, DEFAULT_URL } = require('../scrapers/blueprint');

describe('blueprint scraper – exports', () => {
  test('SOURCE is "blueprint"', () => {
    expect(SOURCE).toBe('blueprint');
  });

  test('DEFAULT_URL points to thisisblueprint.com', () => {
    expect(DEFAULT_URL).toMatch(/thisisblueprint\.com/);
  });
});

describe('blueprint scraper – structured card parsing', () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({
      data: `
        <html><body>
          <article class="tribe-events-calendar-list__event-article">
            <h2 class="tribe-events-calendar-list__event-title">
              <a href="/events/techno-night/">Techno Night</a>
            </h2>
            <time datetime="2099-07-15T22:00:00">July 15, 2099</time>
            <span class="tribe-venue">Blueprint</span>
            <span class="tribe-tickets__sale_price">$25</span>
            <div class="tribe-events-calendar-list__event-description">Deep techno session</div>
            <a class="ticket-link" href="https://dice.fm/event/techno-night">Buy Tickets</a>
          </article>
        </html></body>
      `,
    });
  });

  afterEach(() => jest.resetAllMocks());

  test('returns at least one event', async () => {
    const events = await scrape();
    expect(events.length).toBeGreaterThan(0);
  });

  test('event has correct source', async () => {
    const [event] = await scrape();
    expect(event.source).toBe('blueprint');
  });

  test('event title is parsed', async () => {
    const [event] = await scrape();
    expect(event.title).toBe('Techno Night');
  });

  test('event date is normalised to YYYY-MM-DD', async () => {
    const [event] = await scrape();
    expect(event.date).toBe('2099-07-15');
  });

  test('event city is Vancouver', async () => {
    const [event] = await scrape();
    expect(event.city).toBe('Vancouver');
  });

  test('price_min is parsed', async () => {
    const [event] = await scrape();
    expect(event.price_min).toBe(25);
  });

  test('genre is detected from description', async () => {
    const [event] = await scrape();
    expect(event.genre).toBe('electronic');
  });

  test('ticket_url uses dice.fm link', async () => {
    const [event] = await scrape();
    expect(event.ticket_url).toContain('dice.fm');
  });
});

describe('blueprint scraper – link fallback', () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({
      data: `
        <html><body>
          <a href="/events/house-music-night/">House Music Night</a>
          <a href="/events/jungle-party/">Jungle Party</a>
        </html></body>
      `,
    });
  });

  afterEach(() => jest.resetAllMocks());

  test('returns events via fallback link scan', async () => {
    const events = await scrape();
    expect(events.length).toBeGreaterThan(0);
  });

  test('fallback event title is the link text', async () => {
    const events = await scrape();
    const titles = events.map((e) => e.title);
    expect(titles).toContain('House Music Night');
  });

  test('fallback event source_id is an absolute URL', async () => {
    const events = await scrape();
    events.forEach((e) => {
      expect(e.source_id).toMatch(/^https?:\/\//);
    });
  });
});

describe('blueprint scraper – empty page', () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({ data: '<html><body></body></html>' });
  });

  afterEach(() => jest.resetAllMocks());

  test('returns empty array for blank page', async () => {
    const events = await scrape();
    expect(events).toEqual([]);
  });
});
