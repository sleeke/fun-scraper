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

export default function EventCard({ event, onClick }) {
  const price = formatPrice(event);
  const genreEmoji = GENRE_EMOJI[event.genre] || '🎶';

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
          {event.date && <span>📅 {event.date}{event.time ? ` · ${event.time}` : ''}</span>}
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
          <span className="participants-count">
            {event.participant_count > 0 ? `👥 ${event.participant_count}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

export { SOURCE_LABELS, GENRE_EMOJI, formatPrice };
