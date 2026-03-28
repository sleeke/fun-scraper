import { useState } from 'react';
import { MapPin, CalendarDays, Mic2, Tag, Globe, Ticket, Users, X, Music, ZoomIn } from 'lucide-react';
import { api } from '../api';
import { SOURCE_LABELS, GENRE_EMOJI, formatPrice, formatDateWithWeekday } from './eventUtils';
import ImageAnalysis from './ImageAnalysis';

export default function EventDetail({ event, onClose, onParticipantsChange, toast }) {
  const [participants, setParticipants] = useState(event.participants || []);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [extraGenres, setExtraGenres] = useState([]);

  const price = formatPrice(event);
  // Support multiple genres from MusicBrainz (genres field) or fall back to genre
  const baseGenreList = event.genres
    ? event.genres.split(',').map((g) => g.trim()).filter(Boolean)
    : event.genre
    ? [event.genre]
    : [];
  // Merge in any genres discovered via image analysis (de-duplicated)
  const genreList = [...new Set([...baseGenreList, ...extraGenres])];
  const formattedDate = formatDateWithWeekday(event.date);

  function handleAnalysisComplete(analysis) {
    if (analysis?.genres?.length > 0) {
      setExtraGenres(analysis.genres.map((g) => g.toLowerCase()));
    }
  }

  async function handleAddParticipant(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const p = await api.addParticipant(event.id, newName.trim());
      const updated = [...participants, p];
      setParticipants(updated);
      setNewName('');
      onParticipantsChange && onParticipantsChange(event.id, updated.length);
      toast('Added to interest list! 🎉', 'success');
    } catch (err) {
      toast(err.message || 'Could not add participant', 'error');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(participantId) {
    try {
      await api.removeParticipant(event.id, participantId);
      const updated = participants.filter((p) => p.id !== participantId);
      setParticipants(updated);
      onParticipantsChange && onParticipantsChange(event.id, updated.length);
    } catch (err) {
      toast(err.message || 'Could not remove participant', 'error');
    }
  }

  return (
    <>
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(false)} aria-label="Close image">
          <button className="lightbox-close" onClick={() => setLightbox(false)} aria-label="Close">
            <X size={22} strokeWidth={2} />
          </button>
          <img className="lightbox-img" src={event.image_url} alt={event.title} />
        </div>
      )}
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} strokeWidth={2} />
        </button>

        {event.image_url && (
          <div className="modal-img-wrap" onClick={() => setLightbox(true)} title="Click to zoom">
            <img className="modal-img" src={event.image_url} alt={event.title} />
            <div className="modal-img-zoom-hint"><ZoomIn size={18} strokeWidth={2} /></div>
          </div>
        )}

        <div className="modal-body">
          <div className="modal-title">{event.title}</div>

          <div className="modal-fields">
            <div className="modal-field">
              <label><MapPin size={12} strokeWidth={2} className="field-icon" /> Venue</label>
              <span>{event.venue}</span>
            </div>
            <div className="modal-field">
              <label><Globe size={12} strokeWidth={2} className="field-icon" /> City</label>
              <span>{event.city || 'Vancouver'}</span>
            </div>
            {(formattedDate || event.date) && (
              <div className="modal-field">
                <label><CalendarDays size={12} strokeWidth={2} className="field-icon" /> Date</label>
                <span>{formattedDate || event.date}{event.time ? ` at ${event.time}` : ''}</span>
              </div>
            )}
            {event.artist && event.artist !== event.title && (
              <div className="modal-field">
                <label><Mic2 size={12} strokeWidth={2} className="field-icon" /> Artist</label>
                <span>{event.artist}</span>
              </div>
            )}
            {price && (
              <div className="modal-field">
                <label><Tag size={12} strokeWidth={2} className="field-icon" /> Price</label>
                <span className="price-badge">{price}</span>
              </div>
            )}
            {genreList.length > 0 && (
              <div className="modal-field">
                <label><Music size={12} strokeWidth={2} className="field-icon" /> Genre</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {genreList.map((g) => (
                    <span key={g} className="genre-badge">{g}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="modal-field">
              <label><Globe size={12} strokeWidth={2} className="field-icon" /> Source</label>
              <span>{SOURCE_LABELS[event.source] || event.source}</span>
            </div>
          </div>

          {event.description && (
            <div className="modal-field">
              <label>Description</label>
              <p className="modal-description">{event.description}</p>
            </div>
          )}

          {event.ticket_url && (
            <a
              href={event.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              <Ticket size={16} strokeWidth={2} /> Buy Tickets
            </a>
          )}

          {event.image_url && (
            <ImageAnalysis
              event={event}
              onAnalysisComplete={handleAnalysisComplete}
              toast={toast}
            />
          )}

          {/* Participants / Interest List */}
          <div className="participants-section">
            <h4><Users size={14} strokeWidth={2} className="field-icon" /> Interest List ({participants.length})</h4>
            {participants.length > 0 && (
              <div className="participant-list">
                {participants.map((p) => (
                  <div key={p.id} className="participant-tag">
                    <span>{p.name}</span>
                    <button onClick={() => handleRemove(p.id)} title="Remove">×</button>
                  </div>
                ))}
              </div>
            )}
            <form className="participant-form" onSubmit={handleAddParticipant}>
              <input
                type="text"
                placeholder="Add your name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={80}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={adding || !newName.trim()}
              >
                {adding ? <span className="spinner" /> : 'Join'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
