import { query } from '../db.js';
import fs from 'fs';
import path from 'path';

export default async function browseRoutes(fastify) {
  fastify.get('/api/browse/dirs', async (req, reply) => {
    const { dir } = req.query;
    const musicDir = process.env.MUSIC_DIR;

    let targetDir = musicDir;
    if (dir) {
      targetDir = path.resolve(musicDir, dir);
      if (!targetDir.startsWith(musicDir)) {
        return reply.status(403).send({ error: 'Access denied' });
      }
    }

    if (!fs.existsSync(targetDir)) {
      return reply.status(404).send({ error: 'Directory not found' });
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const result = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(targetDir, entry.name);
      const relativePath = path.relative(musicDir, fullPath);

      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          path: relativePath,
          type: 'dir',
        });
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const audioExts = ['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac', '.wma', '.opus'];
        const isAudio = audioExts.includes(ext);

        if (isAudio) {
          const track = await query(
            `SELECT t.id, t.title, t.duration, t.file_size, t.format, t.track_number,
                    a.name as artist, al.title as album, al.id as album_id, al.cover_path
             FROM tracks t
             LEFT JOIN artists a ON t.artist_id = a.id
             LEFT JOIN albums al ON t.album_id = al.id
             WHERE t.file_path = $1`,
            [fullPath]
          );

          result.push({
            name: entry.name,
            path: relativePath,
            type: 'file',
            meta: track.rows[0] || null,
          });
        }
      }
    }

    return result;
  });

  fastify.get('/api/browse/tree', async (req, reply) => {
    const musicDir = process.env.MUSIC_DIR;
    const { rows } = await query(
      `SELECT t.id, t.file_path, t.file_name, t.duration, t.title, t.track_number,
              a.name as artist, al.title as album, al.id as album_id
       FROM tracks t
       LEFT JOIN artists a ON t.artist_id = a.id
       LEFT JOIN albums al ON t.album_id = al.id
       ORDER BY al.title, t.disc_number, COALESCE(t.track_number, 999), t.file_name`
    );

    const albums = {};
    for (const track of rows) {
      const albumKey = track.album || 'Unknown';
      if (!albums[albumKey]) {
        albums[albumKey] = {
          title: albumKey,
          artist: track.artist,
          tracks: [],
        };
      }
      albums[albumKey].tracks.push({
        id: track.id,
        title: track.title || track.file_name,
        fileName: track.file_name,
        filePath: track.file_path,
        duration: track.duration,
        trackNumber: track.track_number,
        artist: track.artist,
      });
    }

    return Object.values(albums);
  });
}
