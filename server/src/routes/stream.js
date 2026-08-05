import fs from 'fs';
import { query } from '../db.js';
import { streamOpened, streamClosed } from '../metrics.js';

const MIME_TYPES = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wma: 'audio/x-ms-wma',
  opus: 'audio/ogg',
};

function pipeWithTracking(fileStream, res) {
  streamOpened();
  let bytes = 0;
  let done = false;
  fileStream.on('data', (chunk) => {
    bytes += chunk.length;
  });
  const finish = () => {
    if (done) return;
    done = true;
    streamClosed(bytes);
  };
  res.on('finish', finish);
  res.on('close', finish);
  fileStream.on('error', () => {
    finish();
    res.end();
  });
  fileStream.pipe(res);
}

export default async function streamRoutes(fastify) {
  fastify.get('/api/stream/:id', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await query('SELECT file_path, format FROM tracks WHERE id = $1', [id]);

    if (rows.length === 0) {
      return reply.status(404).send({ error: 'Track not found' });
    }

    const filePath = rows[0].file_path;

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'File not found on disk' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const format = rows[0].format?.toLowerCase() || 'mp3';
    const contentType = MIME_TYPES[format] || 'audio/mpeg';

    reply.hijack();

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const stream = fs.createReadStream(filePath, { start, end });

      reply.raw.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      pipeWithTracking(stream, reply.raw);
      return;
    }

    reply.raw.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });

    pipeWithTracking(fs.createReadStream(filePath), reply.raw);
  });
}
