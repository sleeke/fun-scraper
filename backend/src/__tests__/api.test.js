/**
 * Integration tests for the Events and Participants API routes.
 * Uses an in-memory SQLite database via DB_PATH=:memory:
 */
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../app');
const { closeDb } = require('../db/schema');

afterAll(() => closeDb());

describe('GET /api/health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Events API', () => {
  let createdId;

  test('POST /api/events - creates an event', async () => {
    const res = await request(app).post('/api/events').send({
      title: 'Test Concert',
      artist: 'Test Artist',
      venue: 'Test Venue',
      city: 'Vancouver',
      date: '2099-12-31',
      price_text: '$25',
      price_min: 25,
      price_max: 25,
      genre: 'electronic',
      ticket_url: 'https://example.com/tickets/1',
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test Concert');
    expect(res.body.venue).toBe('Test Venue');
    createdId = res.body.id;
  });

  test('POST /api/events - returns 400 if title missing', async () => {
    const res = await request(app).post('/api/events').send({ venue: 'Some Venue' });
    expect(res.status).toBe(400);
  });

  test('GET /api/events - lists events', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);
  });

  test('GET /api/events?search=Test - filters events', async () => {
    const res = await request(app).get('/api/events?search=Test');
    expect(res.status).toBe(200);
    expect(res.body.events.some((e) => e.title === 'Test Concert')).toBe(true);
  });

  test('GET /api/events?search=NoMatch - returns empty', async () => {
    const res = await request(app).get('/api/events?search=NoMatchXYZ123');
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBe(0);
  });

  test('GET /api/events/:id - returns event with participants', async () => {
    const res = await request(app).get(`/api/events/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdId);
    expect(Array.isArray(res.body.participants)).toBe(true);
  });

  test('GET /api/events/:id - 404 for unknown id', async () => {
    const res = await request(app).get('/api/events/99999');
    expect(res.status).toBe(404);
  });

  test('DELETE /api/events/:id - deletes event', async () => {
    // Create a throwaway event
    const create = await request(app).post('/api/events').send({
      title: 'Delete Me',
      venue: 'Temp Venue',
    });
    const id = create.body.id;
    const del = await request(app).delete(`/api/events/${id}`);
    expect(del.status).toBe(200);
    const get = await request(app).get(`/api/events/${id}`);
    expect(get.status).toBe(404);
  });
});

describe('Participants API', () => {
  let eventId;
  let participantId;

  beforeAll(async () => {
    const res = await request(app).post('/api/events').send({
      title: 'Participant Test Event',
      venue: 'Participant Venue',
    });
    eventId = res.body.id;
  });

  test('POST /api/events/:id/participants - adds participant', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/participants`)
      .send({ name: 'Alice' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Alice');
    participantId = res.body.id;
  });

  test('POST /api/events/:id/participants - 409 on duplicate', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/participants`)
      .send({ name: 'Alice' });
    expect(res.status).toBe(409);
  });

  test('POST /api/events/:id/participants - 400 if name missing', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/participants`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('GET /api/events/:id/participants - lists participants', async () => {
    const res = await request(app).get(`/api/events/${eventId}/participants`);
    expect(res.status).toBe(200);
    expect(res.body.some((p) => p.name === 'Alice')).toBe(true);
  });

  test('DELETE /api/events/:id/participants/:pid - removes participant', async () => {
    const del = await request(app).delete(
      `/api/events/${eventId}/participants/${participantId}`
    );
    expect(del.status).toBe(200);
    const list = await request(app).get(`/api/events/${eventId}/participants`);
    expect(list.body.some((p) => p.id === participantId)).toBe(false);
  });
});

/**
 * Helper: today's date as YYYY-MM-DD using LOCAL time (mirrors the fix in events.js).
 */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Past-event exclusion', () => {
  test('GET /api/events returns events with today\'s LOCAL date', async () => {
    // This test would fail if the filter used UTC date (SQLite date('now'))
    // because in Pacific timezone it's often already the next UTC day.
    const todayLocal = localToday();

    const create = await request(app).post('/api/events').send({
      title: 'Todays Local Event',
      venue: 'Local Venue',
      date: todayLocal,
    });
    expect(create.status).toBe(201);
    const todayId = create.body.id;

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    const ids = res.body.events.map((e) => e.id);
    expect(ids).toContain(todayId);
  });

  test('GET /api/events does not return events with a past date', async () => {
    // Directly insert an event with a past date (bypasses scraper-level filter).
    const create = await request(app).post('/api/events').send({
      title: 'Old Past Concert',
      venue: 'Gone Venue',
      date: '2000-01-01',
    });
    expect(create.status).toBe(201);
    const pastId = create.body.id;

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    const ids = res.body.events.map((e) => e.id);
    expect(ids).not.toContain(pastId);
  });

  test('GET /api/events returns events with a future date', async () => {
    const create = await request(app).post('/api/events').send({
      title: 'Future Concert',
      venue: 'Future Venue',
      date: '2099-06-01',
    });
    expect(create.status).toBe(201);
    const futureId = create.body.id;

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    const ids = res.body.events.map((e) => e.id);
    expect(ids).toContain(futureId);
  });

  test('GET /api/events returns events with no date (date-unknown events are kept)', async () => {
    const create = await request(app).post('/api/events').send({
      title: 'Dateless Concert',
      venue: 'Mystery Venue',
    });
    expect(create.status).toBe(201);
    const undatedId = create.body.id;

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    const ids = res.body.events.map((e) => e.id);
    expect(ids).toContain(undatedId);
  });

  test('GET /api/events never returns any event with date < today', async () => {
    const res = await request(app).get('/api/events?limit=100');
    expect(res.status).toBe(200);
    const today = localToday();
    for (const ev of res.body.events) {
      if (ev.date) {
        expect(ev.date >= today).toBe(true);
      }
    }
  });
});


/**
 * Pagination correctness with a mix of past and future events.
 *
 * These tests are the primary guard against the "empty first pages" bug:
 * if `total` ever includes past events the pagination count will be too large,
 * causing the first N pages to render entirely empty because all past events
 * sort before future events (date ASC).
 *
 * Events are inserted directly into the in-memory DB via getDb() to avoid
 * overwhelming the test HTTP server with hundreds of sequential POST requests.
 */
describe('Pagination — total must reflect future-only events', () => {
  const { getDb } = require('../db/schema');

  /**
   * Bulk-insert `count` past or future events directly into SQLite.
   * Using a transaction so it's fast even for large counts.
   */
  function seedEvents(count, { past = false, prefix = 'Seed' } = {}) {
    const db = getDb();
    const date = past ? '2000-01-01' : '2099-06-01';
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO events
        (source, source_id, title, venue, date)
      VALUES ('test-pagination', ?, ?, 'Test Venue', ?)
    `);
    const insertMany = db.transaction((n) => {
      for (let i = 0; i < n; i++) {
        const label = `${past ? 'Past' : 'Future'}${prefix}${i}`;
        stmt.run(`pg-${label}`, label, date);
      }
    });
    insertMany(count);
  }

  /**
   * Clean up all events seeded by this suite so other test suites are unaffected.
   */
  function cleanup() {
    getDb().prepare("DELETE FROM events WHERE source = 'test-pagination'").run();
  }

  afterEach(() => cleanup());

  test('total equals future-event count even when DB contains many past events', async () => {
    seedEvents(21, { past: true, prefix: 'TotalA' });
    seedEvents(3, { past: false, prefix: 'TotalA' });

    const res = await request(app).get('/api/events?limit=20&source=test-pagination');
    expect(res.status).toBe(200);
    // total must reflect only future events — if it includes past events
    // pagination will show too many pages with empty content on the first pages
    expect(res.body.total).toBe(3);
    expect(res.body.events.length).toBe(3);
  });

  test('page 1 shows future events first, not empty, when DB has mostly past events', async () => {
    // Classic "empty first pages" scenario: 25 past + 5 future = 30 total
    // If WHERE clause fails, page 1 (offset 0) returns 20 past events (sorted date ASC)
    // and the client filters them away, leaving a blank page.
    seedEvents(25, { past: true, prefix: 'Page1B' });
    seedEvents(5, { past: false, prefix: 'Page1B' });

    const res = await request(app).get('/api/events?limit=20&source=test-pagination');
    expect(res.status).toBe(200);
    // total must equal 5 (only future)
    expect(res.body.total).toBe(5);
    // all 5 fit on page 1
    expect(res.body.events.length).toBe(5);
    // every returned event must have a future (or null) date
    const today = localToday();
    for (const ev of res.body.events) {
      if (ev.date) expect(ev.date >= today).toBe(true);
    }
  });

  test('multi-page pagination skips past events across page boundaries', async () => {
    // 40 past + 25 future — pages should be:
    //   page 1: 20 future events
    //   page 2:  5 future events
    // Without the WHERE fix, page 1 would be 20 PAST events and pages 2-3 would have
    // future events, causing the user to see "first pages are for discarded events".
    seedEvents(40, { past: true, prefix: 'MultiC' });
    seedEvents(25, { past: false, prefix: 'MultiC' });

    const p1 = await request(app).get('/api/events?limit=20&source=test-pagination');
    expect(p1.status).toBe(200);
    expect(p1.body.total).toBe(25);
    expect(p1.body.events.length).toBe(20);

    const p2 = await request(app).get('/api/events?limit=20&page=2&source=test-pagination');
    expect(p2.status).toBe(200);
    expect(p2.body.events.length).toBe(5);

    // Neither page should contain a past-dated event
    const allEvents = [...p1.body.events, ...p2.body.events];
    const today = localToday();
    for (const ev of allEvents) {
      if (ev.date) expect(ev.date >= today).toBe(true);
    }
  });

  test('page 3 of 3 does not exist when there are only 2 pages of future events', async () => {
    // If total is wrong (includes past), a third page might appear in the UI
    // but return empty results — exactly the "ghost pages" the user reported.
    seedEvents(50, { past: true, prefix: 'Ghost' });
    seedEvents(22, { past: false, prefix: 'Ghost' }); // 2 pages exactly

    const p1 = await request(app).get('/api/events?limit=20&source=test-pagination');
    expect(p1.body.total).toBe(22); // NOT 72

    // page 3 would be "ghost" — must return 0 events
    const p3 = await request(app).get('/api/events?limit=20&page=3&source=test-pagination');
    expect(p3.status).toBe(200);
    expect(p3.body.events.length).toBe(0);
  });
});

describe('Scrape API', () => {  test('GET /api/scrape/sources - returns source list', async () => {
    const res = await request(app).get('/api/scrape/sources');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const keys = res.body.map((s) => s.key);
    expect(keys).toContain('blueprint');
    expect(keys).toContain('ticketmaster');
    expect(keys).toContain('celebrities');
    expect(keys).toContain('redroom');
    expect(keys).toContain('fortune');
    expect(keys).toContain('industrial236');
    expect(keys).toContain('residentadvisor');
    expect(keys).toContain('thisisblueprint');
  });

  test('POST /api/scrape - 400 if source missing', async () => {
    const res = await request(app).post('/api/scrape').send({});
    expect(res.status).toBe(400);
  });

  test('POST /api/scrape - 404 for unknown source', async () => {
    const res = await request(app).post('/api/scrape').send({ source: 'nonexistent' });
    expect(res.status).toBe(404);
  });
});

describe('Events API - participant_names and has_participants', () => {
  let eventId;

  beforeAll(async () => {
    const res = await request(app).post('/api/events').send({
      title: 'Interest Filter Test Event',
      venue: 'Test Venue',
      date: '2099-12-25',
    });
    eventId = res.body.id;
    // Add a participant
    await request(app)
      .post(`/api/events/${eventId}/participants`)
      .send({ name: 'TestUser' });
  });

  test('GET /api/events - includes participant_names field', async () => {
    const res = await request(app).get(`/api/events?search=Interest+Filter+Test`);
    expect(res.status).toBe(200);
    const ev = res.body.events.find((e) => e.id === eventId);
    expect(ev).toBeDefined();
    expect(ev.participant_count).toBe(1);
    expect(ev.participant_names).toBe('TestUser');
  });

  test('GET /api/events?has_participants=true - only returns events with participants', async () => {
    const res = await request(app).get('/api/events?has_participants=true');
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThan(0);
    for (const ev of res.body.events) {
      expect(ev.participant_count).toBeGreaterThan(0);
    }
  });

  test('GET /api/events - events without participants have null participant_names', async () => {
    // Create an event with no participants
    const create = await request(app).post('/api/events').send({
      title: 'No Participants Event',
      venue: 'Empty Venue',
    });
    const res = await request(app).get(`/api/events?search=No+Participants+Event`);
    expect(res.status).toBe(200);
    const ev = res.body.events.find((e) => e.id === create.body.id);
    expect(ev).toBeDefined();
    expect(ev.participant_count).toBe(0);
    expect(ev.participant_names == null).toBe(true);
  });
});
