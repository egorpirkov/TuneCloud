CREATE TABLE IF NOT EXISTS artists (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS albums (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
  year INTEGER,
  genre TEXT,
  cover_path TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(title, artist_id)
);

CREATE TABLE IF NOT EXISTS tracks (
  id SERIAL PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  duration REAL DEFAULT 0,
  title TEXT,
  artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  track_number INTEGER,
  disc_number INTEGER DEFAULT 1,
  genre TEXT,
  year INTEGER,
  bitrate INTEGER,
  sample_rate INTEGER,
  format TEXT,
  cover_path TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON tracks(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_tracks_file_path ON tracks(file_path);
CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
