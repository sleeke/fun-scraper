## Unprepared requirements

### High Priority

#### Career directive
- Made a decision: DO NOT WORK ON THIS PROJECT unless there's a blocker on the main focus (career), or if there's a chance to parallel process.

#### Improved scraping performance

- Some sites don't allow scraping, and the scraper gets blocked. Implementing a more robust scraping strategy that can bypass these blocks (e.g., using proxies, rotating user agents) would improve the reliability of the scraper and ensure that it can retrieve event data from a wider range of sources.

#### Ability to submit events manually

- It would be great to allow submission through a PDF print of a site, or through a form where users can input event details. This would allow users to contribute events that may not be easily scraped, and it would also provide an alternative method for adding events to the database.

#### Subscribe to events

- Users should have the option to log in and register their potential attendace at each event. A count of attendees would be displayed in the event details, and clicking it would reveal the usernames of attendees. This would add a social aspect to the site and allow users to see which events are popular among their peers.

#### Visual analysis of event flyers/images

- Event images could be analyzed to extract additional information, such as the event's lineup (secondary artists), the event's genre (e.g., rock, electronic, jazz), or even the event's vibe (e.g., chill, energetic). This could be done using computer vision techniques and would provide users with more insights about the events.

### Medium Priority

#### Links to artist
- If the event details include the names of artists performing at the event, the site could automatically generate links to the artists' pages on platforms like Spotify, YouTube, or Wikipedia. This would allow users to easily learn more about the artists and their music.
- If the original page provides links to the artists music, those should be scraped and prioritized over the generated ones, as they are more likely to be relevant to the event.

#### Formatting of UI

- Event details text should be bolder, and the image should be less prominent.
- Icons should be cleaner, perhaps using material design icons or similar, with a monochrome appearance themed to the color pallette of the site.

### Low priority

#### Separation by day/week
- The site could have a calendar view that allows users to see events organized by day or week. This would make it easier for users to find events happening on specific dates and plan their attendance accordingly.

#### Color themes

- The site should have a light and dark mode, with a toggle to switch between them. The color scheme should be designed to be visually appealing and consistent across both modes.

#### Vibe checker

- Implement a "vibe checker" feature that analyzes the event details (e.g., title, description) and assigns a vibe score or category (e.g., "chill", "energetic", "family-friendly"). This could be done using a simple keyword-based approach or by leveraging a machine learning model trained on event data.

## Prepared requirements

#### Event submission

- People should be able to submit events through a form on the site. This would allow users to contribute events that may not be easily scraped, and it would also provide an alternative method for adding events to the database.
- A user should be able to filter events by those submitted by users vs those scraped from the web.
- events should be added using a URL, which would be scraped for details. This would allow users to easily add events by simply providing a link to the event page.
- Once scraped, the form should output a preview of the event details, allowing the user to confirm that the information is correct and edit it before submitting it to the database. 

## Planning-ready requirements
