import { useState } from 'react';
import { api } from '../api';
import { SOURCE_LABELS, GENRE_EMOJI, formatPrice, formatDateWithWeekday } from './eventUtils';
import ImageAnalysis from './ImageAnalysis';

export default function EventDetail({ event, onClose, onParticipantsChange, toast }) {
  const [participants, setParticipants] = useState(event.participants || []);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
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
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        {event.image_url && (
          <img className="modal-img" src={event.image_url} alt={event.title} />
        )}

        <div className="modal-body">
          <div className="modal-title">{event.title}</div>

          <div className="modal-fields">
            <div className="modal-field">
              <label>Venue</label>
              <span>📍 {event.venue}</span>
            </div>
            <div className="modal-field">
              <label>City</label>
              <span>{event.city || 'Vancouver'}</span>
            </div>
            {(formattedDate || event.date) && (
              <div className="modal-field">
                <label>Date</label>
                <span>📅 {formattedDate || event.date}{event.time ? ` at ${event.time}` : ''}</span>
              </div>
            )}
            {event.artist && event.artist !== event.title && (
              <div className="modal-field">
                <label>Artist</label>
                <span>🎤 {event.artist}</span>
              </div>
            )}
            {price && (
              <div className="modal-field">
                <label>Price</label>
                <span className="price-badge">{price}</span>
              </div>
            )}
            {genreList.length > 0 && (
              <div className="modal-field">
                <label>Genre</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {genreList.map((g) => (
                    <span key={g} className="genre-badge">
                      {GENRE_EMOJI[g] || '🎶'} {g}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="modal-field">
              <label>Source</label>
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
              🎟️ Buy Tickets
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
            <h4>👥 Interest List ({participants.length})</h4>
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
  );
}
