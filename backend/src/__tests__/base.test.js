/**
 * Tests for base scraper utilities: detectGenre, parsePrice, parseDate,
 * fetchPageWithRetry, getNextUserAgent
 */
const { detectGenre, parsePrice, parseDate, getNextUserAgent, fetchPageWithRetry } = require('../scrapers/base');

describe('detectGenre', () => {
  test('detects electronic from "techno rave"', () => {
    expect(detectGenre('techno rave night')).toBe('electronic');
  });

  test('detects hip-hop from "hip hop concert"', () => {
    expect(detectGenre('hip hop concert')).toBe('hip-hop');
  });

  test('detects rock from "indie rock band"', () => {
    expect(detectGenre('indie rock band')).toBe('rock');
  });

  test('detects jazz from "jazz and blues evening"', () => {
    expect(detectGenre('jazz and blues evening')).toBe('jazz');
  });

  test('returns null for unrecognized text', () => {
    expect(detectGenre('some random event')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(detectGenre('')).toBeNull();
  });

  test('returns null for null input', () => {
    expect(detectGenre(null)).toBeNull();
  });
});

describe('parsePrice', () => {
  test('parses a single price', () => {
    const result = parsePrice('$20');
    expect(result.priceMin).toBe(20);
    expect(result.priceMax).toBe(20);
    expect(result.priceText).toBe('$20');
  });

  test('parses a price range', () => {
    const result = parsePrice('$20 - $40');
    expect(result.priceMin).toBe(20);
    expect(result.priceMax).toBe(40);
  });

  test('parses "Free"', () => {
    const result = parsePrice('Free');
    expect(result.priceMin).toBe(0);
    expect(result.priceMax).toBe(0);
    expect(result.priceText).toBe('Free');
  });

  test('returns nulls for empty string', () => {
    const result = parsePrice('');
    expect(result.priceMin).toBeNull();
    expect(result.priceMax).toBeNull();
    expect(result.priceText).toBeNull();
  });

  test('returns nulls for null input', () => {
    const result = parsePrice(null);
    expect(result.priceMin).toBeNull();
    expect(result.priceMax).toBeNull();
  });

  test('parses price with slash separator', () => {
    const result = parsePrice('$15 / $25');
    expect(result.priceMin).toBe(15);
    expect(result.priceMax).toBe(25);
  });
});

describe('parseDate', () => {
  test('returns YYYY-MM-DD unchanged', () => {
    expect(parseDate('2025-03-29')).toBe('2025-03-29');
  });

  test('extracts date from ISO datetime string', () => {
    expect(parseDate('2025-03-29T20:00:00')).toBe('2025-03-29');
  });

  test('extracts date from ISO datetime with space', () => {
    expect(parseDate('2025-03-29 20:00:00')).toBe('2025-03-29');
  });

  test('parses human-readable date string', () => {
    expect(parseDate('March 29, 2025')).toBe('2025-03-29');
  });

  test('parses abbreviated month string', () => {
    expect(parseDate('Mar 29, 2025')).toBe('2025-03-29');
  });

  test('returns null for null input', () => {
    expect(parseDate(null)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
  });

  test('returns null for month-only text that cannot be parsed', () => {
    // "Mar" alone cannot produce a valid date
    expect(parseDate('Mar')).toBeNull();
  });
});

describe('getNextUserAgent', () => {
  test('returns a non-empty string', () => {
    const ua = getNextUserAgent();
    expect(typeof ua).toBe('string');
    expect(ua.length).toBeGreaterThan(10);
  });

  test('rotates through multiple user agents', () => {
    const seen = new Set();
    // Call enough times to ensure we cycle through more than one UA
    for (let i = 0; i < 10; i++) {
      seen.add(getNextUserAgent());
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('fetchPageWithRetry', () => {
  const axios = require('axios');

  beforeEach(() => {
    jest.spyOn(axios, 'get');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('resolves on first success', async () => {
    axios.get.mockResolvedValueOnce({ data: '<html><body>OK</body></html>' });
    const { html } = await fetchPageWithRetry('http://example.com');
    expect(html).toContain('OK');
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test('retries on transient 500 error and eventually succeeds', async () => {
    const err = Object.assign(new Error('Server Error'), { response: { status: 500 } });
    axios.get
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ data: '<html><body>Recovered</body></html>' });

    const { html } = await fetchPageWithRetry('http://example.com', { retries: 2, baseDelay: 0 });
    expect(html).toContain('Recovered');
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  test('does not retry on 403 (definitive block)', async () => {
    const err = Object.assign(new Error('Forbidden'), { response: { status: 403 } });
    axios.get.mockRejectedValue(err);

    await expect(fetchPageWithRetry('http://example.com', { retries: 3, baseDelay: 0 }))
      .rejects.toMatchObject({ message: 'Forbidden' });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test('throws after exhausting all retries', async () => {
    const err = Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' });
    axios.get.mockRejectedValue(err);

    await expect(fetchPageWithRetry('http://example.com', { retries: 2, baseDelay: 0 }))
      .rejects.toMatchObject({ message: 'Timeout' });
    expect(axios.get).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});
