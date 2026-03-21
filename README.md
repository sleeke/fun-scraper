# fun-scraper

A Progressive Web App (PWA) for discovering live music events happening near you in Vancouver, BC.

## Features

- **Scrape events** from multiple Vancouver venues:
  - [Blueprint Events](https://www.blueprintevents.ca/events)
  - [Ticketmaster](https://www.ticketmaster.ca) (requires API key)
  - [Celebrities Night Club](https://www.celebritiesnightclub.com/events)
  - [Red Room](https://redroom.ca/events)
  - [Fortune Sound Club](https://www.fortunesoundclub.com/events)
  - [Industrial 236](https://www.industrial236.com/events)
- **Search & filter** events by keyword, genre, and source
- **Event details**: venue, artist, date/time, price, ticket link
- **Music genre detection** from event metadata
- **Interest list**: add your name to attend an event (per-event participant list)
- **SQLite database** for persistent event storage
- **PWA**: installable, offline-capable (service worker caching)

## Project Structure

```
fun-scraper/
├── backend/          # Express API + scrapers + SQLite DB
│   ├── src/
│   │   ├── app.js
│   │   ├── db/schema.js
│   │   ├── routes/events.js
│   │   ├── routes/participants.js
│   │   ├── routes/scrape.js
│   │   └── scrapers/
│   │       ├── base.js           # shared utilities (fetchPage, detectGenre, parsePrice)
│   │       ├── blueprint.js
│   │       ├── ticketmaster.js
│   │       ├── celebrities.js
│   │       ├── redroom.js
│   │       ├── fortune.js
│   │       └── industrial236.js
│   └── server.js
└── frontend/         # React + Vite PWA
    └── src/
        ├── App.jsx
        ├── api/index.js
        ├── components/
        │   ├── EventCard.jsx
        │   ├── EventDetail.jsx
        │   ├── ScrapePanel.jsx
        │   └── Toast.jsx
        └── hooks/useToast.js
```

## Setup

### Prerequisites
- Node.js 18+
- npm 9+

### Install dependencies

```bash
npm run install:all
```

### Environment variables (optional)

Create `backend/.env`:
```
PORT=3001
TICKETMASTER_API_KEY=your_key_here   # optional, from developer.ticketmaster.com
```

### Run the API server

```bash
npm run start:api
# → http://localhost:3001
```

### Run the frontend (dev)

```bash
npm run start:web
# → http://localhost:5173
```

### Build frontend for production

```bash
npm run build
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/events` | List/search events (`?search=`, `?genre=`, `?source=`, `?page=`, `?limit=`) |
| GET | `/api/events/:id` | Get event + participants |
| POST | `/api/events` | Create event manually |
| DELETE | `/api/events/:id` | Delete event |
| GET | `/api/events/:id/participants` | List participants |
| POST | `/api/events/:id/participants` | Add participant `{ name }` |
| DELETE | `/api/events/:id/participants/:pid` | Remove participant |
| GET | `/api/scrape/sources` | List available scrapers |
| POST | `/api/scrape` | Trigger scrape `{ source, url? }` |

## Deploy to Vercel

The project is pre-configured for one-click Vercel deployment:

1. Push the repository to GitHub (already done).
2. Go to [vercel.com](https://vercel.com), import the repository.
3. Vercel auto-detects `vercel.json` — no framework or build settings need to be changed.
4. Click **Deploy**.

Vercel will:
- Install root dependencies (Express, SQLite, etc.) for the serverless API.
- Build the React/Vite frontend and serve it as static files.
- Route every `/api/*` request to the Express serverless function.

> **Note:** SQLite data stored in `/tmp` does not persist across cold-start function invocations on Vercel. This is fine for testing; add a hosted database (e.g. Turso, PlanetScale) for production persistence.

### Environment variables (optional)

Set these in the Vercel project dashboard under *Settings → Environment Variables*:

| Variable | Description |
|---|---|
| `TICKETMASTER_API_KEY` | Ticketmaster developer API key |
| `DB_PATH` | Override the SQLite file path (advanced) |

## Tests

```bash
npm test
# Runs 30 backend tests (Jest + Supertest)
```
