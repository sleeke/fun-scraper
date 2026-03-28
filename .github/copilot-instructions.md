# Project Instructions

## What this project is

**fun-scraper** — a PWA for discovering live events in Vancouver. It scrapes event
listings from multiple venue and ticketing websites, stores them in a local SQLite
database, and presents them through a React frontend with search, filtering, and
participant-tracking features.

## Tech stack

- **Backend:** Node.js (CommonJS), Express 4, better-sqlite3
- **Frontend:** React 19, Vite 8, vite-plugin-pwa (Workbox)
- **Scraping:** Axios + Cheerio, with MusicBrainz API for genre enrichment
- **Database:** SQLite via better-sqlite3 (file at `backend/data/events.db`, `/tmp/events.db` on Vercel)
- **Hosting:** Vercel (serverless), Vercel Blob for persistent storage
- **Package manager:** npm (workspaces are NOT used — `backend/` and `frontend/` have independent `package.json` files)

## Architecture

Monorepo with two independent packages:

```
backend/           → Express API server (CommonJS)
  server.js        → Entry point
  src/app.js       → Express app setup, middleware, route mounting
  src/db/schema.js → SQLite schema, migrations, getDb()
  src/routes/      → Express routers (events, participants, scrape)
  src/scrapers/    → One file per source; each exports { scrape, SOURCE, DEFAULT_URL }
frontend/          → React SPA (ES modules)
  src/App.jsx      → Main component with filtering, search, pagination
  src/api/index.js → Fetch wrapper for all API calls
  src/components/  → EventCard, EventDetail, ScrapePanel, Toast
  src/hooks/       → useToast
```

### API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/events` | List events (search, venue, genre, source, date, page, limit, has_participants) |
| GET | `/api/events/:id` | Single event + participants |
| POST | `/api/events` | Create event manually |
| DELETE | `/api/events/:id` | Delete event |
| POST | `/api/scrape` | Trigger scrape `{ source, url? }` |
| GET | `/api/scrape/sources` | List available scrapers |
| POST/DELETE | `/api/events/:eventId/participants` | Manage participants |

### Scrapers

Each scraper in `backend/src/scrapers/` exports `{ scrape, SOURCE, DEFAULT_URL }`.
Current sources: `blueprint`, `ticketmaster`, `celebrities`, `redroom`, `fortune`,
`industrial236`, `residentadvisor`, `thisisblueprint`.

To add a new scraper:
1. Create `backend/src/scrapers/<name>.js` following the pattern in existing scrapers
2. Register it in `backend/src/scrapers/index.js`
3. Add the source key to the `SOURCES` array in `frontend/src/App.jsx`

### Database schema

Two tables: `events` (with UNIQUE on `source, source_id`) and `participants`
(with FK to events). Schema defined in `backend/src/db/schema.js` with
runtime migrations for new columns (e.g. `genres`).

## Architecture rules

- Backend is CommonJS (`require`/`module.exports`). Frontend is ES modules (`import`/`export`).
- All API routes are mounted under `/api` in `src/app.js`.
- Rate limiting is applied globally (200 req/15 min) and more strictly on `/api/scrape` (10 req/min).
- Scraper results are upserted via `ON CONFLICT(source, source_id) DO UPDATE`.
- Genre detection uses keyword matching (`detectGenre`) plus optional MusicBrainz lookup (`lookupArtistGenres`), capped at 10 artist lookups per scrape.
- The frontend uses a relative `/api` base path — Vite proxies to the backend in dev; Vercel rewrites handle it in production.

## Styling conventions

- Frontend uses plain CSS in `src/index.css` — no CSS framework.
- Dark theme with `#1a1a2e` as primary background.

## Testing conventions

- **Backend tests:** Jest + Supertest in `backend/src/__tests__/`
- Test files: `api.test.js` (API integration), `base.test.js` (scraper utilities)
- Run: `npm --prefix backend test` or `cd backend && npm test`

## CI commands

- Install all: `npm run install:all`
- Backend tests: `npm test` (runs from root, delegates to backend)
- Frontend lint: `npm --prefix frontend run lint`
- Frontend build: `npm run build`
- Start API: `npm run start:api`
- Start frontend dev: `npm run start:web`

## Deployment

- Platform: Vercel
- Build command: `npm --prefix frontend install --legacy-peer-deps && npm --prefix frontend run build`
- Backend runs as Vercel serverless functions
- Persistent storage: Vercel Blob (store name: `fun-scraper-blob`)
- Environment variable: `BLOB_READ_WRITE_TOKEN` (auto-injected by Vercel when blob store is linked)

## Key files

- [plan/ROADMAP.md](../plan/ROADMAP.md) — feature backlog
- [.github/agents/README.md](agents/README.md) — agent system overview
- [ADAPTING.md](../ADAPTING.md) — instructions for adapting the agent team
