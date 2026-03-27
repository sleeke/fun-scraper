import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import EventCard from './components/EventCard';
import EventDetail from './components/EventDetail';
import ScrapePanel from './components/ScrapePanel';
import EventLinkPanel from './components/EventLinkPanel';
import Toast from './components/Toast';
import { useToast } from './hooks/useToast';

const GENRES = ['', 'electronic', 'hip-hop', 'rock', 'jazz', 'pop', 'classical', 'country', 'reggae', 'latin'];
const SOURCES = ['', 'blueprint', 'ticketmaster', 'celebrities', 'redroom', 'fortune', 'industrial236', 'residentadvisor', 'thisisblueprint'];
const SOURCE_LABELS = {
  '': 'All Sources',
  blueprint: 'Blueprint',
  ticketmaster: 'Ticketmaster',
  celebrities: 'Celebrities',
  redroom: 'Red Room',
  fortune: 'Fortune Sound',
  industrial236: 'Industrial 236',
  residentadvisor: 'Resident Advisor',
  thisisblueprint: 'This Is Blueprint',
};
const GENRE_LABELS = { '': 'All Genres', electronic: 'Electronic', 'hip-hop': 'Hip-Hop', rock: 'Rock', jazz: 'Jazz', pop: 'Pop', classical: 'Classical', country: 'Country', reggae: 'Reggae', latin: 'Latin' };
const PAGE_SIZE = 20;

export default function App() {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [source, setSource] = useState('');
  const [interestedOnly, setInterestedOnly] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const { toasts, addToast } = useToast();
  const searchTimer = useRef(null);

  const fetchEvents = useCallback(
    async (opts = {}) => {
      setLoading(true);
      try {
        const params = {
          search: opts.search ?? search,
          genre: opts.genre ?? genre,
          source: opts.source ?? source,
          page: opts.page ?? page,
          limit: PAGE_SIZE,
          ...(((opts.interestedOnly ?? interestedOnly)) ? { has_participants: 'true' } : {}),
        };
        const data = await api.getEvents(params);
        setEvents(data.events);
        setTotal(data.total);
      } catch (err) {
        addToast('Failed to load events: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [search, genre, source, page, interestedOnly, addToast]
  );

  // Initial load
  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filters/page change (debounce search)
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchEvents({ page: 1, search, genre, source, interestedOnly });
    }, 300);
    return () => clearTimeout(searchTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, genre, source, interestedOnly]);

  // Re-fetch on page change
  useEffect(() => {
    fetchEvents({ page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleCardClick(event) {
    try {
      const full = await api.getEvent(event.id);
      setSelectedEvent(full);
    } catch {
      setSelectedEvent(event);
    }
  }

  function handleParticipantsChange(eventId, count) {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, participant_count: count } : e
      )
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="app">
      <nav className="navbar">
        <a href="/" className="navbar-brand">🎶 fun-scraper</a>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Vancouver Events</span>
      </nav>

      <main className="main-content">
        <ScrapePanel onScraped={() => fetchEvents({ page: 1 })} toast={addToast} />
        <EventLinkPanel toast={addToast} />

        {/* Search / Filter Bar */}
        <div className="search-bar">
          <input
            type="text"
            placeholder="🔍 Search events, artists, venues…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={genre} onChange={(e) => setGenre(e.target.value)}>
            {GENRES.map((g) => (
              <option key={g} value={g}>{GENRE_LABELS[g] || g}</option>
            ))}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>
            ))}
          </select>
          <button
            className={`btn ${interestedOnly ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setInterestedOnly((v) => !v); setPage(1); }}
            title="Show only events with interested users"
          >
            👥 Interested
          </button>
        </div>

        {/* Events Header */}
        <div className="events-header">
          <span className="events-count">
            {loading ? 'Loading…' : `${total} event${total !== 1 ? 's' : ''} found`}
          </span>
        </div>

        {/* Events Grid */}
        {events.length === 0 && !loading ? (
          <div className="empty-state">
            <div className="icon">🎸</div>
            <p>No events found. Try scraping a source above!</p>
          </div>
        ) : (
          <div className="event-grid">
            {events.map((ev) => (
              <EventCard key={ev.id} event={ev} onClick={handleCardClick} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="btn btn-ghost"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              ← Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              className="btn btn-ghost"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </main>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onParticipantsChange={handleParticipantsChange}
          toast={addToast}
        />
      )}

      <Toast toasts={toasts} />
    </div>
  );
}
