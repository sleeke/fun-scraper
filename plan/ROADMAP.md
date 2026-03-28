## Unprepared requirements

### High Priority

#### Improved scraping performance

- Some sites don't allow scraping, and the scraper gets blocked. Implementing a more robust scraping strategy that can bypass these blocks (e.g., using proxies, rotating user agents) would improve the reliability of the scraper and ensure that it can retrieve event data from a wider range of sources.

#### Ability to submit events manually

- It would be great to allow submission through a PDF print of a site, or through a form where users can input event details. This would allow users to contribute events that may not be easily scraped, and it would also provide an alternative method for adding events to the database.

#### Subscribe to events

- Users should have the option to log in and register their potential attendace at each event. A count of attendees would be displayed in the event details, and clicking it would reveal the usernames of attendees. This would add a social aspect to the site and allow users to see which events are popular among their peers.

#### Visual analysis of event flyers/images

- Event images could be analyzed to extract additional information, such as the event's lineup (secondary artists), the event's genre (e.g., rock, electronic, jazz), or even the event's vibe (e.g., chill, energetic). This could be done using computer vision techniques and would provide users with more insights about the events.

### Medium Priority

#### Formatting of UI

- Event details text should be bolder, and the image should be less prominent.
- Icons should be cleaner, perhaps using material design icons or similar, with a monochrome appearance themed to the color pallette of the site.

### Low priority

#### Color themes

- The site should have a light and dark mode, with a toggle to switch between them. The color scheme should be designed to be visually appealing and consistent across both modes.

#### Vibe checker

- Implement a "vibe checker" feature that analyzes the event details (e.g., title, description) and assigns a vibe score or category (e.g., "chill", "energetic", "family-friendly"). This could be done using a simple keyword-based approach or by leveraging a machine learning model trained on event data.

## Prepared requirements

### ✅ Add storage so that previous results are stored and retrieved (DONE)

Events are now persisted to Vercel Blob (`events/all.json`) after each scrape and restored into SQLite on cold starts. Uses `@vercel/blob` SDK. Requires `BLOB_READ_WRITE_TOKEN` env var (set on Vercel; loaded from `.env.local` locally).

## Planning-ready requirements
