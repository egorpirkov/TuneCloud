import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COVERS_DIR = path.resolve(__dirname, '../../covers');

function serveCover(reply, filename) {
  const safe = path.basename(filename);
  const filepath = path.join(COVERS_DIR, safe);
  if (!fs.existsSync(filepath)) {
    reply.raw.writeHead(404, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  const ext = path.extname(safe).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  reply.hijack();
  reply.raw.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'max-age=86400' });
  fs.createReadStream(filepath).pipe(reply.raw);
}

export default async function coverRoutes(fastify) {
  fastify.get('/api/cover/album/:id', async (req, reply) => {
    const { default: db } = await import('../db.js');
    const { rows } = await db.query('SELECT cover_path FROM albums WHERE id = $1', [req.params.id]);
    if (!rows[0]?.cover_path) {
      return reply.status(404).send({ error: 'No cover' });
    }
    serveCover(reply, rows[0].cover_path);
  });

  fastify.get('/api/cover/:filename', async (req, reply) => {
    serveCover(reply, req.params.filename);
  });
}
