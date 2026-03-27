import { useState } from 'react';
import { api } from '../api';

const SOURCE_LABELS = {
  blueprint: 'Blueprint',
  ticketmaster: 'Ticketmaster',
  celebrities: 'Celebrities',
  redroom: 'Red Room',
  fortune: 'Fortune Sound',
  industrial236: 'Industrial 236',
  residentadvisor: 'Resident Advisor',
  thisisblueprint: 'This Is Blueprint',
};

export default function ScrapePanel({ onScraped, toast }) {
  const [loading, setLoading] = useState({});
  const [status, setStatus] = useState(null);

  async function handleScrape(source) {
    setLoading((prev) => ({ ...prev, [source]: true }));
    setStatus({ type: 'info', message: `Scraping ${SOURCE_LABELS[source] || source}…` });
    try {
      const result = await api.scrape(source);
      const msg = `✅ ${SOURCE_LABELS[source]}: found ${result.scraped} events (${result.inserted ?? 0} new)`;
      setStatus({ type: 'success', message: msg });
      toast(msg, 'success');
      onScraped && onScraped();
    } catch (err) {
      const msg = `❌ ${SOURCE_LABELS[source]}: ${err.message}`;
      setStatus({ type: 'error', message: msg });
      toast(msg, 'error');
    } finally {
      setLoading((prev) => ({ ...prev, [source]: false }));
    }
  }

  const anyLoading = Object.values(loading).some(Boolean);

  return (
    <div className="scrape-panel">
      <h3>Scrape Events</h3>
      <div className="scrape-sources">
        {Object.entries(SOURCE_LABELS).map(([key, label]) => (
          <button
            key={key}
            className="scrape-btn"
            onClick={() => handleScrape(key)}
            disabled={loading[key] || anyLoading}
          >
            {loading[key] ? <span className="spinner" style={{ width: 12, height: 12 }} /> : null}
            {label}
          </button>
        ))}
      </div>
      {status && (
        <div className={`scrape-status ${status.type}`}>{status.message}</div>
      )}
    </div>
  );
}
