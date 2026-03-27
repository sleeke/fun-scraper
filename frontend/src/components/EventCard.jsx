const GENRE_EMOJI = {
  'hip-hop': '🎤',
  electronic: '🎛️',
  jazz: '🎷',
  rock: '🎸',
  pop: '🎵',
  classical: '🎻',
  country: '🪕',
  reggae: '🌴',
  latin: '💃',
};

const SOURCE_LABELS = {
  blueprint: 'Blueprint',
  ticketmaster: 'Ticketmaster',
  celebrities: 'Celebrities',
  redroom: 'Red Room',
  fortune: 'Fortune Sound',
  industrial236: 'Industrial 236',
  residentadvisor: 'Resident Advisor',
  thisisblueprint: 'This Is Blueprint',
  manual: 'Manual',
};

function formatPrice(event) {
  if (event.price_text) return event.price_text;
  if (event.price_min === 0 && event.price_max === 0) return 'Free';
  if (event.price_min != null) {
    return event.price_max && event.price_max !== event.price_min
      ? `$${event.price_min}–$${event.price_max}`
      : `$${event.price_min}`;
  }
  return null;
}

/**
 * Format a date string to include the day of week.
 * Accepts YYYY-MM-DD or any parseable date string.
 * Returns e.g. "Sat, Mar 29, 2025" or the original string if it can't be parsed.
 */
function formatDate(dateStr) {
  if (!dateStr) return null;
  // Try parsing as YYYY-MM-DD first (treat as local date to avoid UTC shift)
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
  return d.toLocaleDateString('en-CA', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function EventCard({ event, onClick }) {
  const price = formatPrice(event);
  const genreEmoji = GENRE_EMOJI[event.genre] || '🎶';
  const formattedDate = formatDate(event.date);

  return (
    <div className="event-card" onClick={() => onClick(event)}>
      {event.image_url ? (
        <img className="event-card-img" src={event.image_url} alt={event.title} loading="lazy" />
      ) : (
        <div className="event-card-img-placeholder">{genreEmoji}</div>
      )}
      <div className="event-card-body">
        <div className="event-card-title">{event.title}</div>
        <div className="event-card-meta">
          {event.venue && <span>📍 {event.venue}</span>}
          {formattedDate && <span>📅 {formattedDate}{event.time ? ` · ${event.time}` : ''}</span>}
          {event.artist && event.artist !== event.title && (
            <span>🎤 {event.artist}</span>
          )}
        </div>
      </div>
      <div className="event-card-footer">
        <div>
          {event.genre && <span className="genre-badge">{genreEmoji} {event.genre}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {price && <span className="price-badge">{price}</span>}
          {event.participant_count > 0 && (
            <span className="participants-count" title={event.participant_names || ''}>
              👥 {event.participant_names || event.participant_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export { SOURCE_LABELS, GENRE_EMOJI, formatPrice, formatDate };

