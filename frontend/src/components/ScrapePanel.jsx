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
  const [results, setResults] = useState({});

  async function handleScrape(source) {
    setLoading((prev) => ({ ...prev, [source]: true }));
    setResults((prev) => ({ ...prev, [source]: { type: 'info', message: 'Scraping…' } }));
    try {
      const result = await api.scrape(source);
      const msg = `✅ Found ${result.scraped} events (${result.inserted ?? 0} new)`;
      console.log(`[scrape] ${SOURCE_LABELS[source]}:`, result);
      setResults((prev) => ({ ...prev, [source]: { type: 'success', message: msg } }));
      toast(`✅ ${SOURCE_LABELS[source]}: ${msg.replace('✅ ', '')}`, 'success');
      onScraped && onScraped();
    } catch (err) {
      const msg = err.message || 'Unknown error';
      console.error(`[scrape] ${SOURCE_LABELS[source]} failed:`, msg);
      setResults((prev) => ({ ...prev, [source]: { type: 'error', message: `❌ ${msg}` } }));
      toast(`❌ ${SOURCE_LABELS[source]}: ${msg}`, 'error');
    } finally {
      setLoading((prev) => ({ ...prev, [source]: false }));
    }
  }

  const anyLoading = Object.values(loading).some(Boolean);

  return (
    <div className="scrape-panel">
      <h3>Scrape Events</h3>
      <div className="scrape-sources">
        {Object.entries(SOURCE_LABELS).map(([key, label]) => {
          const result = results[key];
          const statusClass =
            result?.type === 'success'
              ? 'success'
              : result?.type === 'error'
              ? 'error'
              : '';
          const tooltip =
            result?.type === 'error'
              ? result.message.replace(/^❌ /, '')
              : result?.type === 'success'
              ? result.message.replace(/^✅ /, '')
              : undefined;
          return (
            <button
              key={key}
              className={`scrape-btn${statusClass ? ` ${statusClass}` : ''}`}
              onClick={() => handleScrape(key)}
              disabled={loading[key] || anyLoading}
              title={tooltip}
            >
              {loading[key] ? <span className="spinner" style={{ width: 12, height: 12 }} /> : null}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
