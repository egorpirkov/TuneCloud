import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api.js';

function formatDuration(sec) {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const VOL_KEY = 'tunecloud-volume';

function TrackRow({ track, onPlay, isPlaying, tracks }) {
  const [hover, setHover] = useState(false);
  const canPlay = track.id != null;
  return (
    <tr className={`group transition-colors ${canPlay ? 'hover:bg-surface-700/50 cursor-pointer' : ''} ${isPlaying ? 'bg-indigo-900/20 text-indigo-300' : ''}`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onDoubleClick={() => canPlay && onPlay?.(track)}>
      <td className="px-4 py-2 text-sm w-10 text-center">
        {hover && canPlay ? (
          <button onClick={(e) => { e.stopPropagation(); onPlay?.(track); }} className="text-white hover:text-indigo-300 transition-colors">
            <svg className="w-4 h-4 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </button>
        ) : (
          <span className={`${isPlaying ? 'text-indigo-300' : 'text-surface-500'}`}>{track.track_number || ''}</span>
        )}
      </td>
      <td className="px-4 py-2 text-sm truncate max-w-xs">{track.title || track.file_name}</td>
      <td className="px-4 py-2 text-sm text-surface-400 truncate">{track.artist || '-'}</td>
      <td className="px-4 py-2 text-sm text-surface-400 truncate">{track.album || '-'}</td>
      <td className="px-4 py-2 text-sm text-surface-500 text-right">{formatDuration(track.duration)}</td>
      <td className="px-4 py-2 text-sm text-surface-500">{track.format?.toUpperCase() || ''}</td>
    </tr>
  );
}

function Player({ track, queue, queueIndex, onNext, onPrev, onClose, repeat, shuffle, onRepeat, onShuffle, volume, onVolume }) {
  const audioRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);

  useEffect(() => { document.title = track ? `${track.artist || 'Unknown'} — ${track.title || track.fileName}` : 'TuneCloud'; }, [track]);
  useEffect(() => { const el = audioRef.current; if (el) el.volume = muted ? 0 : volume; }, [volume, muted, track]);
  useEffect(() => {
    const el = audioRef.current; if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration);
    const onEnd = () => { if (repeat === 'one') { el.currentTime = 0; el.play(); return; } if (onNext) onNext(); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime); el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd); el.addEventListener('play', onPlay); el.addEventListener('pause', onPause);
    return () => { el.removeEventListener('timeupdate', onTime); el.removeEventListener('loadedmetadata', onMeta); el.removeEventListener('ended', onEnd); el.removeEventListener('play', onPlay); el.removeEventListener('pause', onPause); };
  }, [track, repeat, onNext]);

  const seek = (e) => { const rect = e.currentTarget.getBoundingClientRect(); const pct = (e.clientX - rect.left) / rect.width; if (audioRef.current) audioRef.current.currentTime = pct * duration; };
  const togglePlay = () => { if (!audioRef.current) return; if (audioRef.current.paused) audioRef.current.play(); else audioRef.current.pause(); };
  const handleVolumeSlider = (e) => { setMuted(false); onVolume(parseFloat(e.target.value)); };
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hasPrev = onPrev != null;
  const hasNext = onNext != null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-surface-900 border-t border-surface-700/80 z-50 px-4 select-none">
      <div className="max-w-6xl mx-auto flex items-center gap-4 h-20">
        <div className="flex items-center gap-3 w-64 shrink-0 min-w-0">
          <div className="w-14 h-14 rounded-lg overflow-hidden bg-surface-800 shrink-0">
            {track.cover_path ? <img src={api.coverUrl(track.cover_path)} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><svg className="w-6 h-6 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg></div>}
          </div>
          <div className="min-w-0"><p className="text-sm font-medium truncate leading-tight">{track.title || track.fileName}</p><p className="text-xs text-surface-400 truncate leading-tight">{track.artist || 'Unknown'}</p></div>
        </div>
        <div className="flex-1 max-w-xl mx-auto">
          <audio ref={audioRef} key={track.id} autoPlay className="hidden" src={api.streamUrl(track.id)} />
          <div className="flex items-center justify-center gap-2 mb-1">
            <button onClick={onShuffle} className={`p-1 rounded transition-colors ${shuffle ? 'text-indigo-400' : 'text-surface-500 hover:text-white'}`} title="Shuffle">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 17h16M4 12h16M4 7h16" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3l4 4-4 4M8 21l-4-4 4-4" /></svg>
            </button>
            <button onClick={onPrev} disabled={!hasPrev} className={`p-1 ${hasPrev ? 'text-surface-300 hover:text-white' : 'text-surface-600 cursor-default'}`} title="Previous">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button onClick={togglePlay} className="p-1 text-white hover:text-indigo-300 transition-colors">
              {playing ? <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
              : <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
            </button>
            <button onClick={onNext} disabled={!hasNext} className={`p-1 ${hasNext ? 'text-surface-300 hover:text-white' : 'text-surface-600 cursor-default'}`} title="Next">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
            <button onClick={onRepeat} className={`p-1 rounded transition-colors ${repeat !== 'none' ? 'text-indigo-400' : 'text-surface-500 hover:text-white'}`} title={`Repeat: ${repeat}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {repeat === 'one' && <span className="text-[8px] font-bold ml-0.5">1</span>}
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-surface-400">
            <span className="w-9 text-right">{formatDuration(currentTime)}</span>
            <div className="flex-1 h-1.5 bg-surface-700 rounded-full cursor-pointer group relative" onClick={seek}>
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${progressPct}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" style={{ left: `calc(${progressPct}% - 6px)` }} />
            </div>
            <span className="w-9">{formatDuration(duration)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 w-48 shrink-0 justify-end">
          <div className="flex items-center gap-2 text-surface-400">
            <button onClick={() => setMuted((m) => !m)} className="hover:text-white transition-colors" title={muted ? 'Unmute' : 'Mute'}>
              {muted || volume === 0
                ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M23 9l-6 6m0-6l6 6" /></svg>
                : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" /></svg>}
            </button>
            <input type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={handleVolumeSlider}
              className="w-20 h-1 appearance-none bg-surface-700 rounded-full cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow" />
          </div>
          <button onClick={onClose} className="text-surface-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ activeView, onViewChange, onHome }) {
  const links = [
    { id: 'browse', label: 'Browse', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    { id: 'albums', label: 'Albums', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' },
    { id: 'artists', label: 'Artists', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  ];
  return (
    <aside className="w-56 bg-surface-900 border-r border-surface-700/50 flex flex-col h-full">
      <div className="p-4 border-b border-surface-700/50">
        <button onClick={onHome} className="text-lg font-bold text-indigo-400 hover:text-indigo-300 transition-colors">TuneCloud</button>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {links.map((l) => (
          <button key={l.id} onClick={() => onViewChange(l.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeView === l.id ? 'bg-surface-700 text-white' : 'text-surface-400 hover:text-white hover:bg-surface-800'}`}>
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={l.icon} /></svg>
            {l.label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-surface-700/50">
        <button onClick={async () => {
          try { const r = await api.scan(); alert(`Scan done: ${r.result.processed} files, ${r.result.covers || 0} covers`); window.location.reload(); }
          catch (e) { alert('Scan error: ' + e.message); }
        }} className="w-full btn-ghost text-xs">Rescan Library</button>
      </div>
    </aside>
  );
}

function BrowseView({ onPlay, currentTrack }) {
  const [dirs, setDirs] = useState([]);
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); api.browse(path).then(setDirs).catch(console.error).finally(() => setLoading(false)); }, [path]);
  const parentPath = path.split('/').slice(0, -1).join('/');
  const files = dirs.filter((e) => e.type === 'file').map((e) => e.meta ? { ...e.meta, fileName: e.name } : { id: null, title: e.name, fileName: e.name });
  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-sm text-surface-400">
        <button onClick={() => setPath('')} className="hover:text-white">Music</button>
        {path.split('/').filter(Boolean).map((part, i) => (<span key={i} className="flex items-center gap-2"><span>/</span><button onClick={() => setPath(path.split('/').slice(0, i + 1).join('/'))} className="hover:text-white">{part}</button></span>))}
      </div>
      {loading && <p className="text-surface-500">Loading...</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {path && <button onClick={() => setPath(parentPath)} className="card flex flex-col items-center justify-center h-28 gap-1 hover:bg-surface-700 transition-colors">
          <svg className="w-8 h-8 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
          <span className="text-xs text-surface-400">..</span>
        </button>}
        {dirs.filter((e) => e.type === 'dir').map((d) => (
          <button key={d.path} onClick={() => setPath(d.path)} className="card flex flex-col items-center justify-center h-28 gap-1 hover:bg-surface-700 transition-colors">
            <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            <span className="text-xs text-center truncate w-full">{d.name}</span>
          </button>
        ))}
      </div>
      {files.length > 0 && <div className="mt-6">
        <h3 className="text-sm font-medium text-surface-400 mb-2">Files</h3>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-surface-500 border-b border-surface-700/50">
            <th className="px-4 py-2 text-left w-10">#</th><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Artist</th><th className="px-4 py-2 text-left">Album</th><th className="px-4 py-2 text-right">Duration</th><th className="px-4 py-2 text-left">Format</th>
          </tr></thead>
          <tbody>{files.map((t) => <TrackRow key={t.id || t.fileName} track={t} onPlay={() => onPlay(t, files)} tracks={files} isPlaying={currentTrack?.id === t.id} />)}</tbody>
        </table></div>
      </div>}
    </div>
  );
}

