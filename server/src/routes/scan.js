import { scanDirectory, scanSingleFile } from '../scanner.js';
import { requireAdmin } from '../auth.js';
import fs from 'fs';
import path from 'path';

export default async function scanRoutes(fastify) {
  fastify.post('/api/scan', { preHandler: requireAdmin }, async (req, reply) => {
    const musicDir = process.env.MUSIC_DIR;

    if (!fs.existsSync(musicDir)) {
      return reply.status(400).send({ error: `Music directory not found: ${musicDir}` });
    }

    try {
      const result = await scanDirectory(musicDir);
      return { message: 'Scan completed', result };
    } catch (err) {
      req.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/api/scan/file', { preHandler: requireAdmin }, async (req, reply) => {
    const { filePath } = req.body;
    if (!filePath) {
      return reply.status(400).send({ error: 'filePath required' });
    }

    const resolvedPath = path.resolve(filePath);
    const musicDir = path.resolve(process.env.MUSIC_DIR);

    if (!resolvedPath.startsWith(musicDir)) {
      return reply.status(403).send({ error: 'File must be within music directory' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const success = await scanSingleFile(resolvedPath);
    return { success };
  });

  fastify.get('/api/scan/status', async (req, reply) => {
    const musicDir = process.env.MUSIC_DIR;

    if (!fs.existsSync(musicDir)) {
      return reply.status(400).send({ error: `Music directory not found: ${musicDir}` });
    }

    const { glob } = await import('glob');
    const audioPattern = path.join(musicDir, '**/*.{mp3,flac,ogg,wav,m4a,aac,wma,opus}').replace(/\\/g, '/');
    const files = await glob(audioPattern, { nocase: true });

    const { default: db } = await import('../db.js');
    const { rows } = await db.query('SELECT COUNT(*) as count FROM tracks');
    const indexed = parseInt(rows[0].count, 10);

    return {
      totalFiles: files.length,
      indexedTracks: indexed,
      remaining: files.length - indexed,
    };
  });
}
