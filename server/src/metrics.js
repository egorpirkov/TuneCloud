import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const LIBRARY_REFRESH_MS = 60_000;

const metrics = {
  buildInfo: null,
  up: null,
  libraryTracks: null,
  libraryAlbums: null,
  libraryArtists: null,
  libraryUsers: null,
  libraryDuration: null,
  librarySizeBytes: null,
  lastScanTimestamp: null,
  lastScanDuration: null,
  lastScanFiles: null,
  lastScanProcessed: null,
  lastScanCovers: null,
  lastScanRemoved: null,
  lastScanMerged: null,
  lastScanArtistsMerged: null,
  streamActive: null,
  streamRequests: null,
  streamBytes: null,
};

export function setupCustomMetrics(fastify) {
  const { Gauge, Counter } = fastify.metrics.client;

  const gauge = (name, help, labelNames) => new Gauge({ name, help, ...(labelNames ? { labelNames } : {}) });

  metrics.buildInfo = gauge('tunecloud_build_info', 'TuneCloud build information', ['version']);
  metrics.buildInfo.labels(version).set(1);

  metrics.up = gauge('tunecloud_up', '1 if the API can reach the database, 0 otherwise');
  metrics.libraryTracks = gauge('tunecloud_library_tracks_total', 'Total number of tracks indexed in the library');
  metrics.libraryAlbums = gauge('tunecloud_library_albums_total', 'Total number of albums in the library');
  metrics.libraryArtists = gauge('tunecloud_library_artists_total', 'Total number of artists in the library');
  metrics.libraryUsers = gauge('tunecloud_library_users_total', 'Total number of registered users');
  metrics.libraryDuration = gauge('tunecloud_library_duration_seconds_total', 'Total duration of all indexed tracks in seconds');
  metrics.librarySizeBytes = gauge('tunecloud_library_size_bytes_total', 'Total size of all indexed track files in bytes');

  metrics.lastScanTimestamp = gauge('tunecloud_scan_last_timestamp_seconds', 'Unix timestamp of the last completed scan');
  metrics.lastScanDuration = gauge('tunecloud_scan_last_duration_seconds', 'Duration of the last scan in seconds');
  metrics.lastScanFiles = gauge('tunecloud_scan_last_files_total', 'Audio files found during the last scan');
  metrics.lastScanProcessed = gauge('tunecloud_scan_last_processed_total', 'Tracks processed during the last scan');
  metrics.lastScanCovers = gauge('tunecloud_scan_last_covers_total', 'Covers extracted during the last scan');
  metrics.lastScanRemoved = gauge('tunecloud_scan_last_removed_total', 'Stale tracks removed during the last scan');
  metrics.lastScanMerged = gauge('tunecloud_scan_last_merged_albums_total', 'Duplicate albums merged during the last scan');
  metrics.lastScanArtistsMerged = gauge('tunecloud_scan_last_merged_artists_total', 'Duplicate artists merged during the last scan');

  metrics.streamActive = gauge('tunecloud_stream_active_connections', 'Currently active streaming connections');
  metrics.streamRequests = new Counter({ name: 'tunecloud_stream_requests_total', help: 'Total number of streaming requests served' });
  metrics.streamBytes = new Counter({ name: 'tunecloud_stream_bytes_total', help: 'Total number of bytes streamed to clients' });

  refreshLibraryStats();
  const timer = setInterval(refreshLibraryStats, LIBRARY_REFRESH_MS);
  timer.unref?.();
}

export async function refreshLibraryStats() {
  if (!metrics.libraryTracks) return;
  try {
    const { rows } = await query(`SELECT
      (SELECT COUNT(*) FROM tracks) AS tracks,
      (SELECT COUNT(*) FROM albums) AS albums,
      (SELECT COUNT(*) FROM artists) AS artists,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COALESCE(SUM(duration), 0) FROM tracks) AS duration,
      (SELECT COALESCE(SUM(file_size), 0) FROM tracks) AS size_bytes`);
    const r = rows[0];
    metrics.libraryTracks.set(Number(r.tracks));
    metrics.libraryAlbums.set(Number(r.albums));
    metrics.libraryArtists.set(Number(r.artists));
    metrics.libraryUsers.set(Number(r.users));
    metrics.libraryDuration.set(Number(r.duration));
    metrics.librarySizeBytes.set(Number(r.size_bytes));
    metrics.up.set(1);
  } catch (err) {
    metrics.up.set(0);
    console.error('Failed to refresh library metrics:', err.message);
  }
}

export function recordScan(result, durationSeconds) {
  if (!metrics.lastScanTimestamp) return;
  metrics.lastScanTimestamp.set(Math.floor(Date.now() / 1000));
  metrics.lastScanDuration.set(durationSeconds || 0);
  metrics.lastScanFiles.set(result?.total || 0);
  metrics.lastScanProcessed.set(result?.processed || 0);
  metrics.lastScanCovers.set(result?.covers || 0);
  metrics.lastScanRemoved.set(result?.removed || 0);
  metrics.lastScanMerged.set(result?.merged || 0);
  metrics.lastScanArtistsMerged.set(result?.artistsMerged || 0);
  refreshLibraryStats();
}

export function streamOpened() {
  metrics.streamActive?.inc();
  metrics.streamRequests?.inc();
}

export function streamClosed(bytes) {
  metrics.streamActive?.dec();
  if (bytes > 0) metrics.streamBytes?.inc(bytes);
}
