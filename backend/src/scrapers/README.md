# Scrapers — Detailed Documentation

This folder contains all of the code responsible for fetching live event listings from
various venues and ticketing platforms and converting them into a uniform format that
the rest of the application can store and display.

---

## Table of contents

1. [How scrapers work — the big picture](#1-how-scrapers-work--the-big-picture)
2. [Shared utilities — `base.js`](#2-shared-utilities--basejs)
3. [Headless-browser helper — `browser.js`](#3-headless-browser-helper--browserjs)
4. [Scraper registry — `index.js`](#4-scraper-registry--indexjs)
5. [Individual scrapers](#5-individual-scrapers)
   - [blueprint.js — Blueprint Events Vancouver](#blueprintjs--blueprint-events-vancouver)
   - [ticketmaster.js — Ticketmaster](#ticketmasterjs--ticketmaster)
   - [celebrities.js — Celebrities Night Club](#celebritiesjs--celebrities-night-club)
   - [redroom.js — Red Room Vancouver](#redroomjs--red-room-vancouver)
   - [fortune.js — Fortune Sound Club](#fortunejs--fortune-sound-club)
   - [industrial236.js — Industrial 236](#industrial236js--industrial-236)
   - [thisisblueprint.js — This Is Blueprint](#thisisblueprintjs--this-is-blueprint)
   - [residentadvisor.js — Resident Advisor](#residentadvisorjs--resident-advisor)
6. [Comparison table](#6-comparison-table)
7. [Common problems and access restrictions](#7-common-problems-and-access-restrictions)
8. [Suggested improvements](#8-suggested-improvements)

---

## 1. How scrapers work — the big picture

Every scraper in this folder follows the same contract:

```
scrape(url?)  →  array of event objects
```

Each event object always has the same set of fields — title, artist, venue, city, date,
ticket URL, image URL, price, genre, and a unique `source_id` — regardless of where
the data came from.  This means the rest of the application does not need to know or
care which website an event came from.

There are two fundamentally different ways to retrieve data from a website:

**HTML scraping (most scrapers here):** The scraper downloads the raw HTML of a
webpage, then searches through it for patterns — specific tag names, CSS class names,
or attribute values — to find the pieces of information it needs.  This is the same
process a human would follow if they were reading the source code of a page, but done
automatically.  The library that does the searching is called [Cheerio][cheerio], which
lets you query HTML using familiar CSS selector syntax (e.g. `h2.event-title`).

**API scraping (Ticketmaster, Resident Advisor):** Some platforms expose a proper
programming interface — a URL that returns structured data (usually JSON) when you
ask it the right question.  This is much more reliable than HTML scraping because the
data format is intentional and stable.

[cheerio]: https://cheerio.js.org/

---

## 2. Shared utilities — `base.js`

All scrapers import helpers from `base.js`.  Nothing in this file is specific to any
one venue; it provides building blocks that every scraper reuses.

### User-agent rotation

When a browser visits a website, it identifies itself by sending a **User-Agent**
string — a short text that names the browser and operating system (e.g.
`Mozilla/5.0 … Chrome/124`).  Servers sometimes block requests that come from
uncommon or server-like user agents, because those look like automated bots rather than
real visitors.

`base.js` keeps a pool of five realistic desktop-browser user-agent strings and cycles
through them one by one on each request.  This means repeated requests look like they
are coming from different browsers, reducing the chance of a ban.

### `fetchPage(url)`

The basic fetch function.  It sends an HTTP GET request to the given URL using the
[Axios][axios] library, sets realistic browser-like headers (accepted content types,
language, security hints), waits up to 15 seconds for a response, and then hands the
returned HTML to Cheerio so the scraper can search through it.

[axios]: https://axios-http.com/

### `fetchPageWithRetry(url, options)`

An enhanced version of `fetchPage`.  If the request fails (e.g. due to a network
hiccup or a temporary server error), it waits a short time and tries again — up to
three times by default.  The waiting time doubles with each failed attempt (500 ms,
then 1 s, then 2 s).  This is called **exponential back-off** and is a standard
technique for dealing with flaky network conditions without hammering the server.

Errors that are clearly the caller's fault — 403 Forbidden, 404 Not Found, 401
Unauthorised — are not retried, since retrying won't help in those cases.

### `detectGenre(text)`

Takes a piece of text (usually the event title plus its description) and returns a
genre string by looking for keywords.  For example, text containing "house", "techno",
or "dnb" maps to `electronic`; text containing "jazz", "soul", or "blues" maps to
`jazz`.  If no keywords match, it returns `null`.

The mapping is intentionally coarse — one genre per event — because that is enough to
support the genre filter in the frontend.

### `parsePrice(text)`

Takes a raw price string like `"$20 - $40"` or `"Free"` and returns three values:
- `priceMin` — the lowest number found (0 for Free)
- `priceMax` — the highest number found
- `priceText` — the cleaned original string

This normalisation lets the frontend sort and filter by price numerically, even though
each venue writes price information differently.

### `parseDate(text)`

Takes a date string in almost any format and converts it to `YYYY-MM-DD` (e.g.
`"April 12, 2025"` → `"2025-04-12"`).  Dates that look unreasonable (before 2020 or
after 2035) are rejected and `null` is returned instead.

### `lookupArtistGenres(artistName)`

Makes a call to the free [MusicBrainz][mb] API to look up community-curated genre tags
for a named artist.  Results are cached in memory so the same artist is never looked up
twice in a single scrape run.  Requests are rate-limited to one per second to comply
with MusicBrainz's usage policy.

This is used as an optional enrichment step on top of keyword-based `detectGenre`;
the scrape routes cap it at 10 artist lookups per scrape to avoid slowing things down
too much.

[mb]: https://musicbrainz.org/

---

## 3. Headless-browser helper — `browser.js`

Some websites — including Resident Advisor — do not deliver their event content as
plain HTML.  Instead, they send a mostly empty page and then use JavaScript to fetch
data and build the visible content dynamically in the browser.  A normal HTTP request
only gets the empty shell; the events never appear.

`browser.js` solves this by using [Playwright][playwright], a library that can launch
a real headless (invisible, windowless) Chrome browser, navigate to a URL, wait for
all the JavaScript to finish running, and then return the fully-rendered HTML.

It provides two functions:

### `fetchPageRendered(url)`

Launches Chromium, navigates to the URL, waits until the network goes quiet (meaning
JavaScript has finished its data fetching), and returns the rendered HTML for Cheerio
to parse.

### `interceptApiResponse(url, urlPattern)`

Launches Chromium, navigates to the URL, and watches every network request the page
makes.  As soon as it spots a request whose URL matches the given pattern, it captures
and returns the response data as parsed JSON — without waiting for the page to finish
rendering.  This is more efficient than `fetchPageRendered` when the API endpoint
is known, because it gets the raw data directly rather than having to extract it from
rendered HTML afterwards.

### Graceful degradation

`browser.js` never crashes the application.  If no Chromium executable is found (which
is the case on Vercel serverless functions, where installing a browser is not feasible),
all functions return `null` and log a warning.  Scrapers that depend on this module
must handle a `null` return value and either fall back to another strategy or return an
empty list.

The module searches for a browser in this order:
1. The `playwright` npm package's own bundled browser (available in local development
   if you have run `npx playwright install`).
2. A system-installed Chrome/Chromium at a known filesystem path (useful in CI or
   Docker environments).
3. The `CHROME_PATH` environment variable (override for custom locations).

[playwright]: https://playwright.dev/

---

## 4. Scraper registry — `index.js`

A simple lookup table that maps a short string key (e.g. `"redroom"`) to its
corresponding scraper module.  When a scrape is triggered via the API, the route
handler looks up the correct scraper here by name and calls its `scrape()` function.

Adding a new scraper requires two steps: creating the scraper file and adding one line
to this registry.

---

## 5. Individual scrapers

---

### `blueprint.js` — Blueprint Events Vancouver

**Website:** https://www.blueprintevents.ca/events  
**Method:** HTML scraping

Blueprint Events is a Vancouver-based event promoter.  Their website is built with
**The Events Calendar**, a popular WordPress plugin.

The scraper fetches the events listing page and looks for HTML elements that match
known Events Calendar CSS class names (e.g. `.tribe-events-calendar-list__event-article`).
For each event card it finds, it reads:
- The title from an `<h2>` or `<h3>` heading inside the card
- The date from a `<time>` element or a `.tribe-event-date-start` span
- A ticket URL from any link that contains the words "ticket", "eventbrite", or
  "blueprintevents" in its address
- The price from a `.tribe-tickets__sale_price` element
- A short description from the first `<p>` tag
- A thumbnail image from the first `<img>` tag

Genre is detected from the title and description text using the shared `detectGenre`
helper.

**Known issue:** The Events Calendar sometimes renders some or all of its content
using JavaScript after the initial page load.  If that is the case, the selector
matches nothing and the scraper silently returns an empty list.

---

### `ticketmaster.js` — Ticketmaster

**Website / API:** https://app.ticketmaster.com/discovery/v2/events.json  
**Method:** Official REST API

This is the only scraper that uses a proper, documented API with a stable data format.
It sends a request to Ticketmaster's Discovery API, asking for music events in
Vancouver, Canada, sorted by date, returning up to 50 results.

The API returns a structured JSON response.  For each event, the scraper reads:
- Title, date, and start time directly from dedicated JSON fields
- Venue name and city from a nested `_embedded.venues` object
- Price range from a `priceRanges` array (when available)
- A 16:9 image wider than 500 pixels (preferred) from the `images` array
- Genre from the `classifications` array (with keyword fallback via `detectGenre`)

**API key requirement:** The Ticketmaster API requires an API key for most requests.
Without one, the API returns a 401 Unauthorised response and the scraper logs a warning
and returns an empty list.  The key is read from the `TICKETMASTER_API_KEY` environment
variable.  A free key can be obtained from https://developer.ticketmaster.com/.

This is by far the most **robust** scraper: Ticketmaster controls the API and has a
strong commercial incentive to keep it working.  The data format is clearly defined
and does not change when the website is redesigned.

---

### `celebrities.js` — Celebrities Night Club

**Website:** https://www.celebritiesnightclub.com/events  
**Method:** HTML scraping

Celebrities is one of Vancouver's main electronic music clubs.  Their website is built
with **Squarespace**, a hosted website builder.

The scraper tries a list of CSS selectors in order, stopping at the first one that
finds any matching elements on the page.  The selectors cover both common generic
patterns (`.event-item`, `article`) and Squarespace-specific ones
(`.sqs-block-content .summary-item`, `.eventlist-event`).

A key challenge with Squarespace event listings is that the date is split across two
separate elements: one for the month abbreviation and one for the day number.  The
`extractEventDate` helper handles this by finding both parts, combining them with the
current year, and passing the result to `parseDate`.  The `<time datetime="">` attribute
is checked first because it is more reliable than reading visible text.

**Fallback:** If none of the selectors match (e.g. if Squarespace changes its HTML
structure), the scraper falls back to collecting all links whose URL contains `/event`.
These fallback results are minimal — they have a title and a URL but no date, price, or
image.

---

### `redroom.js` — Red Room Vancouver

**Website:** https://redroom.ca/events  
**Method:** HTML scraping

Red Room is a mid-size concert venue.  Their website appears to use **The Events
Calendar** WordPress plugin, similar to Blueprint Events.

The scraper follows the same multi-selector pattern as `celebrities.js` — it iterates
through a ranked list of CSS selectors and uses the first one that yields results.  For
each event card it extracts title, date (preferring the `<time datetime="">` attribute),
ticket URL, price, description, image, and genre.

The venue name is hardcoded as `"Red Room"` because Red Room only lists their own
events on this page — there is no need to read it from the HTML.

**Compared to `blueprint.js`:** Both target similar WordPress/Events Calendar sites and
use near-identical selector logic.  The main practical difference is the fallback ticket
URL pattern: Red Room also looks for links containing "dice" (a popular ticketing
platform used by many electronic music venues), which Blueprint does not.

---

### `fortune.js` — Fortune Sound Club

**Website:** https://www.fortunesoundclub.com/events  
**Method:** HTML scraping

Fortune Sound Club is a well-known Vancouver venue focused on hip-hop and electronic
music.  Their website uses either The Events Calendar or Squarespace (the scraper
supports both, since the selector list includes classes from both platforms).

The implementation is structurally identical to `redroom.js`.  The only differences
are:
- The `SOURCE` constant is `"fortune"` instead of `"redroom"`.
- The hardcoded venue name is `"Fortune Sound Club"`.
- The ticket URL search also looks for links containing "fortune" in the address.

Because the two scrapers are so similar, any future changes to the selector strategy
should ideally be applied to both at the same time.

---

### `industrial236.js` — Industrial 236

**Website:** https://www.industrial236.com/events  
**Method:** HTML scraping

Industrial 236 is a newer events and arts venue.  The scraper follows the same
multi-selector pattern as the other HTML scrapers.

**Notable difference:** This scraper has a more aggressive fallback.  In addition to
collecting `/event` links (like Celebrities), it also collects `/show` links.  This
accommodates venues that use "shows" rather than "events" in their URL structure.

The regular expression used in the fallback (`a[href*="/event"], a[href*="/show"]`)
is a CSS selector that means "any link whose `href` attribute contains the text
`/event` or `/show`".  Relative URLs (those that start with `/` rather than `https://`)
are converted to absolute URLs by prepending the site's base domain.

---

### `thisisblueprint.js` — This Is Blueprint

**Website:** https://thisisblueprint.com/events/  
**Method:** HTML scraping

This Is Blueprint is a Vancouver electronic music promoter.  Their website uses the
**The Events Calendar** WordPress plugin.

This scraper has the most thorough selector list of all the HTML scrapers — nine CSS
selectors covering all known variations of The Events Calendar's HTML output across
different plugin versions.  This reflects real-world experience with the plugin
producing slightly different markup depending on its version and theme configuration.

The scraper only breaks out of the loop and stops trying selectors once it has found
at least one event (`if (events.length > 0) break`).  This prevents partial results
from multiple overlapping selectors being merged together.

**Compared to `blueprint.js`:** Both target The Events Calendar but `thisisblueprint.js`
is more thorough in its selector strategy and also handles `data-src` (a lazy-loading
attribute) for images.

---

### `residentadvisor.js` — Resident Advisor

**Website:** https://ra.co/events/ca/vancouver  
**Method:** Multi-strategy cascade (GraphQL API → Playwright → static HTML)

Resident Advisor (RA) is the most complex scraper in the collection.  RA is a
JavaScript-heavy single-page application built with Next.js, and it actively protects
its data from automated access.  The scraper tries four increasingly laborious
approaches, moving to the next only if the previous one fails.

#### Strategy 1a — GraphQL API with numeric area ID

RA's frontend communicates with its own backend using GraphQL, a query language that
lets the client specify exactly which fields it wants.  The scraper mimics this by
sending the same GraphQL query to `https://ra.co/graphql`.

RA identifies geographic areas by a numeric ID (e.g. `13` for London, `7` for
Amsterdam).  The scraper first fetches the Vancouver events page and searches the page
HTML for a hidden JSON blob called `__NEXT_DATA__` (a Next.js convention for embedding
server-rendered data in the page).  If the Vancouver area ID is found there, it uses it
in the GraphQL query.  Hard-coded guesses are deliberately avoided, because using the
wrong area ID silently returns events for a different city.

The GraphQL query asks for events within the next 60 days, up to 100 per page, and
requests artist names, genre tags, venue details, ticket cost, and image URLs.

Headers are crafted to look like a real browser session: the `Origin` and `Referer`
headers claim the request is coming from `ra.co` itself, and the scraper first visits
the RA homepage to collect session cookies before making the GraphQL call.

#### Strategy 1b — GraphQL API with slug

A legacy variant of the GraphQL query that identifies the area by a text slug
(`"vancouver"` or `"ca/vancouver"`) instead of a numeric ID.  The query schema is
slightly different from Strategy 1a.  Both slug variants are tried before giving up
on the API approach.

#### Strategy 2 — Playwright headless browser

If the API strategies fail (which they often do due to RA's bot-detection measures),
the scraper launches a real Chromium browser via `browser.js`.  The browser navigates
to the Vancouver events page and the scraper intercepts the GraphQL network request
that the page makes automatically — capturing the JSON response before the browser
even has time to render it.

If the intercept misses (e.g. the request completes before the intercept is ready),
the scraper falls back to parsing the fully-rendered HTML, again looking for
`__NEXT_DATA__` first.

#### Strategy 3 — Static HTML

The last resort.  Fetches the page without a real browser using `fetchPage` from
`base.js`, then attempts to parse what little usable content the server returns.
Because RA requires JavaScript, this typically yields nothing, but it is included
as a safety net.

#### Vancouver validation

Because an incorrect area ID could return events from another city, every event
returned by any strategy is passed through `isVancouverEvent`.  This checks the venue
address for Vancouver or BC postal code markers and explicitly rejects addresses that
contain well-known non-Vancouver city names.

---

## 6. Comparison table

| Scraper | Target site | Data method | API key needed? | JS-rendering risk | Fallback strategy |
|---|---|---|---|---|---|
| `blueprint` | blueprintevents.ca | HTML scraping | No | Medium | None |
| `ticketmaster` | Ticketmaster API | REST API | **Yes** | None | Returns empty on 401 |
| `celebrities` | celebritiesnightclub.com | HTML scraping | No | Medium | Collect `/event` links |
| `redroom` | redroom.ca | HTML scraping | No | Medium | None |
| `fortune` | fortunesoundclub.com | HTML scraping | No | Medium | None |
| `industrial236` | industrial236.com | HTML scraping | No | Medium | Collect `/event` and `/show` links |
| `thisisblueprint` | thisisblueprint.com | HTML scraping | No | Medium | Collect `/event` links |
| `residentadvisor` | ra.co | GraphQL API + browser | No | **High** | 4-strategy cascade |

**JS-rendering risk** refers to how likely it is that the event data is loaded
dynamically via JavaScript rather than being present in the initial HTML response.
When this happens, a plain HTTP request returns an empty or incomplete page and the
scraper finds nothing.

---

## 7. Common problems and access restrictions

### Bot detection and IP blocking

Websites use various techniques to detect and block automated requests:
- **User-agent checks** — blocking requests whose user-agent string looks like a bot
  or server.  Mitigated here by rotating through realistic browser user-agents.
- **Rate limiting** — blocking clients that make too many requests too quickly.
  Mitigated by the `fetchPageWithRetry` back-off and the overall scrape rate limit.
- **Cookie / session checks** — requiring a valid browser session cookie before
  serving content.  The RA scraper addresses this by seeding cookies from a real page
  visit before making the API call.
- **Bot-fingerprinting** — detecting headless browsers by checking browser properties
  that differ between real and automated sessions.  This is harder to mitigate without
  additional Playwright stealth plugins.
- **Cloudflare or similar WAF (Web Application Firewall)** — requires solving a
  JavaScript challenge before the real page is served.  Plain HTTP requests and even
  basic Playwright sessions will be blocked.

### JavaScript-rendered content

Most modern websites build their pages dynamically in the browser after the initial
load.  A plain HTTP request only receives the skeleton HTML; the actual event list
never arrives.  This is the single most common reason for a scraper returning zero
results.  The only reliable solution is to use a real browser (via `browser.js`).

### Website redesigns

HTML scrapers break whenever a website's CSS class names, tag structure, or URL
patterns change.  There is no warning — the scraper simply returns nothing.  API-based
scrapers are immune to this because the data format is versioned and independently
maintained.

### Vercel serverless environment

The application is hosted on Vercel, which runs the backend as short-lived serverless
functions.  These functions have no ability to install or run a full Chrome browser,
so `browser.js` returns `null` in that environment.  Any scraper that depends on
Playwright will silently fall back to its non-browser strategy (or return nothing) when
deployed.

---

## 8. Suggested improvements

### 8.1 Add a Ticketmaster API key for all venues

The Ticketmaster scraper is currently the most reliable one, but it requires an API
key.  A free key is available from https://developer.ticketmaster.com/ and would unlock
results for every Vancouver music event Ticketmaster knows about, covering many of the
same venues that the HTML scrapers target — but far more reliably.

**Action:** Obtain a key, add it as the `TICKETMASTER_API_KEY` environment variable in
Vercel, and consider removing the individual HTML scrapers for any venues that are
already covered by Ticketmaster data.

### 8.2 Use a Playwright stealth plugin for Resident Advisor

The main reason the RA GraphQL strategy fails is that RA can detect that the request
does not come from a genuine browser session.  The [playwright-extra][pw-extra] package
with the `puppeteer-extra-plugin-stealth` plugin patches dozens of browser properties
that fingerprinting systems check, making the headless browser appear indistinguishable
from a real one.

**Action:** Install `playwright-extra` and `puppeteer-extra-plugin-stealth`, update
`browser.js` to use the stealth-wrapped chromium launcher, and re-test the RA scraper.

[pw-extra]: https://github.com/berstend/puppeteer-extra/tree/master/packages/playwright-extra

### 8.3 Run Playwright in a Docker container or external service on Vercel

Because Vercel serverless functions cannot run a browser, the RA Playwright strategy
never executes in production.  There are two practical workarounds:

- **Run a separate scraping worker** — a small always-on process (e.g. a Railway or
  Fly.io container) that runs the Playwright-dependent scrapers on a schedule and
  POSTs the results to the main API.  The main Vercel deployment only stores and
  serves data; it does not scrape.
- **Use a browser-as-a-service API** — services like [BrowserBase][browserbase] or
  [Browserless.io][browserless] provide a remote Chromium that can be controlled via
  Playwright over a WebSocket.  `browser.js` would connect to the remote endpoint
  instead of launching a local process.  Both services have free tiers sufficient for
  infrequent scraping.

[browserbase]: https://www.browserbase.com/
[browserless]: https://www.browserless.io/

### 8.4 Discover and use official APIs for venue websites

Several of the venue scrapers target WordPress sites using The Events Calendar plugin.
That plugin ships with a **REST API** that returns structured JSON at a predictable URL
(typically `/wp-json/tribe/events/v1/events`).  If a venue's WordPress installation
has this endpoint enabled (which is the default), it is far preferable to HTML
scraping.

**Action:** For each WordPress-based venue, test whether
`https://<venue-domain>/wp-json/tribe/events/v1/events` returns JSON.  If it does,
replace the HTML scraper with a simple `axios.get` call to that endpoint, similar to
how `ticketmaster.js` works.

### 8.5 Consolidate the near-identical HTML scrapers

`redroom.js`, `fortune.js`, and `industrial236.js` are structurally identical —
they differ only in their source name, default URL, and hardcoded venue name.  This
creates unnecessary maintenance burden: any improvement to the selector strategy must
be duplicated across all three files.

**Action:** Extract the shared logic into a `createVenueHtmlScraper(options)` factory
function in a new file (e.g. `venueHtmlScraper.js`).  Each venue file would then
simply call the factory with its specific configuration.  This makes it trivial to add
new venue scrapers and ensures that improvements automatically apply everywhere.

### 8.6 Add scheduled scraping

Currently, scraping only happens when triggered manually via the API.  This means the
database quickly goes stale.  A scheduled job — for example a Vercel Cron Job configured
in `vercel.json` — could trigger a full scrape once a day automatically, keeping event
listings current without any manual intervention.

**Action:** Add a cron route in `vercel.json` that calls `POST /api/scrape` for each
source at a reasonable interval (e.g. daily at 06:00 UTC).

### 8.7 Persist scrape failure logs

At present, scraping errors are only written to the console (server logs).  If a
scraper silently starts returning zero results, there is no easy way to notice.  Storing
a short scrape-run summary in the database (source name, timestamp, event count,
error message if any) would make it straightforward to build a health-check view in
the admin panel and to alert on regressions.

### 8.8 Proxy rotation for high-frequency scraping

If scraping frequency is increased significantly, some venues may start returning 429
(Too Many Requests) or 403 (Forbidden) responses for repeated requests from the same
IP address.  Routing requests through a pool of rotating proxy IP addresses prevents
this.  Services like [Bright Data][brightdata] or [Oxylabs][oxylabs] provide
residential proxy networks that are very difficult for websites to detect and block.

[brightdata]: https://brightdata.com/
[oxylabs]: https://oxylabs.io/
