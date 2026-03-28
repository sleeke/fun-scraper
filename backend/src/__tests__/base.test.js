/**
 * Tests for base scraper utilities: detectGenre, parsePrice, parseDate, extractLineup
 */
const { detectGenre, parsePrice, parseDate, extractLineup } = require('../scrapers/base');

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

describe('extractLineup', () => {
  test('extracts artists from newline-separated description', () => {
    const desc = 'Four Tet\nObjekt b2b Paula Temple\nDoors 9PM · 19+';
    expect(extractLineup(desc)).toBe('Four Tet, Objekt b2b Paula Temple');
  });

  test('extracts artists separated by bullets on one line', () => {
    const desc = 'DJ1 • DJ2 • DJ3\nTickets $25';
    expect(extractLineup(desc)).toBe('DJ1, DJ2, DJ3');
  });

  test('stops at door-time logistics', () => {
    const desc = 'Peggy Gou\nFloating Points\nDoors open 9PM\nAge 19+';
    expect(extractLineup(desc)).toBe('Peggy Gou, Floating Points');
  });

  test('stops at ticket price info', () => {
    const desc = 'Bonobo\n$20 advance / $25 door';
    expect(extractLineup(desc)).toBe('Bonobo');
  });

  test('returns null for purely logistical description', () => {
    const desc = 'Doors open at 9PM. Age 19+. Tickets at the door.';
    expect(extractLineup(desc)).toBeNull();
  });

  test('returns null for null input', () => {
    expect(extractLineup(null)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(extractLineup('')).toBeNull();
  });
});
