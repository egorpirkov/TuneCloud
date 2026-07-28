import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'music-metadata';
const { parseFile } = pkg;
import { query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COVERS_DIR = path.resolve(__dirname, '../covers');
const COVER_NAMES = ['cover.jpg', 'cover.png', 'folder.jpg', 'front.jpg', 'Cover.jpg'];

export async function initCoversDir() {
  if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
  }
}

function saveCoverBuffer(buffer, format, albumId) {
  const ext = format?.split('/')[1] || 'jpg';
  const filename = `album_${albumId}.${ext}`;
  const filepath = path.join(COVERS_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return `/api/cover/${filename}`;
}

export async function extractAlbumCover(albumId, trackDir) {
  const { rows } = await query('SELECT cover_path FROM albums WHERE id = $1', [albumId]);
  if (rows.length === 0) return null;
  if (rows[0].cover_path) return rows[0].cover_path;

  for (const name of COVER_NAMES) {
    const coverFile = path.join(trackDir, name);
    if (fs.existsSync(coverFile)) {
      const buf = fs.readFileSync(coverFile);
      const format = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const url = saveCoverBuffer(buf, format, albumId);
      await query('UPDATE albums SET cover_path = $1 WHERE id = $2', [url, albumId]);
      return url;
    }
  }

  return null;
}

export async function extractCoverFromTrack(trackId, filePath, albumId) {
  if (!albumId) return null;

  const { rows } = await query('SELECT cover_path FROM albums WHERE id = $1', [albumId]);
  if (rows.length === 0 || rows[0].cover_path) return rows[0].cover_path;

  try {
    const meta = await parseFile(filePath, { skipCovers: false });
    const pictures = meta.common.picture;
    if (pictures && pictures.length > 0) {
      const pic = pictures[0];
      const url = saveCoverBuffer(pic.data, pic.format, albumId);
      await query('UPDATE albums SET cover_path = $1 WHERE id = $2', [url, albumId]);
      return url;
    }
  } catch {}

  const trackDir = path.dirname(filePath);
  return extractAlbumCover(albumId, trackDir);
}

export async function extractAllMissingCovers() {
  const { rows: albums } = await query(
    `SELECT al.id, al.title, al.artist_id, MIN(t.file_path) as sample_path
     FROM albums al
     LEFT JOIN tracks t ON t.album_id = al.id
     WHERE al.cover_path IS NULL
     GROUP BY al.id, al.title, al.artist_id`
  );

  let done = 0;
  for (const album of albums) {
    if (!album.sample_path) continue;
    const url = await extractCoverFromTrack(null, album.sample_path, album.id);
    if (url) done++;
  }
  return { total: albums.length, extracted: done };
}

export function coverUrl(filename) {
  const filepath = path.join(COVERS_DIR, path.basename(filename));
  if (fs.existsSync(filepath)) return filepath;
  return null;
}
