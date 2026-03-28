# fun-scraper — Backend

Node.js / Express API that scrapes live event listings, stores them in SQLite, and syncs
them to Vercel Blob for persistent cross-session storage.

---

## Quick start

```bash
# from repo root
npm run start:api          # starts Express on http://localhost:3001

# or directly
cd backend && node server.js
```

Environment variables are loaded from (in this order, higher wins):
1. `.env`
2. `.env.local` (project root — used for local development secrets)

---

## Project layout

```
backend/
  server.js              Entry point — binds Express to PORT (default 3001)
  src/
    app.js               Express app setup, middleware, route mounting,
                         cold-start Blob hydration
    db/
      schema.js          SQLite schema initialisation + runtime migrations
      blobSync.js        Vercel Blob persistence helpers (see below)
    routes/
      events.js          GET/POST/DELETE /api/events
      participants.js    POST/DELETE /api/events/:id/participants
      scrape.js          POST /api/scrape, GET /api/scrape/sources
    scrapers/
      base.js            Shared utilities: detectGenre, lookupArtistGenres
      index.js           Registry — maps source key → scraper module
      blueprint.js       Blueprint venue scraper
      celebrities.js     Celebrities venue scraper
      fortune.js         Fortune Sound Club scraper
      industrial236.js   Industrial 236 scraper
      redroom.js         Red Room scraper
      residentadvisor.js Resident Advisor scraper
      thisisblueprint.js This Is Blueprint scraper
      ticketmaster.js    Ticketmaster scraper
    __tests__/
      api.test.js        Integration tests (Supertest + Jest)
      base.test.js       Unit tests for scraper utilities
```

---

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Returns `{"status":"ok"}` |
| GET | `/` | Redirects to `/api/health` |
| GET | `/api/events` | List events (supports `search`, `venue`, `genre`, `source`, `date`, `page`, `limit`, `has_participants`) |
| GET | `/api/events/:id` | Single event + participant list |
| POST | `/api/events` | Create an event manually |
| DELETE | `/api/events/:id` | Delete an event |
| POST | `/api/scrape` | Trigger a scrape `{ source, url? }` |
| GET | `/api/scrape/sources` | List available scraper keys + default URLs |
| POST | `/api/events/:id/participants` | Add a participant |
| DELETE | `/api/events/:id/participants` | Remove a participant |

---

## Database

**SQLite** via `better-sqlite3`.

- Local path: `backend/data/events.db`
- On Vercel serverless: `/tmp/events.db` (ephemeral — recovered from Blob on cold start)

Schema is initialised and migrated automatically by `src/db/schema.js` on first `getDb()` call.

### Tables

**events** — scraped event records, unique on `(source, source_id)`.  
**participants** — people attending an event, FK → `events.id` with CASCADE delete.

---

## Vercel Blob persistence

Because the Vercel `/tmp` filesystem is wiped between deployments and cold starts, events
are additionally persisted to a **Vercel Blob** store (`fun-scraper-blob`).

### How it works

```
POST /api/scrape
  └─ scraper fetches events
  └─ events upserted into SQLite
  └─ prunePastEvents(db)          ← deletes events whose date < today
  └─ saveEventsToBlob(db)         ← uploads events/all.json to Vercel Blob (background)

App startup (cold start)
  └─ hydrateFromBlob(db)          ← if SQLite is empty, downloads events/all.json
                                     and upserts current (non-past) events
```

### Past-event filtering

Past events (date strictly before today's date) are **never stored** in Blob and are
**removed from SQLite** after each scrape. Events with no date are kept.

This ensures users always see a clean, future-only list without manual cleanup.

### Required environment variable

| Variable | Where |
|----------|-------|
| `BLOB_READ_WRITE_TOKEN` | Vercel project settings (auto-injected when blob store is linked); `.env.local` for local dev |

If the token is not set, both `saveEventsToBlob` and `hydrateFromBlob` log a warning
and return — the app continues working with whatever is in the local SQLite DB.

---

## Rate limiting

| Scope | Window | Max requests |
|-------|--------|--------------|
| All `/api/*` routes | 15 min | 200 |
| `POST /api/scrape` | 1 min | 10 |

---

## Scrapers

Each scraper in `src/scrapers/` exports:

```js
module.exports = {
  SOURCE,      // string key, e.g. 'blueprint'
  DEFAULT_URL, // string, the default page to scrape
  scrape,      // async (url) => Event[]
};
```

Adding a new scraper:
1. Create `src/scrapers/<name>.js` following the pattern in an existing scraper.
2. Register it in `src/scrapers/index.js`.
3. Add the key to the `SOURCES` array in `frontend/src/App.jsx`.

---

## Genre detection

Two-stage genre enrichment per scrape:
1. **Keyword detection** (`detectGenre` in `base.js`) — pattern-matches event title/description.
2. **MusicBrainz lookup** (`lookupArtistGenres`) — used for up to 10 unique artists per scrape
   where keyword detection gives no result. Results are merged, keeping the keyword-detected
   genre as primary.

---

## Running tests

```bash
# from repo root
npm test

# or directly
cd backend && npm test
```

Tests use Jest + Supertest. The hydration IIFE in `app.js` is skipped when
`NODE_ENV=test` to preserve test isolation.

---

## Recent changes

### March 2026 — Vercel Blob persistence

- **`src/db/blobSync.js`** (new) — `saveEventsToBlob`, `hydrateFromBlob`, `prunePastEvents`.
- **`src/app.js`** — added `.env.local` loading; added cold-start hydration IIFE.
- **`src/routes/scrape.js`** — calls `prunePastEvents` then `saveEventsToBlob` after each
  successful scrape.
- Past-event pruning added: events with `date < today` are deleted from SQLite on every
  scrape and excluded from Blob uploads/restores.
- Root route `/` added — redirects to `/api/health`.
