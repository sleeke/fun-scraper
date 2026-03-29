import { useState, useEffect, useCallback, useRef } from 'react';import { Search, Users, ChevronLeft, ChevronRight, Music2 } from 'lucide-react';
import { api } from './api';
import EventCard from './components/EventCard';
import EventDetail from './components/EventDetail';
import ScrapePanel from './components/ScrapePanel';
import ContributePanel from './components/ContributePanel';
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
  const gridRef = useRef(null);
  const [mobileActiveId, setMobileActiveId] = useState(null);

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
        // The server already filters past events using local date.
        // Trust the server's response directly — a client-side UTC filter would
        // cause a date mismatch and make the last page appear to have fewer events
        // than the pagination total implies.
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

  // Mobile: activate the first fully-visible card after 1.5s dwell; deactivate all others
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

    const visibleCards = new Set();
    let dwellTimer = null;
    let currentDwellTarget = null;

    function getTopmost() {
      if (visibleCards.size === 0) return null;
      let topmost = null;
      let minTop = Infinity;
      for (const el of visibleCards) {
        const top = el.getBoundingClientRect().top;
        if (top < minTop) { minTop = top; topmost = el; }
      }
      return topmost;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleCards.add(entry.target);
          else visibleCards.delete(entry.target);
        }

        const topmost = getTopmost();
        const topmostId = topmost ? topmost.dataset.eventId : null;

        if (topmostId !== currentDwellTarget) {
          clearTimeout(dwellTimer);
          currentDwellTarget = topmostId;
          setMobileActiveId(null);
          if (topmostId) {
            dwellTimer = setTimeout(() => setMobileActiveId(topmostId), 1500);
          }
        }
      },
      { threshold: 1.0 }
    );

    grid.querySelectorAll('.event-card').forEach((card) => observer.observe(card));

    return () => {
      clearTimeout(dwellTimer);
      observer.disconnect();
      visibleCards.clear();
      setMobileActiveId(null);
    };
  }, [events]);

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
        <a href="/" className="navbar-brand"><Music2 size={20} strokeWidth={2} /> fun-scraper</a>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Vancouver Events</span>
      </nav>

      <main className="main-content">
        <ScrapePanel onScraped={() => fetchEvents({ page: 1 })} toast={addToast} />
        <ContributePanel onContributed={() => fetchEvents({ page: 1 })} toast={addToast} />

        {/* Search / Filter Bar */}
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search events, artists, venues…"
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
            <Users size={15} strokeWidth={2} /> Interested
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
            <div className="icon"><Music2 size={48} strokeWidth={1} /></div>
            <p>No events found. Try scraping a source above!</p>
          </div>
        ) : (
          <div className="event-grid" ref={gridRef}>
            {events.map((ev) => (
              <EventCard key={ev.id} event={ev} onClick={handleCardClick} isActive={String(ev.id) === mobileActiveId} />
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
              <ChevronLeft size={16} strokeWidth={2} /> Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              className="btn btn-ghost"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next <ChevronRight size={16} strokeWidth={2} />
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
