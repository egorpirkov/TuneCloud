import fs from 'fs';
import path from 'path';
import NodeID3 from 'node-id3';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

export default async function tagRoutes(fastify) {
  fastify.put('/api/tags/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const { rows } = await query('SELECT file_path FROM tracks WHERE id = $1', [id]);

    if (rows.length === 0) {
      return reply.status(404).send({ error: 'Track not found' });
    }

    const filePath = rows[0].file_path;
    const ext = path.extname(filePath).toLowerCase();

    if (ext !== '.mp3') {
      return reply.status(400).send({ error: 'ID3 tags only supported for MP3 files' });
    }

    const updates = req.body;
    const tags = {};

    if (updates.title !== undefined) tags.title = updates.title;
    if (updates.artist !== undefined) tags.artist = updates.artist;
    if (updates.album !== undefined) tags.album = updates.album;
    if (updates.trackNumber !== undefined) tags.trackNumber = updates.trackNumber;
    if (updates.genre !== undefined) tags.genre = updates.genre;
    if (updates.year !== undefined) tags.year = updates.year;

    const success = NodeID3.update(tags, filePath);
    if (!success) {
      return reply.status(500).send({ error: 'Failed to write tags' });
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

    if (ext !== '.mp3') {
      return reply.status(400).send({ error: 'ID3 tags only supported for MP3 files' });
    }

    const tags = NodeID3.read(filePath);
    return tags;
  });
}
