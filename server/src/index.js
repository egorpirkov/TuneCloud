import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import fs from 'fs';
import { initDb, query } from './db.js';
import { initCoversDir } from './cover.js';
import { hashPassword } from './auth.js';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.log('ADMIN_PASSWORD not set — skipping admin user creation. Register via /api/auth/register');
    return;
  }
  const { rows } = await query('SELECT id, is_admin FROM users WHERE username = $1', [username]);
  if (rows.length > 0) {
    if (!rows[0].is_admin) {
      await query('UPDATE users SET is_admin = true WHERE id = $1', [rows[0].id]);
      console.log(`Admin privileges granted to existing user "${username}"`);
    } else {
      console.log(`Admin user "${username}" already exists`);
    }
    return;
  }
  const hash = await hashPassword(password);
  await query('INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, true)', [username, hash]);
  console.log(`Admin user "${username}" created`);
}

async function main() {
  await initDb();
  await initCoversDir();
  await seedAdmin();

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    await app.register(staticFiles, {
      root: clientDist,
      prefix: '/',
      wildcard: false,
    });
  }

  const { default: browse } = await import('./routes/browse.js');
  const { default: stream } = await import('./routes/stream.js');
  const { default: tracks } = await import('./routes/tracks.js');
  const { default: scan } = await import('./routes/scan.js');
  const { default: tags } = await import('./routes/tags.js');
  const { default: cover } = await import('./routes/cover.js');
  const { default: spotify } = await import('./routes/spotify.js');
  const { default: auth } = await import('./routes/auth.js');

  browse(app);
  stream(app);
  tracks(app);
  scan(app);
  tags(app);
  cover(app);
  spotify(app);
  auth(app);

  if (fs.existsSync(clientDist)) {
    app.setNotFoundHandler(async (req, reply) => {
      if (!req.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not found' });
    });
  }

  const port = parseInt(process.env.PORT || '4000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
