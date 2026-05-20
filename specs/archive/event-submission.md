# Spec: Event Submission

**Slug:** event-submission  
**Date:** 2026-05-19  
**Status:** approved

---

## Summary

Allow users to submit events via a URL-based form. The backend previews the event
by scraping the supplied URL with a generic extractor. The user reviews the extracted
details in editable fields and confirms submission. Submitted events are stored with
`source = 'user_submitted'` and are filterable in the event list.

---

## Current behaviour

Events can only enter the database through the admin Scrape panel (registered
scrapers) or directly via `POST /api/events`. There is no user-facing submission
path.

---

## Requirements

1. A "Submit Event" panel is available in the main UI alongside the existing ScrapePanel.
2. The user enters a URL (http/https only) and clicks "Fetch Details".
3. The backend scrapes the URL and returns a best-effort event preview (no DB write).
4. The preview is displayed in editable fields: title, artist, venue, city, date, time,
   price\_text, genre, ticket\_url, image\_url, description.
5. The user may edit any field before confirming.
6. Clicking "Submit Event" saves the event to the database with `source = 'user_submitted'`
   and `source_id` set to the submitted URL (capped at 500 chars).
7. On success, the event list refreshes and a toast notification confirms the submission.
8. The source filter dropdown gains a "User Submitted" option (`value = 'user_submitted'`).
9. The backend preview endpoint is covered by the existing `/api/scrape` rate limiter
   (10 req / min).

---

## Design token / constant changes

| Location | Change |
|----------|--------|
| `frontend/src/App.jsx` — `SOURCES` | Add `'user_submitted'` |
| `frontend/src/App.jsx` — `SOURCE_LABELS` | Add `user_submitted: 'User Submitted'` |

---

## Affected files

| File | Change |
|------|--------|
| `backend/src/routes/scrape.js` | Add `POST /api/scrape/preview` endpoint |
| `backend/src/scrapers/generic.js` | New generic URL scraper (OG tags + JSON-LD + heuristics) |
| `frontend/src/api/index.js` | Add `api.previewEvent(url)` |
| `frontend/src/components/SubmitEventForm.jsx` | New component |
| `frontend/src/App.jsx` | Render `SubmitEventForm`, update SOURCES / SOURCE\_LABELS |
| `backend/src/__tests__/api.test.js` | Tests for preview endpoint |

---

## Acceptance criteria

### AC-1: URL validation (backend)
**Given** `POST /api/scrape/preview` receives a body without `url`  
**When** the request is processed  
**Then** the response is HTTP 400 with `{ error: 'url is required' }`

### AC-2: URL scheme enforcement (backend)
**Given** `POST /api/scrape/preview` receives `{ url: 'ftp://example.com' }`  
**When** the request is processed  
**Then** the response is HTTP 400 with `{ error: 'url must be http or https' }`

### AC-3: Successful preview (backend)
**Given** `POST /api/scrape/preview` receives a valid http/https URL  
**When** the target page is reachable  
**Then** the response is HTTP 200 with a JSON object containing at least `{ title, venue }`
and optional fields `artist, date, time, price_text, genre, ticket_url, image_url, description`

### AC-4: Preview does not persist (backend)
**Given** a successful call to `POST /api/scrape/preview`  
**When** `GET /api/events` is called immediately after  
**Then** no new event appears in the list

### AC-5: Source filter includes user_submitted (frontend)
**Given** the main event list page is loaded  
**When** the source dropdown is inspected  
**Then** "User Submitted" is a selectable option

### AC-6: Fetch Details renders preview form (frontend / integration)
**Given** the user enters a valid URL in the Submit Event form  
**When** the user clicks "Fetch Details"  
**Then** editable fields are rendered pre-populated with the extracted event data

### AC-9: Known-scraper routing (backend)
**Given** `POST /api/scrape/preview` receives a URL whose hostname matches a registered
scraper's `DEFAULT_URL` hostname  
**When** the request is processed  
**Then** the response uses that registered scraper's extraction logic (not the generic
scraper), and the returned event has `source = 'user_submitted'`