function AlbumDetail({ album, onPlay, currentTrack, onBack }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); api.album(album.id).then((t) => setTracks(t)).finally(() => setLoading(false)); }, [album.id]);

  const duration = tracks.reduce((s, t) => s + (t.duration || 0), 0);

  return (
    <div>
      <button onClick={onBack} className="text-sm text-surface-400 hover:text-white mb-4 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Albums
      </button>

      <div className="flex gap-6 mb-8">
        <div className="w-48 h-48 rounded-xl overflow-hidden bg-surface-800 shrink-0 shadow-lg">
          {album.cover_path ? <img src={api.coverUrl(album.cover_path)} alt={album.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><svg className="w-16 h-16 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg></div>}
        </div>
        <div className="flex flex-col justify-end">
          <p className="text-xs uppercase tracking-wider text-surface-400 mb-1">Album</p>
          <h2 className="text-3xl font-bold mb-1">{album.title}</h2>
          <p className="text-lg text-surface-300">{album.artist}</p>
          <div className="flex items-center gap-3 mt-2 text-sm text-surface-400">
            {album.year && <span>{album.year}</span>}
            {album.genre && <span>{album.genre}</span>}
            <span>{tracks.length} tracks</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>

      {loading ? <p className="text-surface-500">Loading tracks...</p>
      : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-surface-500 border-b border-surface-700/50">
          <th className="px-4 py-2 text-left w-10">#</th><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Artist</th><th className="px-4 py-2 text-left">Album</th><th className="px-4 py-2 text-right">Duration</th><th className="px-4 py-2 text-left">Format</th>
        </tr></thead>
        <tbody>{tracks.map((t) => (
          <TrackRow key={t.id} track={t} onPlay={() => onPlay(t, tracks)} tracks={tracks} isPlaying={currentTrack?.id === t.id} />
        ))}</tbody>
      </table></div>}
    </div>
  );
}

function AlbumsView({ onPlay, currentTrack, onAlbumClick }) {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); api.albums().then(setAlbums).finally(() => setLoading(false)); }, []);
  if (loading) return <p className="text-surface-500">Loading...</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {albums.map((a) => (
        <button key={a.id} onClick={() => onAlbumClick(a)} className="card w-full text-left hover:bg-surface-700 transition-colors group">
          <div className="aspect-square rounded-lg mb-3 overflow-hidden bg-surface-700">
            {a.cover_path ? <img src={api.coverUrl(a.cover_path)} alt={a.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
            : <div className="w-full h-full flex items-center justify-center"><svg className="w-12 h-12 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg></div>}
          </div>
          <h3 className="text-sm font-medium truncate">{a.title}</h3>
          <p className="text-xs text-surface-400 truncate">{a.artist}</p>
          <p className="text-xs text-surface-500 mt-1">{a.track_count} tracks · {formatDuration(a.duration)}</p>
        </button>
      ))}
    </div>
  );
}

