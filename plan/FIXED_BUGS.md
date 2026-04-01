# Fixed Bugs

This document tracks bugs that have been fixed and verified with tests.

---

### Manual event submission

**Fixed**: Added `POST /api/events/from-url` and `POST /api/events/from-pdf` endpoints, plus a `ManualSubmit` frontend component.

**Issues resolved:**
1. Submitting a URL which contains date and location information (e.g. `https://thisisblueprint.com/events/foundation-v13-5-disclosure-pne-forum-2026-04-18`) now extracts and populates the date, venue, and title from the URL slug as a fallback when the live page cannot be scraped.
2. Submitting a PDF now creates an event using text extracted by `pdf-parse`. If the document contains no identifiable event information, the error `"No events could be identified in this document. Try using the form to enter event details manually."` is returned with HTTP 422.

**Affected files:**
- `backend/src/services/eventSubmission.js` (new — URL + PDF parsing utilities)
- `backend/src/routes/events.js` (new `POST /from-url` and `POST /from-pdf` routes)
- `backend/package.json` (added `multer`, `pdf-parse`)
- `frontend/src/components/ManualSubmit.jsx` (new — URL input + PDF upload UI)
- `frontend/src/api/index.js` (added `submitEventUrl`, `submitEventPdf`)
- `frontend/src/App.jsx` (added `<ManualSubmit>` to main layout)
- `frontend/src/index.css` (added `.manual-submit-*` styles)
- `backend/src/__tests__/api.test.js` (added 11 new tests)
