import { query } from '../db.js';

export default async function trackRoutes(fastify) {
  fastify.get('/api/tracks', async (req, reply) => {
    const { limit = 50, offset = 0, sort = 'title', order = 'asc' } = req.query;

    const dir = order === 'desc' ? 'DESC' : 'ASC';
    const sortMap = {
      title: `t.title ${dir}`,
      artist: `a.name ${dir}, al.title, t.disc_number, t.track_number`,
      album: `al.title ${dir}, t.disc_number, t.track_number`,
      duration: `t.duration ${dir}`,
      created_at: `t.created_at ${dir}`,
      track_number: `t.disc_number, t.track_number ${dir}`,
    };
    const orderClause = sortMap[sort] || 't.title ASC';

    const { rows } = await query(
      `SELECT t.id, t.file_name, t.file_path, t.duration, t.title, t.track_number,
              t.disc_number, t.genre, t.year, t.bitrate, t.sample_rate, t.format, t.file_size,
              a.name as artist, al.title as album, al.id as album_id, al.cover_path
       FROM tracks t
       LEFT JOIN artists a ON t.artist_id = a.id
       LEFT JOIN albums al ON t.album_id = al.id
       ORDER BY ${orderClause}
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await query('SELECT COUNT(*) FROM tracks');
    const total = parseInt(countResult.rows[0].count, 10);

    return { tracks: rows, total };
  });

  fastify.get('/api/tracks/:id', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT t.*, a.name as artist, al.title as album
       FROM tracks t
       LEFT JOIN artists a ON t.artist_id = a.id
       LEFT JOIN albums al ON t.album_id = al.id
       WHERE t.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return reply.status(404).send({ error: 'Track not found' });
    }

    return rows[0];
  });

  fastify.get('/api/albums', async (req, reply) => {
    const { rows } = await query(
      `SELECT al.*, a.name as artist,
              (SELECT COUNT(*) FROM tracks t WHERE t.album_id = al.id) as track_count,
              (SELECT SUM(t.duration) FROM tracks t WHERE t.album_id = al.id) as duration
       FROM albums al
       LEFT JOIN artists a ON al.artist_id = a.id
       ORDER BY al.title`
    );
    return rows;
  });

  fastify.get('/api/albums/:id', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT t.*, a.name as artist, al.title as album, al.cover_path
       FROM tracks t
       LEFT JOIN artists a ON t.artist_id = a.id
       LEFT JOIN albums al ON t.album_id = al.id
       WHERE t.album_id = $1
       ORDER BY t.disc_number, t.track_number`,
      [id]
    );
    return rows;
  });

  fastify.get('/api/artists', async (req, reply) => {
    const { rows } = await query(
      `SELECT a.*,
              (SELECT COUNT(*) FROM tracks t WHERE t.artist_id = a.id) as track_count,
              (SELECT COUNT(*) FROM albums al WHERE al.artist_id = a.id) as album_count
       FROM artists a
       ORDER BY a.name`
    );
    return rows;
  });

  fastify.get('/api/search', async (req, reply) => {
    const { q, limit = 30 } = req.query;
    if (!q || q.trim() === '') return { tracks: [], albums: [], artists: [] };

    const searchTerm = `%${q.trim()}%`;

    const tracks = await query(
      `SELECT t.id, t.title, t.file_name, t.duration, t.track_number, t.format,
              a.name as artist, al.title as album, al.id as album_id
       FROM tracks t
       LEFT JOIN artists a ON t.artist_id = a.id
       LEFT JOIN albums al ON t.album_id = al.id
       WHERE t.title ILIKE $1 OR a.name ILIKE $1 OR al.title ILIKE $1
       LIMIT $2`,
      [searchTerm, limit]
    );

    const albums = await query(
      `SELECT al.*, a.name as artist
       FROM albums al
       LEFT JOIN artists a ON al.artist_id = a.id
       WHERE al.title ILIKE $1
       LIMIT $2`,
      [searchTerm, limit]
    );

    const artists = await query(
      `SELECT a.*
       FROM artists a
       WHERE a.name ILIKE $1
       LIMIT $2`,
      [searchTerm, limit]
    );

    return {
      tracks: tracks.rows,
      albums: albums.rows,
      artists: artists.rows,
    };
  });
}