function ArtistsView({ onPlay, currentTrack }) {
  const [artists, setArtists] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [artistImages, setArtistImages] = useState({});
  const [loadingImg, setLoadingImg] = useState({});
  useEffect(() => { api.artists().then(setArtists).catch(console.error); }, []);
  const loadArtistImage = useCallback(async (artist) => {
    if (artistImages[artist.id] || loadingImg[artist.id]) return;
    setLoadingImg((p) => ({ ...p, [artist.id]: true }));
    try { const data = await api.spotifyArtist(artist.name); if (data?.found && data.artist?.image) setArtistImages((p) => ({ ...p, [artist.id]: data.artist.image })); } catch {}
    setLoadingImg((p) => ({ ...p, [artist.id]: false }));
  }, [artistImages, loadingImg]);
  const handleSelect = async (artist) => {
    if (selected?.id === artist.id) { setSelected(null); setTracks([]); return; }
    setSelected(artist); loadArtistImage(artist);
    const all = await api.tracks({ limit: 500, sort: 'album', order: 'asc' });
    const filtered = all.tracks.filter((t) => t.artist === artist.name);
    filtered.sort((a, b) => { const aa = a.album || '', bb = b.album || ''; if (aa !== bb) return aa.localeCompare(bb); return (a.track_number || 999) - (b.track_number || 999); });
    setTracks(filtered);
  };
  return (
    <div className="flex gap-6">
      <div className="w-72 space-y-1 shrink-0">
        {artists.map((a) => (
          <button key={a.id} onMouseEnter={() => loadArtistImage(a)} onClick={() => handleSelect(a)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${selected?.id === a.id ? 'bg-surface-700 text-white' : 'text-surface-300 hover:bg-surface-800'}`}>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-700 shrink-0">
              {artistImages[a.id] ? <img src={artistImages[a.id]} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><svg className="w-5 h-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>}
            </div>
            <div className="min-w-0 text-left"><span className="font-medium block truncate">{a.name}</span><span className="text-surface-500 text-xs">{a.album_count} albums, {a.track_count} tracks</span></div>
          </button>
        ))}
      </div>
      {selected && (
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-4">
            {artistImages[selected.id] && <img src={artistImages[selected.id]} alt={selected.name} className="w-20 h-20 rounded-full object-cover" />}
            <div><h2 className="text-xl font-bold">{selected.name}</h2><p className="text-sm text-surface-400">{tracks.length} tracks</p></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-surface-500 border-b border-surface-700/50"><th className="px-4 py-2 text-left w-10">#</th><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Album</th><th className="px-4 py-2 text-right">Duration</th><th className="px-4 py-2 text-left">Format</th></tr></thead>
            <tbody>{tracks.map((t) => <TrackRow key={t.id} track={t} onPlay={() => onPlay(t, tracks)} tracks={tracks} isPlaying={currentTrack?.id === t.id} />)}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

function SearchView({ onPlay, currentTrack }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    const timer = setTimeout(async () => { try { setResults(await api.search(query)); } catch (e) { console.error(e); } }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  return (
    <div>
      <div className="relative mb-6">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input className="input w-full pl-10" placeholder="Search tracks, albums, artists..." value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </div>
      {results && <div className="space-y-6">
        {results.artists.length > 0 && <div><h3 className="text-sm font-medium text-surface-400 mb-2">Artists ({results.artists.length})</h3><div className="flex flex-wrap gap-2">{results.artists.map((a) => <span key={a.id} className="px-3 py-1 bg-surface-800 rounded-full text-sm">{a.name}</span>)}</div></div>}
        {results.albums.length > 0 && <div><h3 className="text-sm font-medium text-surface-400 mb-2">Albums ({results.albums.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">{results.albums.map((a) => (
            <div key={a.id} className="card">
              {a.cover_path ? <div className="aspect-square rounded-lg overflow-hidden mb-2 bg-surface-700"><img src={api.coverUrl(a.cover_path)} alt="" className="w-full h-full object-cover" /></div> : null}
              <h4 className="text-sm font-medium truncate">{a.title}</h4><p className="text-xs text-surface-400 truncate">{a.artist}</p>
            </div>
          ))}</div></div>}
        {results.tracks.length > 0 && <div><h3 className="text-sm font-medium text-surface-400 mb-2">Tracks ({results.tracks.length})</h3>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-surface-500 border-b border-surface-700/50"><th className="px-4 py-2 text-left w-10">#</th><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Artist</th><th className="px-4 py-2 text-left">Album</th><th className="px-4 py-2 text-right">Duration</th></tr></thead>
            <tbody>{results.tracks.map((t) => <TrackRow key={t.id} track={t} onPlay={() => onPlay(t, results.tracks)} tracks={results.tracks} isPlaying={currentTrack?.id === t.id} />)}</tbody>
          </table></div></div>}
        {results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0 && <p className="text-surface-500">No results found for "{query}"</p>}
      </div>}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('browse');
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [repeat, setRepeat] = useState('none');
  const [shuffle, setShuffle] = useState(false);
  const [volume, setVolume] = useState(() => { try { return parseFloat(localStorage.getItem(VOL_KEY)) || 0.7; } catch { return 0.7; } });

  const currentTrack = queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;

  const handlePlay = (track, trackList) => {
    const list = trackList || queue;
    const idx = list.findIndex((t) => t.id === track.id);
    setQueue(list);
    setQueueIndex(idx >= 0 ? idx : 0);
  };

  const pickNext = () => {
    if (queue.length === 0) return -1;
    if (shuffle) { let i; do { i = Math.floor(Math.random() * queue.length); } while (i === queueIndex && queue.length > 1); return i; }
    const next = queueIndex + 1;
    if (next >= queue.length) return repeat === 'all' ? 0 : -1;
    return next;
  };

  const pickPrev = () => {
    if (queue.length === 0) return -1;
    if (shuffle) { let i; do { i = Math.floor(Math.random() * queue.length); } while (i === queueIndex && queue.length > 1); return i; }
    const prev = queueIndex - 1;
    if (prev < 0) return repeat === 'all' ? queue.length - 1 : -1;
    return prev;
  };

  const handleNext = () => { const i = pickNext(); if (i >= 0) setQueueIndex(i); };
  const handlePrev = () => { const i = pickPrev(); if (i >= 0) setQueueIndex(i); };
  const toggleRepeat = () => setRepeat((r) => r === 'none' ? 'all' : r === 'all' ? 'one' : 'none');
  const toggleShuffle = () => setShuffle((s) => !s);
  const handleVolume = (v) => { setVolume(v); localStorage.setItem(VOL_KEY, v); };
  const closePlayer = () => { setQueue([]); setQueueIndex(-1); document.title = 'TuneCloud'; };

  const handleAlbumClick = (album) => { setSelectedAlbum(album); setView('album'); };
  const handleBackToAlbums = () => { setSelectedAlbum(null); setView('albums'); };
  const handleViewChange = (v) => { setSelectedAlbum(null); setView(v); };
  const handleHome = () => { setSelectedAlbum(null); setView('browse'); };

  const hasPrev = pickPrev() >= 0;
  const hasNext = pickNext() >= 0;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={view} onViewChange={handleViewChange} onHome={handleHome} />
        <main className="flex-1 overflow-y-auto p-6 pb-28">
          {view === 'browse' && <BrowseView onPlay={handlePlay} currentTrack={currentTrack} />}
          {view === 'albums' && <AlbumsView onPlay={handlePlay} currentTrack={currentTrack} onAlbumClick={handleAlbumClick} />}
          {view === 'album' && selectedAlbum && <AlbumDetail album={selectedAlbum} onPlay={handlePlay} currentTrack={currentTrack} onBack={handleBackToAlbums} />}
          {view === 'artists' && <ArtistsView onPlay={handlePlay} currentTrack={currentTrack} />}
          {view === 'search' && <SearchView onPlay={handlePlay} currentTrack={currentTrack} />}
        </main>
      </div>
      {currentTrack && (
        <Player track={currentTrack} queue={queue} queueIndex={queueIndex}
          onNext={hasNext ? handleNext : null} onPrev={hasPrev ? handlePrev : null}
          onClose={closePlayer} repeat={repeat} shuffle={shuffle}
          onRepeat={toggleRepeat} onShuffle={toggleShuffle}
          volume={volume} onVolume={handleVolume} />
      )}
    </div>
  );
}