### AC-10: Preview error displayed in UI (frontend)
**Given** the user enters a URL that cannot be fetched (e.g. unreachable host)  
**When** the user clicks "Fetch Details"  
**Then** a clear error message is shown inline in the form — no silent failure

### AC-11: Submit validation errors displayed in UI (frontend)
**Given** the user clears the title field in the preview form and clicks "Submit Event"  
**When** the submission is attempted  
**Then** an inline error on the title field explains that the field is required

### AC-7: Submit saves event with correct source (backend)
**Given** `POST /api/events` is called with `source = 'user_submitted'` and a valid title/venue  
**When** the request is processed  
**Then** the response is HTTP 201 and the returned event has `source = 'user_submitted'`

### AC-8: Submitted events filterable by source (backend)
**Given** an event exists with `source = 'user_submitted'`  
**When** `GET /api/events?source=user_submitted` is called  
**Then** that event appears in the results

---

## Testing instructions

1. `cd backend && npm test` — all existing and new tests must pass.
2. Manually: start backend + frontend, open the site, expand "Submit Event",
   enter a real event URL, verify the preview populates, edit a field, submit,
   and confirm the event appears in the list.

---

## Implementation notes

### Generic scraper (`backend/src/scrapers/generic.js`)
- Use `fetchPage` from `base.js` (already handles user-agent rotation and retries).
- Extraction order (each step fills gaps left by the previous):
  1. **JSON-LD** — look for `<script type="application/ld+json">` blocks; find the
     first object with `@type` matching `Event` or `MusicEvent`. Map schema.org fields:
     `name → title`, `location.name → venue`, `startDate → date + time`,
     `performer.name → artist`, `image → image_url`, `description → description`,
     `url → ticket_url`, `offers.price / offers.priceCurrency → price_text`.
  2. **Open Graph** — fill remaining gaps from `og:title`, `og:description`, `og:image`.
  3. **HTML heuristics** — `<h1>` for title fallback; date patterns from visible text for
     date fallback; first `<img>` with width/height for image fallback.
- Always set `source = 'user_submitted'` and `source_id = url.slice(0, 500)`.
- Return the partial event object even if most fields are empty; the user can fill gaps manually.

### Preview endpoint (`POST /api/scrape/preview`)
- Validate `url`: present, string, starts with `http://` or `https://`.
- **Scraper routing**: before falling back to the generic scraper, check whether the
  submitted URL's hostname matches the hostname of any registered scraper's `DEFAULT_URL`.
  If a match is found, call that scraper's `scrape(url)` function instead. This means
  e.g. a Ticketmaster event URL will use the richer Ticketmaster scraper rather than
  the generic OG extractor. When a known scraper is used, override `source` to
  `'user_submitted'` on all returned events before responding.
- Return only the **first** event object from the scraper result (the user submitted a
  single event URL, not a listing page).
- On fetch error, return HTTP 422 with `{ error: <human-readable message> }` using
  existing `describeError` helper.
- The existing `scrapeLimiter` middleware already covers this route.

### Frontend error handling (`SubmitEventForm.jsx`)
- Display fetch/network errors inline beneath the URL input in a styled error message
  element (use the same error styling as the rest of the app).
- Display validation errors (blank title, blank venue) inline beneath the relevant
  field when the user attempts to submit.
- All server-side error messages from `POST /api/scrape/preview` and `POST /api/events`
  must surface visibly to the user — never silently swallow errors.

### Frontend form (`SubmitEventForm.jsx`)
- Three UI states: `idle` → `previewing` → `previewed`.
- Use a `<details>` / `<summary>` collapsible pattern (matches site style for panels).
- Submitted fields: title (required), venue (required), artist, date, time,
  price\_text, genre, ticket\_url, image\_url, description.
- Disable the "Submit Event" button while submitting; show a spinner.
- On submit success, call `onSubmitted()` prop to trigger a list refresh and reset
  the form to `idle`.

---

## Out of scope

- User authentication / associating submissions with user accounts.
- Admin moderation queue for user submissions.
- Duplicate detection beyond the existing `UNIQUE(source, source_id)` constraint.
- Scraping URLs that require JavaScript rendering (Puppeteer/browser).
