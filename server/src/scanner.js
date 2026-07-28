import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import pkg from 'music-metadata';
const { parseFile } = pkg;
import { query } from './db.js';
import { extractCoverFromTrack, extractAllMissingCovers } from './cover.js';

const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac', '.wma', '.opus'];

function isAudioFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

async function ensureArtist(name) {
  if (!name || name.trim() === '') name = 'Unknown';
  name = name.trim();
  const { rows } = await query(
    `INSERT INTO artists (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [name]
  );
  return rows[0].id;
}

async function ensureAlbum(title, artistId, year, genre) {
  if (!title || title.trim() === '') title = 'Unknown';
  title = title.trim();
  const { rows } = await query(
    `INSERT INTO albums (title, artist_id, year, genre)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (title, artist_id) DO UPDATE SET year = COALESCE(EXCLUDED.year, albums.year), genre = COALESCE(EXCLUDED.genre, albums.genre)
     RETURNING id`,
    [title, artistId, year || null, genre || null]
  );
  return rows[0].id;
}

function toInt(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function mainArtist(name) {
  if (!name) return name;
  const m = name.match(/^(.+?)\s*(?:feat\.|ft\.|featuring|vs\.?|&|,\s)/i);
  return m ? m[1].trim() : name.trim();
}

async function upsertTrack(filePath, metadata) {
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const format = ext;

  const common = metadata.common || {};
  const formatInfo = metadata.format || {};

  const artistId = common.artist
    ? await ensureArtist(common.artist)
    : null;

  const albumArtistName = common.albumartist || mainArtist(common.artist);
  const albumArtistId = albumArtistName
    ? await ensureArtist(albumArtistName)
    : artistId;

  const albumId = common.album
    ? await ensureAlbum(common.album, albumArtistId, common.year, common.genre?.join?.(', ') || common.genre)
    : null;

  await query(
    `INSERT INTO tracks (file_path, file_name, file_size, duration, title, artist_id, album_id, track_number, disc_number, genre, year, bitrate, sample_rate, format, cover_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (file_path) DO UPDATE SET
       file_size = EXCLUDED.file_size,
       duration = EXCLUDED.duration,
       title = COALESCE(EXCLUDED.title, tracks.title),
       artist_id = COALESCE(EXCLUDED.artist_id, tracks.artist_id),
       album_id = COALESCE(EXCLUDED.album_id, tracks.album_id),
       track_number = COALESCE(EXCLUDED.track_number, tracks.track_number),
       disc_number = COALESCE(EXCLUDED.disc_number, tracks.disc_number),
       genre = COALESCE(EXCLUDED.genre, tracks.genre),
       year = COALESCE(EXCLUDED.year, tracks.year),
       bitrate = EXCLUDED.bitrate,
       sample_rate = EXCLUDED.sample_rate,
       format = EXCLUDED.format,
       updated_at = NOW()`,
    [
      filePath,
      fileName,
      stats.size,
      formatInfo.duration || 0,
      common.title || fileName.replace(/\.[^.]+$/, ''),
      artistId,
      albumId,
      toInt(common.track?.no),
      toInt(common.disk?.no) || 1,
      common.genre?.join?.(', ') || common.genre || null,
      toInt(common.year),
      toInt(formatInfo.bitrate),
      toInt(formatInfo.sampleRate),
      format,
      null,
    ]
  );

  if (albumId) {
    await extractCoverFromTrack(null, filePath, albumId);
  }
}

async function upsertTrackBasic(filePath) {
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  try {
    await query(
      `INSERT INTO tracks (file_path, file_name, file_size, duration, title, format)
       VALUES ($1,$2,$3,0,$4,$5)
       ON CONFLICT (file_path) DO UPDATE SET
         file_size = EXCLUDED.file_size,
         title = COALESCE(tracks.title, EXCLUDED.title),
         format = EXCLUDED.format`,
      [filePath, fileName, stats.size, fileName.replace(/\.[^.]+$/, ''), ext]
    );
  } catch {}
}

async function mergeDuplicateAlbums() {
  const { rows: dups } = await query(
    `SELECT title FROM albums GROUP BY title HAVING count(*) > 1`
  );
  let merged = 0;

  for (const { title } of dups) {
    const { rows: albums } = await query(
      `SELECT al.id, al.artist_id, a.name as artist_name,
              (SELECT count(*) FROM tracks t WHERE t.album_id = al.id) as track_count
       FROM albums al
       LEFT JOIN artists a ON al.artist_id = a.id
       WHERE al.title = $1
       ORDER BY track_count DESC`,
      [title]
    );
    if (albums.length <= 1) continue;

    const mainIdx = albums.findIndex((a) => !/(?:feat\.|ft\.|featuring|vs\.?|&|,\s)/i.test(a.artist_name));
    const keep = mainIdx >= 0 ? albums[mainIdx] : albums[0];

    for (const a of albums) {
      if (a.id === keep.id) continue;
      await query('UPDATE tracks SET album_id = $1 WHERE album_id = $2', [keep.id, a.id]);
      await query('DELETE FROM albums WHERE id = $1', [a.id]);
      merged++;
    }
  }

  await query(`DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM tracks WHERE artist_id IS NOT NULL) AND id NOT IN (SELECT DISTINCT artist_id FROM albums WHERE artist_id IS NOT NULL)`);
  return merged;
}

export async function scanDirectory(musicDir) {
  const pattern = path.join(musicDir, '**/*.*').replace(/\\/g, '/');
  const files = await glob(pattern, { nocase: true });

  const audioFiles = files.filter(isAudioFile);
  console.log(`Found ${audioFiles.length} audio files`);

  const scannedPaths = [];
  let processed = 0;
  for (const file of audioFiles) {
    try {
      const metadata = await parseFile(file, { skipCovers: true });
      await upsertTrack(file, metadata);
      processed++;
    } catch (err) {
      console.error(`Failed to parse metadata for ${file}: ${err.message}`);
      try {
        await upsertTrackBasic(file);
        processed++;
        console.log(`  Inserted basic entry for ${file}`);
      } catch (e2) {
        console.error(`  Could not insert basic entry: ${e2.message}`);
      }
    }
    scannedPaths.push(file);
    if (processed % 100 === 0) {
      console.log(`Processed ${processed}/${audioFiles.length}`);
    }
  }

  const deleted = await query(
    `DELETE FROM tracks WHERE file_path LIKE $1 AND file_path != ALL($2)`,
    [`${musicDir}%`, scannedPaths]
  );
  const removed = deleted.rowCount;
  if (removed > 0) console.log(`Removed ${removed} stale track(s) from DB`);

  await query(`DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL)`);
  await query(`DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM tracks WHERE artist_id IS NOT NULL) AND id NOT IN (SELECT DISTINCT artist_id FROM albums WHERE artist_id IS NOT NULL)`);

  const covers = await extractAllMissingCovers();
  console.log(`Covers extracted: ${covers.extracted}/${covers.total}`);

  const merged = await mergeDuplicateAlbums();
  console.log(`Albums merged: ${merged}`);

  console.log(`Scan complete. Processed ${processed} files.`);
  return { total: audioFiles.length, processed, covers: covers.extracted, removed, merged };
}

export async function scanSingleFile(filePath) {
  try {
    const metadata = await parseFile(filePath, { skipCovers: true });
    await upsertTrack(filePath, metadata);
    return true;
  } catch (err) {
    console.error(`Failed to process ${filePath}: ${err.message}`);
    try { await upsertTrackBasic(filePath); return true; } catch { return false; }
  }
}
