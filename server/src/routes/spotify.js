import { searchArtist } from '../spotify.js';

export default async function spotifyRoutes(fastify) {
  fastify.get('/api/spotify/artist', async (req, reply) => {
    const { name } = req.query;
    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'name required' });
    }

    const result = await searchArtist(name.trim());
    if (!result) {
      return { found: false };
    }

    return { found: true, artist: result };
  });
}
