import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../covers');
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SEARCH_URL = 'https://api.spotify.com/v1/search';

let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) return null;

  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

export async function searchArtist(name) {
  const token = await getAccessToken();
  if (!token) return null;

  const query = `artist:"${name}"`;
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&type=artist&limit=10`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const artists = data.artists?.items || [];

    const normalized = name.toLowerCase().trim();
    const exact = artists.find(
      (a) => a.name.toLowerCase().trim() === normalized
    );

    const match = exact || artists[0];
    if (!match || !match.images?.length) return null;

    return {
      id: match.id,
      name: match.name,
      image: match.images[0].url,
      thumbnail: match.images[match.images.length - 1]?.url || match.images[0].url,
      followers: match.followers?.total || 0,
      genres: match.genres || [],
    };
  } catch {
    return null;
  }
}

function cachePath(artistId) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, `artist_${artistId}.jpg`);
}

export async function getArtistImage(name, artistDbId) {
  const cached = path.join(CACHE_DIR, `artist_${artistDbId}.jpg`);
  if (fs.existsSync(cached)) return `/api/cover/artist_${artistDbId}.jpg`;

  const info = await searchArtist(name);
  if (!info?.image) return null;

  try {
    const imgRes = await fetch(info.image);
    if (!imgRes.ok) return null;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(cached, buf);
    return `/api/cover/artist_${artistDbId}.jpg`;
  } catch {
    return null;
  }
}
