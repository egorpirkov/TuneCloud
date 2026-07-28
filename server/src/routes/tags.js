import path from 'path';
import NodeID3 from 'node-id3';
import pkg from 'music-metadata';
const { parseFile } = pkg;
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const MP3_EXTS = ['.mp3'];
const TAG_EXTS = ['.mp3', '.flac', '.ogg', '.opus', '.m4a', '.aac', '.wma', '.wav'];

async function ensureArtist(name) {
  if (!name || name.trim() === '') return null;
  name = name.trim();
  const { rows } = await query(
    `INSERT INTO artists (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [name]
  );
  return rows[0].id;
}

async function ensureAlbum(title, artistId, year, genre) {
  if (!title || title.trim() === '') return null;
  title = title.trim();
  const { rows } = await query(
    `INSERT INTO albums (title, artist_id, year, genre)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (title, artist_id) DO UPDATE SET year = COALESCE(EXCLUDED.year, albums.year), genre = COALESCE(EXCLUDED.genre, albums.genre)
     RETURNING id`,
    [title, artistId, year || null, genre || null]
  );
  return rows[0].id;
}

async function writeTags(filePath, updates) {
  const ext = path.extname(filePath).toLowerCase();

  if (MP3_EXTS.includes(ext)) {
    const tags = {};
    if (updates.title !== undefined) tags.title = updates.title;
    if (updates.artist !== undefined) tags.artist = updates.artist;
    if (updates.album !== undefined) tags.album = updates.album;
    if (updates.trackNumber !== undefined) tags.trackNumber = updates.trackNumber;
    if (updates.genre !== undefined) tags.genre = updates.genre;
    if (updates.year !== undefined) tags.year = updates.year;
    return NodeID3.update(tags, filePath);
  }

  throw new Error(`Tag writing not supported for ${ext} files`);
}

async function readTags(filePath) {
  const metadata = await parseFile(filePath, { skipCovers: true });
  const c = metadata.common || {};
  return {
    title: c.title || '',
    artist: c.artist || '',
    album: c.album || '',
    track: c.track?.no || '',
    year: c.year || '',
    genre: c.genre?.[0] || '',
  };
}

export default async function tagRoutes(fastify) {
  fastify.put('/api/tags/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const { rows } = await query('SELECT file_path FROM tracks WHERE id = $1', [id]);

    if (rows.length === 0) {
      return reply.status(404).send({ error: 'Track not found' });
    }

    const filePath = rows[0].file_path;
    const ext = path.extname(filePath).toLowerCase();

    if (!MP3_EXTS.includes(ext)) {
      return reply.status(400).send({ error: `Tag editing only supported for MP3 files. ${ext} is read-only.` });
    }

    const updates = req.body;

    try {
      await writeTags(filePath, updates);
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to write tags: ' + err.message });
    }

    // Update DB
    const dbUpdates = [];
    const dbParams = [];
    let idx = 1;

    if (updates.title !== undefined) {
      dbUpdates.push(`title = $${idx++}`);
      dbParams.push(updates.title || path.basename(filePath, path.extname(filePath)));
    }
    if (updates.genre !== undefined) {
      dbUpdates.push(`genre = $${idx++}`);
      dbParams.push(updates.genre || null);
    }
    if (updates.year !== undefined) {
      dbUpdates.push(`year = $${idx++}`);
      dbParams.push(updates.year ? parseInt(updates.year, 10) : null);
    }
    if (updates.trackNumber !== undefined) {
      dbUpdates.push(`track_number = $${idx++}`);
      dbParams.push(updates.trackNumber ? parseInt(updates.trackNumber, 10) : null);
    }

    if (updates.artist !== undefined) {
      const artistId = updates.artist ? await ensureArtist(updates.artist) : null;
      dbUpdates.push(`artist_id = $${idx++}`);
      dbParams.push(artistId);
    }

    if (updates.album !== undefined) {
      const currentTrack = await query('SELECT artist_id FROM tracks WHERE id = $1', [id]);
      const artistId = currentTrack.rows[0]?.artist_id || null;
      const albumId = updates.album ? await ensureAlbum(updates.album, artistId, updates.year, updates.genre) : null;
      dbUpdates.push(`album_id = $${idx++}`);
      dbParams.push(albumId);
    }

    if (dbUpdates.length > 0) {
      dbUpdates.push(`updated_at = NOW()`);
      dbParams.push(id);
      await query(`UPDATE tracks SET ${dbUpdates.join(', ')} WHERE id = $${idx}`, dbParams);
    }

    return { success: true };
  });

  fastify.get('/api/tags/:id', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await query('SELECT file_path FROM tracks WHERE id = $1', [id]);

    if (rows.length === 0) {
      return reply.status(404).send({ error: 'Track not found' });
    }

    const filePath = rows[0].file_path;
    const ext = path.extname(filePath).toLowerCase();

    if (!TAG_EXTS.includes(ext)) {
      return reply.status(400).send({ error: `Tag reading not supported for ${ext} files` });
    }

    try {
      const tags = await readTags(filePath);
      return tags;
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to read tags: ' + err.message });
    }
  });
}
