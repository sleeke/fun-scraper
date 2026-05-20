import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api';

const GENRES = [
  '', 'electronic', 'hip-hop', 'rock', 'jazz', 'pop',
  'classical', 'country', 'reggae', 'latin',
];
const GENRE_LABELS = {
  '': 'Select genre…',
  electronic: 'Electronic',
  'hip-hop': 'Hip-Hop',
  rock: 'Rock',
  jazz: 'Jazz',
  pop: 'Pop',
  classical: 'Classical',
  country: 'Country',
  reggae: 'Reggae',
  latin: 'Latin',
};

export default function SubmitEventForm({ onSubmitted, toast }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [edited, setEdited] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleFetch(e) {
    e.preventDefault();
    setFetchError('');
    setEdited(null);
    setFieldErrors({});
    setSubmitError('');
    setFetching(true);
    try {
      const data = await api.previewEvent(url.trim());
      setEdited(data);
    } catch (err) {
      setFetchError(err.message || 'Failed to fetch event details. Check the URL and try again.');
    } finally {
      setFetching(false);
    }
  }

  function handleFieldChange(field, value) {
    setEdited((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');

    const errors = {};
    if (!edited?.title?.trim()) errors.title = 'Title is required';
    if (!edited?.venue?.trim()) errors.venue = 'Venue is required';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await api.createEvent({
        ...edited,
        source: 'user_submitted',
        source_id: url.trim().slice(0, 500),
      });
      toast('Event submitted successfully!', 'success');
      setUrl('');
      setEdited(null);
      setFetchError('');
      setFieldErrors({});
      setSubmitError('');
      onSubmitted && onSubmitted();
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="scrape-panel">
      <button
        className="submit-panel-toggle"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-expanded={open}
      >
        <h3>Submit an Event</h3>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="submit-panel-body">
          {/* URL input row */}
          <form onSubmit={handleFetch} className="submit-url-row">
            <input
              type="url"
              className="submit-url-input"
              placeholder="Paste event URL (e.g. https://thisisblueprint.com/event/…)"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setFetchError('');
              }}
              required
            />
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={fetching || !url.trim()}
            >
              {fetching ? (
                <>
                  <span
                    className="spinner"
                    style={{ width: 14, height: 14, borderWidth: 2 }}
                  />
                  Fetching…
                </>
              ) : (
                'Fetch Details'
              )}
            </button>
          </form>

          {fetchError && (
            <p className="submit-error" role="alert">
              {fetchError}
            </p>
          )}

          {/* Preview / edit form */}
          {edited && (
            <form onSubmit={handleSubmit} className="submit-preview-form">
              <p className="submit-preview-hint">
                Review and edit the details below before submitting:
              </p>

              {/* Title */}
              <div className="submit-field">
                <label htmlFor="sf-title">
                  Title <span className="submit-required">*</span>
                </label>
                <input
                  id="sf-title"
                  type="text"
                  value={edited.title || ''}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                />
                {fieldErrors.title && (
                  <span className="submit-field-error" role="alert">
                    {fieldErrors.title}
                  </span>
                )}
              </div>

              {/* Two-column grid for secondary fields */}
              <div className="submit-field-grid">
                <div className="submit-field">
                  <label htmlFor="sf-venue">
                    Venue <span className="submit-required">*</span>
                  </label>
                  <input
                    id="sf-venue"
                    type="text"
                    value={edited.venue || ''}
                    onChange={(e) => handleFieldChange('venue', e.target.value)}
                  />
                  {fieldErrors.venue && (
                    <span className="submit-field-error" role="alert">
                      {fieldErrors.venue}
                    </span>
                  )}
                </div>

                <div className="submit-field">
                  <label htmlFor="sf-artist">Artist</label>
                  <input
                    id="sf-artist"
                    type="text"
                    value={edited.artist || ''}
                    onChange={(e) => handleFieldChange('artist', e.target.value)}
                  />
                </div>

                <div className="submit-field">
                  <label htmlFor="sf-date">Date</label>
                  <input
                    id="sf-date"
                    type="date"
                    value={edited.date || ''}
                    onChange={(e) => handleFieldChange('date', e.target.value)}
                  />
                </div>

                <div className="submit-field">
                  <label htmlFor="sf-time">Time</label>
                  <input
                    id="sf-time"
                    type="time"
                    value={edited.time || ''}
                    onChange={(e) => handleFieldChange('time', e.target.value)}
                  />
                </div>

                <div className="submit-field">
                  <label htmlFor="sf-price">Price</label>
                  <input
                    id="sf-price"
                    type="text"
                    value={edited.price_text || ''}
                    onChange={(e) => handleFieldChange('price_text', e.target.value)}
                    placeholder="e.g. $20"
                  />
                </div>

                <div className="submit-field">
                  <label htmlFor="sf-genre">Genre</label>
                  <select
                    id="sf-genre"
                    value={edited.genre || ''}
                    onChange={(e) => handleFieldChange('genre', e.target.value)}
                  >
                    {GENRES.map((g) => (
                      <option key={g} value={g}>
                        {GENRE_LABELS[g] || g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Full-width fields */}
              <div className="submit-field">
                <label htmlFor="sf-ticket-url">Ticket URL</label>
                <input
                  id="sf-ticket-url"
                  type="url"
                  value={edited.ticket_url || ''}
                  onChange={(e) => handleFieldChange('ticket_url', e.target.value)}
                />
              </div>

              <div className="submit-field">
                <label htmlFor="sf-image-url">Image URL</label>
                <input
                  id="sf-image-url"
                  type="url"
                  value={edited.image_url || ''}
                  onChange={(e) => handleFieldChange('image_url', e.target.value)}
                />
              </div>

              <div className="submit-field">
                <label htmlFor="sf-description">Description</label>
                <textarea
                  id="sf-description"
                  value={edited.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="submit-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting…' : 'Submit Event'}
                </button>
                {submitError && (
                  <p className="submit-error" role="alert">
                    {submitError}
                  </p>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
