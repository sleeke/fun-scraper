import { useState, useRef } from 'react';
import { PlusCircle, Link, FileUp, CheckCircle, AlertCircle, X, Upload } from 'lucide-react';
import { api } from '../api';

const MAX_FILES = 5;

const GENRES = ['', 'electronic', 'hip-hop', 'rock', 'jazz', 'pop', 'classical', 'country', 'reggae', 'latin'];
const GENRE_LABELS = {
  '': 'Detect automatically',
  electronic: 'Electronic',
  'hip-hop': 'Hip-Hop',
  rock: 'Rock',
  jazz: 'Jazz',
  pop: 'Pop',
  classical: 'Classical',
  country: 'Country',
  reggae: 'Reggae',
  latin: 'Latin',
};

const EMPTY_FORM = {
  title: '', venue: '', artist: '', city: 'Vancouver',
  date: '', time: '', price_text: '', genre: '',
  ticket_url: '', image_url: '', description: '',
};

/** Format "N event(s) saved" consistently. */
function eventCountMsg(n) {
  return `${n} event${n !== 1 ? 's' : ''} saved`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ResultsList({ results, labelKey }) {
  if (!results || results.length === 0) return null;
  return (
    <div className="contribute-results">
      {results.map((r, i) => {
        const label = r[labelKey] || `Item ${i + 1}`;
        return (
          <div key={i} className={`contribute-result ${r.error ? 'error' : 'success'}`}>
            <div className="contribute-result-header">
              {r.error
                ? <AlertCircle size={14} strokeWidth={2} />
                : <CheckCircle size={14} strokeWidth={2} />}
              <span className="contribute-result-label">{label}</span>
            </div>
            {r.error
              ? <p className="contribute-result-msg error">{r.error}</p>
              : (
                <p className="contribute-result-msg success">
                  {r.events.length === 1
                    ? `1 event saved: "${r.events[0].title}"`
                    : eventCountMsg(r.events.length)}
                </p>
              )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form tab
// ---------------------------------------------------------------------------

function FormTab({ toast, onContributed }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageMode, setImageMode] = useState('url'); // 'url' | 'upload'
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleImageFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setImagePreview(dataUrl);
      setForm((f) => ({ ...f, image_url: dataUrl }));
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImagePreview(null);
    setForm((f) => ({ ...f, image_url: '' }));
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.venue.trim()) {
      toast('Title and venue are required', 'error');
      return;
    }
    setLoading(true);
    try {
      await api.contributeForm(form);
      toast('Event submitted successfully!', 'success');
      setForm(EMPTY_FORM);
      setImagePreview(null);
      onContributed && onContributed();
    } catch (err) {
      toast(`Failed to submit: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="contribute-form" onSubmit={handleSubmit}>
      <div className="contribute-form-grid">
        {/* Title */}
        <div className="contribute-field contribute-field--full">
          <label>Title <span className="required">*</span></label>
          <input name="title" value={form.title} onChange={handleChange} placeholder="Event title" required />
        </div>

        {/* Venue */}
        <div className="contribute-field">
          <label>Venue <span className="required">*</span></label>
          <input name="venue" value={form.venue} onChange={handleChange} placeholder="Venue name" required />
        </div>

        {/* Artist */}
        <div className="contribute-field">
          <label>Artist / Performer</label>
          <input name="artist" value={form.artist} onChange={handleChange} placeholder="Artist name" />
        </div>

        {/* Date */}
        <div className="contribute-field">
          <label>Date</label>
          <input name="date" type="date" value={form.date} onChange={handleChange} />
        </div>

        {/* Time */}
        <div className="contribute-field">
          <label>Time</label>
          <input name="time" type="time" value={form.time} onChange={handleChange} />
        </div>

        {/* Price */}
        <div className="contribute-field">
          <label>Price</label>
          <input name="price_text" value={form.price_text} onChange={handleChange} placeholder="e.g. $20, Free" />
        </div>

        {/* Genre */}
        <div className="contribute-field">
          <label>Genre</label>
          <select name="genre" value={form.genre} onChange={handleChange}>
            {GENRES.map((g) => <option key={g} value={g}>{GENRE_LABELS[g]}</option>)}
          </select>
        </div>

        {/* City */}
        <div className="contribute-field">
          <label>City</label>
          <input name="city" value={form.city} onChange={handleChange} placeholder="Vancouver" />
        </div>

        {/* Ticket URL */}
        <div className="contribute-field contribute-field--full">
          <label>Ticket / Event URL</label>
          <input name="ticket_url" value={form.ticket_url} onChange={handleChange} placeholder="https://..." />
        </div>

        {/* Image */}
        <div className="contribute-field contribute-field--full">
          <label>Event Image</label>
          <div className="contribute-image-toggle">
            <button
              type="button"
              className={`contribute-toggle-btn ${imageMode === 'url' ? 'active' : ''}`}
              onClick={() => { setImageMode('url'); clearImage(); }}
            >
              URL
            </button>
            <button
              type="button"
              className={`contribute-toggle-btn ${imageMode === 'upload' ? 'active' : ''}`}
              onClick={() => { setImageMode('upload'); setForm((f) => ({ ...f, image_url: '' })); }}
            >
              Upload file
            </button>
          </div>

          {imageMode === 'url' ? (
            <input
              name="image_url"
              value={form.image_url}
              onChange={handleChange}
              placeholder="https://example.com/flyer.jpg"
            />
          ) : (
            <div className="contribute-image-upload">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleImageFile}
                id="img-file-input"
                style={{ display: 'none' }}
              />
              <label htmlFor="img-file-input" className="contribute-file-label">
                <Upload size={16} strokeWidth={2} /> Choose image…
              </label>
              {imagePreview && (
                <div className="contribute-image-preview">
                  <img src={imagePreview} alt="preview" />
                  <button type="button" onClick={clearImage} title="Remove image">
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Description */}
        <div className="contribute-field contribute-field--full">
          <label>Description</label>
          <textarea name="description" value={form.description} onChange={handleChange} placeholder="Event description…" rows={3} />
        </div>
      </div>

      <div className="contribute-actions">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          <PlusCircle size={15} strokeWidth={2} />
          {loading ? 'Submitting…' : 'Submit Event'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// URL tab
// ---------------------------------------------------------------------------

function UrlTab({ toast, onContributed }) {
  const [urlText, setUrlText] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const urls = urlText
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      toast('Please enter at least one URL', 'error');
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      const data = await api.contributeUrl(urls);
      setResults(data.results);
      const totalSaved = data.results.reduce((sum, r) => sum + r.events.length, 0);
      if (totalSaved > 0) {
        toast(`${eventCountMsg(totalSaved)} extracted and saved!`, 'success');
        onContributed && onContributed();
      } else {
        toast('No events could be extracted from the provided URLs', 'error');
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="contribute-url-form" onSubmit={handleSubmit}>
      <p className="contribute-hint">
        Paste one or more event-page URLs (one per line). We'll try to extract event details automatically.
      </p>
      <textarea
        value={urlText}
        onChange={(e) => setUrlText(e.target.value)}
        placeholder={'https://venue.com/event/1\nhttps://ticketmaster.com/event/2'}
        rows={5}
        disabled={loading}
      />
      <div className="contribute-actions">
        <button type="submit" className="btn btn-primary" disabled={loading || !urlText.trim()}>
          <Link size={15} strokeWidth={2} />
          {loading ? 'Fetching…' : 'Extract Events'}
        </button>
      </div>
      <ResultsList results={results} labelKey="url" />
    </form>
  );
}

// ---------------------------------------------------------------------------
// File tab
// ---------------------------------------------------------------------------

function FileTab({ toast, onContributed }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function addFiles(incoming) {
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      const newOnes = [...incoming].filter((f) => !existing.has(f.name + f.size));
      return [...prev, ...newOnes].slice(0, MAX_FILES);
    });
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function onDragOver(e) { e.preventDefault(); setDragging(true); }
  function onDragLeave() { setDragging(false); }
  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (files.length === 0) {
      toast('Please select at least one file', 'error');
      return;
    }
    setLoading(true);
    setResults(null);

    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));

    try {
      const data = await api.contributeFile(formData);
      setResults(data.results);
      const totalSaved = data.results.reduce((sum, r) => sum + r.events.length, 0);
      if (totalSaved > 0) {
        toast(`${eventCountMsg(totalSaved)} extracted and saved!`, 'success');
        setFiles([]);
        onContributed && onContributed();
      } else {
        toast('No events could be extracted from the uploaded files', 'error');
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="contribute-file-form" onSubmit={handleSubmit}>
      <p className="contribute-hint">
        Upload PDF or plain-text files containing event listings. Up to {MAX_FILES} files at a time (10 MB each).
      </p>

      {/* Drop zone */}
      <div
        className={`contribute-dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <FileUp size={28} strokeWidth={1.5} />
        <p>Drag &amp; drop files here, or <span className="link-style">click to browse</span></p>
        <p className="contribute-hint-small">Supported: PDF, TXT</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* Selected files list */}
      {files.length > 0 && (
        <ul className="contribute-file-list">
          {files.map((f, i) => (
            <li key={i}>
              <span>{f.name}</span>
              <span className="contribute-file-size">({(f.size / 1024).toFixed(0)} KB)</span>
              <button type="button" onClick={() => removeFile(i)} title="Remove">
                <X size={13} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="contribute-actions">
        <button type="submit" className="btn btn-primary" disabled={loading || files.length === 0}>
          <FileUp size={15} strokeWidth={2} />
          {loading ? 'Processing…' : 'Upload & Extract'}
        </button>
      </div>

      <ResultsList results={results} labelKey="filename" />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main ContributePanel
// ---------------------------------------------------------------------------

const TAB_ICONS = { form: PlusCircle, url: Link, file: FileUp };
const TABS = [
  { id: 'form', label: 'Form' },
  { id: 'url',  label: 'URL'  },
  { id: 'file', label: 'File' },
];

export default function ContributePanel({ onContributed, toast }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('form');

  function handleContributed() {
    onContributed && onContributed();
  }

  return (
    <div className="contribute-panel">
      <button
        className="contribute-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <PlusCircle size={15} strokeWidth={2} />
        Contribute an Event
        <span className={`contribute-chevron ${open ? 'open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="contribute-body">
          {/* Tab bar */}
          <div className="contribute-tabs">
            {TABS.map(({ id, label }) => {
              const TabIcon = TAB_ICONS[id];
              return (
                <button
                  key={id}
                  className={`contribute-tab ${tab === id ? 'active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  <TabIcon size={14} strokeWidth={2} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="contribute-content">
            {tab === 'form' && <FormTab toast={toast} onContributed={handleContributed} />}
            {tab === 'url'  && <UrlTab  toast={toast} onContributed={handleContributed} />}
            {tab === 'file' && <FileTab toast={toast} onContributed={handleContributed} />}
          </div>
        </div>
      )}
    </div>
  );
}
