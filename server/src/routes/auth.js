import { query } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';

export default async function authRoutes(fastify) {
  fastify.post('/api/auth/register', async (req, reply) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return reply.status(400).send({ error: 'username and password required' });
    }
    if (password.length < 4) {
      return reply.status(400).send({ error: 'Password must be at least 4 characters' });
    }

    const existing = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: 'Username already exists' });
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );

    const token = signToken(rows[0]);
    return { token, user: { id: rows[0].id, username: rows[0].username } };
  });

  fastify.post('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return reply.status(400).send({ error: 'username and password required' });
    }

    const { rows } = await query('SELECT * FROM users WHERE username = $1', [username]);
    if (rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    const user = rows[0];
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    const token = signToken(user);
    return { token, user: { id: user.id, username: user.username } };
  });

  fastify.get('/api/auth/me', async (req, reply) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return { authenticated: false };
    }
    try {
      const { verifyToken } = await import('../auth.js');
      const payload = verifyToken(header.slice(7));
      const { rows } = await query('SELECT id, username FROM users WHERE id = $1', [payload.id]);
      if (rows.length === 0) return { authenticated: false };
      return { authenticated: true, user: rows[0] };
    } catch {
      return { authenticated: false };
    }
  });
}
