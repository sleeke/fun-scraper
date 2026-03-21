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
      date: '2025-12-31',
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

describe('Scrape API', () => {
  test('GET /api/scrape/sources - returns source list', async () => {
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
