const BASE = '/api';

let token = localStorage.getItem('tunecloud-token');

export function setAuthToken(t) {
  token = t;
  if (t) localStorage.setItem('tunecloud-token', t);
  else localStorage.removeItem('tunecloud-token');
}

export function getAuthToken() {
  return token;
}

async function fetchJson(url, opts = {}) {
  const hasBody = opts.body !== undefined && opts.body !== null;
  const headers = { ...opts.headers };
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${url}`, {
    ...opts,
    headers,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = await res.json();
      msg = err.error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

export const api = {
  browse: (dir) => fetchJson(`/browse/dirs?dir=${encodeURIComponent(dir || '')}`),
  tree: () => fetchJson('/browse/tree'),
  tracks: (params) => fetchJson(`/tracks?${new URLSearchParams(params)}`),
  track: (id) => fetchJson(`/tracks/${id}`),
  albums: () => fetchJson('/albums'),
  album: (id) => fetchJson(`/albums/${id}`),
  artists: () => fetchJson('/artists'),
  search: (q) => fetchJson(`/search?q=${encodeURIComponent(q)}`),
  streamUrl: (id) => `${BASE}/stream/${id}`,
  coverUrl: (path) => path ? (path.startsWith('/api/') ? path : `${BASE}${path}`) : null,
  albumCover: (id) => `${BASE}/cover/album/${id}`,
  scan: () => fetchJson('/scan', { method: 'POST', body: JSON.stringify({}) }),
  scanStatus: () => fetchJson('/scan/status'),
  tags: (id) => fetchJson(`/tags/${id}`),
  updateTags: (id, data) => fetchJson(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  spotifyArtist: (name) => fetchJson(`/spotify/artist?name=${encodeURIComponent(name)}`),
  login: (username, password) => fetchJson('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username, password) => fetchJson('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => fetchJson('/auth/me'),
  adminUsers: () => fetchJson('/auth/users'),
};
