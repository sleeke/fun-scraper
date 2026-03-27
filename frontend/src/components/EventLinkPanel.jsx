import { useState } from 'react';
import { api } from '../api';
import { formatDateWithWeekday } from './EventCard';

/**
 * Format a date + optional time for WhatsApp display.
 * Returns e.g. "Saturday, March 29, 2025 · 10:00 PM"
 */
function formatFullDate(dateStr, timeStr) {
  if (!dateStr) return null;
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let d;
  if (isoMatch) {
    d = new Date(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10) - 1,
      parseInt(isoMatch[3], 10)
    );
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return dateStr;

  const datePart = d.toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (timeStr) {
    // Convert 24h time (HH:MM) to 12h display
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = ((h + 11) % 12) + 1;
      return `${datePart} · ${h12}:${String(m).padStart(2, '0')} ${suffix}`;
    }
    return `${datePart} · ${timeStr}`;
  }
  return datePart;
}

/**
 * Build the WhatsApp-ready text summary from event data.
 */
function buildWhatsAppText(event) {
  const lines = [];

  const dateDisplay = formatFullDate(event.date, event.time);
  if (dateDisplay) lines.push(`📅 ${dateDisplay}`);

  if (event.venue) lines.push(`📍 ${event.venue}`);

  if (event.price_text) lines.push(`💰 ${event.price_text}`);

  const link = event.ticket_url;
  if (link) lines.push(`🔗 ${link}`);

  return lines.join('\n');
}

export default function EventLinkPanel({ toast }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handlePreview(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setEvent(null);
    setCopied(false);
    try {
      const result = await api.previewUrl(url.trim());
      setEvent(result);
    } catch (err) {
      setError(err.message || 'Failed to preview event');
      toast && toast(`❌ ${err.message || 'Failed to preview event'}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!event) return;
    const text = buildWhatsAppText(event);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast && toast('✅ Copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      toast && toast('✅ Copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const whatsAppText = event ? buildWhatsAppText(event) : '';

  return (
    <div className="scrape-panel">
      <h3>Event Link Preview</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Paste a link to an event page to generate a WhatsApp summary.
      </p>

      <form className="event-link-form" onSubmit={handlePreview}>
        <input
          type="url"
          className="event-link-input"
          placeholder="https://www.blueprintevents.ca/events/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          required
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !url.trim()}
        >
          {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '🔍 Preview'}
        </button>
      </form>

      {error && (
        <div className="event-link-error">❌ {error}</div>
      )}

      {event && (
        <div className="event-link-result">
          {event.image_url && (
            <img
              className="event-link-img"
              src={event.image_url}
              alt={event.title}
              loading="lazy"
            />
          )}
          <div className="event-link-summary">
            {event.title && (
              <div className="event-link-title">{event.title}</div>
            )}
            <pre className="event-link-text">{whatsAppText}</pre>
            <button
              className={`btn ${copied ? 'btn-success' : 'btn-primary'}`}
              onClick={handleCopy}
            >
              {copied ? '✅ Copied!' : '📋 Copy for WhatsApp'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
