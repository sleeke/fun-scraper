/**
 * Integration tests for the Ticketmaster API key and live scraper.
 *
 * These tests make real HTTP requests to the Ticketmaster Discovery API.
 * They are skipped automatically when TICKETMASTER_API_KEY is not present
 * in the environment, so the standard CI pipeline (`npm test`) stays green
 * without the secret.
 *
 * ─── Running locally ────────────────────────────────────────────────────
 * 1. Place your key in .env.local at the PROJECT ROOT (not in .github/plan/):
 *
 *      /fun-scraper/.env.local
 *      TICKETMASTER_API_KEY=<your-key>
 *
 *    Then run:
 *      npm --prefix backend test -- --testPathPattern=ticketmaster.integration
 *
 * 2. Or pass the key inline:
 *      TICKETMASTER_API_KEY=<your-key> npm --prefix backend test \
 *        -- --testPathPattern=ticketmaster.integration
 *
 * ─── Running in GitHub Actions ──────────────────────────────────────────
 * 1. Add TICKETMASTER_API_KEY as a repository secret
 *    (Settings → Secrets and variables → Actions → New repository secret)
 *
 * 2. The ci.yml workflow already exposes this secret to the backend-test job
 *    via `env: TICKETMASTER_API_KEY: ${{ secrets.TICKETMASTER_API_KEY }}`
 *    If the secret is absent or empty the tests are skipped, not failed.
 *
 * ─── Key diagnostic ─────────────────────────────────────────────────────
 * The Ticketmaster Developer Portal labels the credential as both
 * "API Key" and "Consumer Key" — they are THE SAME value for the
 * Discovery API v2. You do NOT need a Consumer Secret; only the single
 * key (`apikey` query parameter) is required.
 *
 * Expected key format: 32 alphanumeric characters, e.g.
 *   LeeQ0mcwJQ3eBDJVGqRcJ9S6y2ymFfAf
 */

// Load env from the project root .env.local (two directories above backend/)
// This mirrors the dotenv setup in backend/src/app.js so local dev works
// without exporting env vars manually.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env.local') });
// Secondary fallback: backend/.env (handy for CI without secrets file)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const axios = require('axios');

const API_KEY = process.env.TICKETMASTER_API_KEY;
const DISCOVERY_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

// Use describe.skip when the key is absent so the suite is clearly skipped,
// rather than failing, in environments where the secret is not configured.
const describeWhenKey = API_KEY ? describe : describe.skip;

// All live tests get a generous timeout to allow for network latency.
const TIMEOUT_MS = 20000;

// ─────────────────────────────────────────────────────────────────────────────
// Key presence and format
// ─────────────────────────────────────────────────────────────────────────────

describeWhenKey('Ticketmaster API key – presence and format', () => {
  test('API key is set in the environment', () => {
    // This test can only run when the suite is not skipped, so API_KEY is
    // guaranteed to be truthy here — it serves as explicit documentation.
    expect(API_KEY).toBeTruthy();
  });

  test('API key is a non-empty string', () => {
    expect(typeof API_KEY).toBe('string');
    expect(API_KEY.trim().length).toBeGreaterThan(0);
  });

  test('API key length matches expected Ticketmaster format (≥ 20 characters)', () => {
    // Ticketmaster Discovery API keys are 32 alphanumeric characters.
    // A shorter value almost certainly indicates a copy-paste error.
    expect(API_KEY.length).toBeGreaterThanOrEqual(20);
  });

  test('API key does not look like a placeholder', () => {
    expect(API_KEY).not.toMatch(/^(your[-_ ]?key|placeholder|test|xxxx|todo)/i);
    expect(API_KEY).not.toMatch(/^<.+>$/); // e.g. <YOUR_KEY>
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Direct HTTP validation against the Discovery API
// ─────────────────────────────────────────────────────────────────────────────

describeWhenKey('Ticketmaster Discovery API – direct HTTP validation', () => {
  test(
    'API returns HTTP 200 for a Vancouver music query',
    async () => {
      const res = await axios.get(DISCOVERY_URL, {
        params: {
          apikey: API_KEY,
          city: 'Vancouver',
          countryCode: 'CA',
          classificationName: 'music',
          size: 1,
        },
        timeout: 15000,
      });
      expect(res.status).toBe(200);
    },
    TIMEOUT_MS,
  );

  test(
    'response contains a "page" object with totalElements',
    async () => {
      const res = await axios.get(DISCOVERY_URL, {
        params: { apikey: API_KEY, city: 'Vancouver', countryCode: 'CA', size: 1 },
        timeout: 15000,
      });
      expect(res.data).toHaveProperty('page');
      expect(typeof res.data.page.totalElements).toBe('number');
    },
    TIMEOUT_MS,
  );

  test(
    'API rejects an obviously invalid key with 401',
    async () => {
      await expect(
        axios.get(DISCOVERY_URL, {
          params: { apikey: 'INVALID_KEY_000000000000000000000', size: 1 },
          timeout: 10000,
        }),
      ).rejects.toMatchObject({ response: { status: 401 } });
    },
    TIMEOUT_MS,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// scrape() end-to-end using the real scraper module
// ─────────────────────────────────────────────────────────────────────────────

describeWhenKey('Ticketmaster scraper – end-to-end live scrape', () => {
  // The scraper reads TICKETMASTER_API_KEY at module load time, so it must
  // be required AFTER dotenv has been called above.
  const { scrape } = require('../scrapers/ticketmaster');

  let events;

  beforeAll(async () => {
    events = await scrape();
  }, TIMEOUT_MS);

  test('scrape() returns an array', () => {
    expect(Array.isArray(events)).toBe(true);
  });

  test('scrape() returns at least one event for Vancouver', () => {
    // Ticketmaster has events year-round in Vancouver; if this fails the key
    // is being ignored (check the TICKETMASTER_API_KEY env var) or the
    // Ticketmaster API is down.
    expect(events.length).toBeGreaterThan(0);
  });

  test('every event has source === "ticketmaster"', () => {
    events.forEach((ev) => expect(ev.source).toBe('ticketmaster'));
  });

  test('every event has a non-empty string source_id', () => {
    events.forEach((ev) => {
      expect(typeof ev.source_id).toBe('string');
      expect(ev.source_id.length).toBeGreaterThan(0);
    });
  });

  test('every event has a non-empty title', () => {
    events.forEach((ev) => {
      expect(typeof ev.title).toBe('string');
      expect(ev.title.length).toBeGreaterThan(0);
    });
  });

  test('every event has a YYYY-MM-DD date', () => {
    events.forEach((ev) => {
      expect(ev.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  test('ticket URLs are absolute https URLs when present', () => {
    events
      .filter((ev) => ev.ticket_url != null)
      .forEach((ev) => {
        expect(ev.ticket_url).toMatch(/^https:\/\//);
      });
  });

  test('prices are non-negative numbers when present', () => {
    events
      .filter((ev) => ev.price_min != null)
      .forEach((ev) => {
        expect(ev.price_min).toBeGreaterThanOrEqual(0);
        expect(ev.price_max).toBeGreaterThanOrEqual(ev.price_min);
      });
  });

  test('source_ids are unique within a single scrape', () => {
    const ids = events.map((ev) => ev.source_id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
