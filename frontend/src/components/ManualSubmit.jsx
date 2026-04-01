import { useState, useRef } from 'react';
import { api } from '../api';

export default function ManualSubmit({ onSubmitted, toast }) {
  const [url, setUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);

  const [pdfLoading, setPdfLoading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleUrlSubmit(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setUrlLoading(true);
    try {
      const event = await api.submitEventUrl(url.trim());
      toast(`Event added: ${event.title}`, 'success');
      setUrl('');
      onSubmitted && onSubmitted();
    } catch (err) {
      toast(err.message || 'Failed to submit URL', 'error');
    } finally {
      setUrlLoading(false);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setPdfLoading(true);
    try {
      const event = await api.submitEventPdf(file);
      toast(`Event added: ${event.title}`, 'success');
      onSubmitted && onSubmitted();
    } catch (err) {
      toast(err.message || 'Failed to process document', 'error');
    } finally {
      setPdfLoading(false);
      // Reset file input so the same file can be re-submitted if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="scrape-panel">
      <h3>Submit Event</h3>
      <div className="manual-submit-section">
        <form className="manual-submit-url" onSubmit={handleUrlSubmit}>
          <input
            type="url"
            className="manual-submit-input"
            placeholder="Paste an event URL…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={urlLoading}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={urlLoading || !url.trim()}
          >
            {urlLoading ? <><span className="spinner" /> Fetching…</> : '↓ Import'}
          </button>
        </form>

        <div className="manual-submit-divider">or</div>

        <div className="manual-submit-pdf">
          <input
            ref={fileInputRef}
            id="pdf-upload"
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={pdfLoading}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={pdfLoading}
          >
            {pdfLoading ? <><span className="spinner" /> Processing…</> : '📄 Upload PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
