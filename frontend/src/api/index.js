const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Events
  getEvents: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return request(`/events${qs ? '?' + qs : ''}`);
  },
  getEvent: (id) => request(`/events/${id}`),
  createEvent: (data) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),

  // Participants
  getParticipants: (eventId) => request(`/events/${eventId}/participants`),
  addParticipant: (eventId, name) =>
    request(`/events/${eventId}/participants`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  removeParticipant: (eventId, participantId) =>
    request(`/events/${eventId}/participants/${participantId}`, { method: 'DELETE' }),

  // Scraping
  getSources: () => request('/scrape/sources'),
  scrape: (source, url) =>
    request('/scrape', { method: 'POST', body: JSON.stringify({ source, url }) }),

  // Image analysis
  analyzeEvent: (eventId) =>
    request(`/events/${eventId}/analyze`, { method: 'POST' }),
};
