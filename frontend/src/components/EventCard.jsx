import { useState, useRef, useEffect } from 'react';
import { MapPin, CalendarDays, Mic2, Music, Users } from 'lucide-react';
import { formatPrice, formatDateWithWeekday } from './eventUtils';

const MAX_INLINE_PARTICIPANTS = 3;

export default function EventCard({ event, onClick }) {
  const [isMobileActive, setIsMobileActive] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    // Only use intersection-based activation on touch/pointer-coarse devices (mobile)
    if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

    // Trigger "active" when the card enters the top ~20% of the viewport
    const observer = new IntersectionObserver(
      ([entry]) => setIsMobileActive(entry.isIntersecting),
      { rootMargin: '0px 0px -80% 0px', threshold: 0 }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const price = formatPrice(event);

  // Support multiple genres: prefer the `genres` field (MusicBrainz), fall back to `genre`
  const genreList = event.genres
    ? event.genres.split(',').map((g) => g.trim()).filter(Boolean)
    : event.genre
    ? [event.genre]
    : [];
  const formattedDate = formatDateWithWeekday(event.date);

  // Show names inline for small lists; show count for larger ones (names in tooltip)
  const participantCount = event.participant_count || 0;
  const participantNames = event.participant_names || '';
  let participantLabel = '';
  if (participantCount > 0) {
    if (participantCount <= MAX_INLINE_PARTICIPANTS && participantNames) {
      participantLabel = participantNames;
    } else {
      participantLabel = `${participantCount} interested`;
    }
  }

  return (
    <div ref={cardRef} className={`event-card${isMobileActive ? ' is-active' : ''}`} onClick={() => onClick(event)}>
      {event.image_url ? (
        <div className="event-card-img-wrap">
          <img className="event-card-img" src={event.image_url} alt={event.title} loading="lazy" />
        </div>
      ) : (
        <div className="event-card-img-placeholder">
          <Music size={36} strokeWidth={1.5} />
        </div>
      )}
      <div className="event-card-body">
        <div className="event-card-title">{event.title}</div>
        <div className="event-card-meta">
          {event.venue && (
            <span className="event-card-meta-item">
              <MapPin size={12} strokeWidth={2} className="meta-icon" />
              {event.venue}
            </span>
          )}
          {formattedDate && (
            <span className="event-card-meta-item">
              <CalendarDays size={12} strokeWidth={2} className="meta-icon" />
              {formattedDate}{event.time ? ` · ${event.time}` : ''}
            </span>
          )}
          {event.artist && event.artist !== event.title && (
            <span className="event-card-meta-item">
              <Mic2 size={12} strokeWidth={2} className="meta-icon" />
              {event.artist}
            </span>
          )}
        </div>
      </div>
      <div className="event-card-footer">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {genreList.map((g) => (
            <span key={g} className="genre-badge">{g}</span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {price && <span className="price-badge">{price}</span>}
          {participantCount > 0 && (
            <span className="participants-count" title={participantNames}>
              <Users size={12} strokeWidth={2} className="meta-icon" />
              {participantLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

