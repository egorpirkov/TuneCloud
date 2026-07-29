import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api, setAuthToken, getAuthToken } from './api.js';

function formatDuration(sec) {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const VOL_KEY = 'tunecloud-volume';

let toastId = 0;
const toastListeners = new Set();

export function toast(msg, type = 'info') {
  const id = ++toastId;
  toastListeners.forEach(fn => fn({ id, msg, type }));
  setTimeout(() => toastListeners.forEach(fn => fn({ id, type: 'remove' })), 3500);
}

function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const listener = (t) => {
      if (t.type === 'remove') {
        setToasts(prev => prev.filter(x => x.id !== t.id));
      } else {
        setToasts(prev => [...prev, t]);
      }
    };
    toastListeners.add(listener);
    return () => toastListeners.delete(listener);
  }, []);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`pointer-events-auto glass-strong px-4 py-3 rounded-xl shadow-glow-md animate-slide-in text-sm flex items-center gap-2 ${t.type === 'error' ? 'border-red-400/30' : 'border-indigo-400/20'}`}>
          {t.type === 'error'
            ? <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            : <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          <span className="text-surface-200">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function EditTrackModal({ track, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: track.title || '',
    artist: track.artist || '',
    album: track.album || '',
    trackNumber: track.track_number || '',
    genre: track.genre || '',
    year: track.year || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const payload = {};
      if (form.title !== (track.title || '')) payload.title = form.title;
      if (form.artist !== (track.artist || '')) payload.artist = form.artist;
      if (form.album !== (track.album || '')) payload.album = form.album;
      if (String(form.trackNumber) !== String(track.track_number || '')) payload.trackNumber = form.trackNumber ? parseInt(form.trackNumber, 10) : null;
      if (form.genre !== (track.genre || '')) payload.genre = form.genre;
      if (String(form.year) !== String(track.year || '')) payload.year = form.year ? parseInt(form.year, 10) : null;
      await api.updateTags(track.id, payload);
      toast('Tags updated');
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong rounded-2xl p-6 w-full max-w-md mx-4 shadow-glow-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Edit Tags</h3>
          <button onClick={onClose} className="text-surface-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="text-xs text-surface-500 mb-4 truncate">{track.file_name}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-surface-400 mb-1">Title</label>
            <input className="input w-full" value={form.title} onChange={set('title')} />
          </div>
          <div>
            <label className="block text-xs text-surface-400 mb-1">Artist</label>
            <input className="input w-full" value={form.artist} onChange={set('artist')} />
          </div>
          <div>
            <label className="block text-xs text-surface-400 mb-1">Album</label>
            <input className="input w-full" value={form.album} onChange={set('album')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-surface-400 mb-1">Track #</label>
              <input className="input w-full" type="number" min="0" value={form.trackNumber} onChange={set('trackNumber')} />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Year</label>
              <input className="input w-full" type="number" min="0" value={form.year} onChange={set('year')} />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Genre</label>
              <input className="input w-full" value={form.genre} onChange={set('genre')} />
            </div>
          </div>
        </div>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TrackRow({ track, onPlay, isPlaying, tracks, user, onTagSaved }) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const menuRef = useRef(null);
  const canPlay = track.id != null;
  const isAdmin = user?.is_admin;
  const canEditTags = track.format?.toLowerCase() === 'mp3';

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <tr className={`group transition-colors ${canPlay ? 'hover:bg-white/5 cursor-pointer' : ''} ${isPlaying ? 'bg-indigo-500/10 text-indigo-300 shadow-[inset_0_0_20px_rgba(99,102,241,0.05)]' : ''}`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onDoubleClick={() => canPlay && onPlay?.(track)}>
      <td className="px-4 py-2 text-sm w-10 text-center relative">
        <span className={`inline-flex items-center justify-center w-4 h-4 ${isPlaying ? 'text-indigo-300' : 'text-surface-500'} ${hover && canPlay ? 'invisible' : ''}`}>{track.track_number || ''}</span>
        {canPlay && (
          <button onClick={(e) => { e.stopPropagation(); onPlay?.(track); }}
            className={`absolute inset-0 flex items-center justify-center text-white hover:text-indigo-300 transition-colors ${hover ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </button>
        )}
      </td>
      <td className="px-4 py-2 text-sm truncate max-w-xs">{track.title || track.file_name}</td>
      <td className="px-4 py-2 text-sm text-surface-400 truncate">{track.artist || '-'}</td>
      <td className="px-4 py-2 text-sm text-surface-400 truncate">{track.album || '-'}</td>
      <td className="px-4 py-2 text-sm text-surface-500 text-right">{formatDuration(track.duration)}</td>
      <td className="px-4 py-2 text-sm text-surface-500">{track.format?.toUpperCase() || ''}</td>
      {isAdmin && (
        <td className="px-2 py-2 text-sm w-8">
          <div ref={menuRef} className="relative">
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className={`p-1 rounded transition-colors text-surface-500 hover:text-white ${menuOpen ? 'text-white' : ''}`}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 glass-strong rounded-lg py-1 min-w-[120px] z-50 shadow-glass">
                {canEditTags ? (
                  <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setEditing(true); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-surface-300 hover:bg-white/10 hover:text-white transition-colors">
                    Edit Tags
                  </button>
                ) : (
                  <span className="block px-3 py-1.5 text-sm text-surface-600 cursor-default">
                    Read-only ({track.format?.toUpperCase()})
                  </span>
                )}
              </div>
            )}
          </div>
        </td>
      )}
      {editing && <EditTrackModal track={track} onClose={() => setEditing(false)} onSaved={onTagSaved} />}
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
  useEffect(() => {
    if (!track || !('mediaSession' in navigator)) return;
    const artwork = track.cover_path ? [{ src: api.coverUrl(track.cover_path), sizes: '512x512', type: 'image/jpeg' }] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || track.file_name || track.fileName || 'Unknown',
      artist: track.artist || 'Unknown',
      album: track.album || '',
      artwork,
    });
  }, [track]);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => { if (audioRef.current) audioRef.current.play(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (audioRef.current) audioRef.current.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { if (onPrev) onPrev(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => { if (onNext) onNext(); });
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [onNext, onPrev]);
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
    <div className="fixed bottom-0 left-0 right-0 bg-black/60 backdrop-blur-2xl border-t border-white/10 z-50 px-4 select-none shadow-glass">
      <div className="max-w-6xl mx-auto flex items-center gap-4 h-20">
        <div className="flex items-center gap-3 w-64 shrink-0 min-w-0">
          <div className="w-14 h-14 overflow-hidden bg-black/40 shrink-0">
            {track.cover_path ? <img src={api.coverUrl(track.cover_path)} alt="" className="w-full h-full object-cover" draggable="false" />
            : <div className="w-full h-full flex items-center justify-center"><svg className="w-6 h-6 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg></div>}
          </div>
          <div className="min-w-0"><p className="text-sm font-medium truncate leading-tight">{track.title || track.fileName}</p><p className="text-xs text-surface-400 truncate leading-tight">{track.artist || 'Unknown'}</p></div>
        </div>
        <div className="flex-1 max-w-xl mx-auto">
          <audio ref={audioRef} key={track.id} autoPlay className="hidden" src={api.streamUrl(track.id)} />
          <div className="flex items-center justify-center gap-2 mb-1">
            <button onClick={onShuffle} className={`p-1 rounded transition-all duration-200 ${shuffle ? 'text-indigo-400 bg-indigo-500/10 shadow-[0_0_12px_rgba(99,102,241,0.2)]' : 'text-surface-500 hover:text-white'}`} title="Shuffle">
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
            <button onClick={onRepeat} className={`p-1 rounded transition-all duration-200 ${repeat !== 'none' ? 'text-indigo-400 bg-indigo-500/10 shadow-[0_0_12px_rgba(99,102,241,0.2)]' : 'text-surface-500 hover:text-white'}`} title={`Repeat: ${repeat}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {repeat === 'one' && <span className="text-[8px] font-bold ml-0.5">1</span>}
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-surface-400">
            <span className="w-9 text-right">{formatDuration(currentTime)}</span>
            <div className="flex-1 h-1.5 bg-white/10 rounded-full cursor-pointer group relative overflow-hidden" onClick={seek}>
              <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.4)]" style={{ width: `${progressPct}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-indigo-500/30" style={{ left: `calc(${progressPct}% - 6px)` }} />
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
              onWheel={(e) => { e.preventDefault(); const delta = e.deltaY > 0 ? -0.05 : 0.05; onVolume(Math.max(0, Math.min(1, volume + delta))); }}
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

function Sidebar({ activeView, onViewChange, onHome, user, onLogout, isAdmin, onScanComplete }) {
  const [scanning, setScanning] = useState(false);
  const links = [
    { id: 'browse', label: 'Browse', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    { id: 'albums', label: 'Albums', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' },
    { id: 'artists', label: 'Artists', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  ];
  return (
    <aside className="w-56 bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col h-full shadow-glass">
      <div className="p-4 border-b border-white/10">
        <button onClick={onHome} className="text-lg font-bold text-indigo-400 hover:text-indigo-300 transition-colors drop-shadow-[0_0_10px_rgba(99,102,241,0.3)]">TuneCloud</button>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {links.map((l) => (
          <button key={l.id} onClick={() => onViewChange(l.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeView === l.id ? 'bg-white/10 text-white backdrop-blur-sm border border-white/10 shadow-glow' : 'text-surface-400 hover:text-white hover:bg-white/5'}`}>
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={l.icon} /></svg>
            {l.label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10 space-y-2">
        <button disabled={scanning} onClick={async () => {
          setScanning(true);
          try { const r = await api.scan(); toast(`Scan done: ${r.result.processed} files, ${r.result.covers || 0} covers`); onScanComplete?.(); }
          catch (e) { toast('Scan error: ' + e.message, 'error'); }
          finally { setScanning(false); }
        }} className={`w-full btn-ghost text-xs ${scanning ? 'opacity-50 cursor-not-allowed' : ''}`}>{scanning ? 'Scanning...' : 'Rescan Library'}</button>
        <div className="h-px bg-white/5"></div>
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-surface-500 truncate">{user?.username}</span>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button onClick={() => onViewChange('admin')} className={`p-1 rounded transition-all duration-200 ${activeView === 'admin' ? 'text-indigo-400 bg-indigo-500/10' : 'text-surface-500 hover:text-white'}`} title="Admin">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
            )}
            <button onClick={onLogout} className="text-xs text-surface-500 hover:text-red-400 transition-colors">Logout</button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function BrowseView({ onPlay, currentTrack, user }) {
  const [dirs, setDirs] = useState([]);
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = () => api.browse(path).then(setDirs).catch(console.error).finally(() => setLoading(false));
  useEffect(() => { setLoading(true); reload(); }, [path]);
  const parentPath = path.split('/').slice(0, -1).join('/');
  const files = dirs.filter((e) => e.type === 'file').map((e) => e.meta ? { ...e.meta, fileName: e.name } : { id: null, title: e.name, fileName: e.name });
  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-sm text-surface-400 bg-black/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5 w-fit">
        <button onClick={() => setPath('')} className="hover:text-white transition-colors">Music</button>
        {path.split('/').filter(Boolean).map((part, i) => (<span key={i} className="flex items-center gap-2"><span className="text-white/20">/</span><button onClick={() => setPath(path.split('/').slice(0, i + 1).join('/'))} className="hover:text-white transition-colors">{part}</button></span>))}
      </div>
      {loading && <p className="text-surface-500">Loading...</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {path && <button onClick={() => setPath(parentPath)} className="card-hover flex flex-col items-center justify-center h-28 gap-1">
          <svg className="w-8 h-8 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
          <span className="text-xs text-surface-400">..</span>
        </button>}
        {dirs.filter((e) => e.type === 'dir').map((d) => (
          <button key={d.path} onClick={() => setPath(d.path)} className="card-hover flex flex-col items-center justify-center h-28 gap-1">
            <svg className="w-10 h-10 text-amber-400/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            <span className="text-xs text-center truncate w-full">{d.name}</span>
          </button>
        ))}
      </div>
      {files.length > 0 && <div className="mt-6">
        <h3 className="text-sm font-medium text-surface-400 mb-2">Files</h3>
        <div className="overflow-x-auto rounded-xl glass"><table className="w-full text-sm">
          <thead><tr className="text-surface-500 border-b border-white/10">
            <th className="px-4 py-2 text-left w-10">#</th><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Artist</th><th className="px-4 py-2 text-left">Album</th><th className="px-4 py-2 text-right">Duration</th><th className="px-4 py-2 text-left">Format</th>{user?.is_admin && <th className="w-8"></th>}
          </tr></thead>
          <tbody>{files.map((t) => <TrackRow key={t.id || t.fileName} track={t} onPlay={() => onPlay(t, files)} tracks={files} isPlaying={currentTrack?.id === t.id} user={user} onTagSaved={reload} />)}</tbody>
        </table></div>
      </div>}
    </div>
  );
}

function AlbumDetail({ album, onPlay, currentTrack, onBack, user }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = () => { setLoading(true); api.album(album.id).then((t) => setTracks(t)).finally(() => setLoading(false)); };
  useEffect(() => { reload(); }, [album.id]);

  const duration = tracks.reduce((s, t) => s + (t.duration || 0), 0);

  return (
    <div>
      <button onClick={onBack} className="text-sm text-surface-400 hover:text-white mb-4 flex items-center gap-1 glass w-fit px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-white/10">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Albums
      </button>

      <div className="flex gap-6 mb-8 glass p-6 rounded-2xl">
        <div className="w-48 h-48 rounded-xl overflow-hidden bg-black/40 shrink-0 shadow-lg shadow-indigo-500/10 ring-1 ring-white/10">
          {album.cover_path ? <img src={api.coverUrl(album.cover_path)} alt={album.title} className="w-full h-full object-cover" draggable="false" />
          : <div className="w-full h-full flex items-center justify-center"><svg className="w-16 h-16 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg></div>}
        </div>
        <div className="flex flex-col justify-end">
          <p className="text-xs uppercase tracking-wider text-surface-400 mb-1">Album</p>
          <h2 className="text-3xl font-bold mb-1 text-white drop-shadow-[0_0_20px_rgba(99,102,241,0.15)]">{album.title}</h2>
          <p className="text-lg text-surface-300">{album.artist}</p>
          <div className="flex items-center gap-3 mt-2 text-sm text-surface-400">
            {album.year && <span className="bg-white/5 px-2 py-0.5 rounded-md">{album.year}</span>}
            {album.genre && <span className="bg-white/5 px-2 py-0.5 rounded-md">{album.genre}</span>}
            <span>{tracks.length} tracks</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>

      {loading ? <p className="text-surface-500">Loading tracks...</p>
      : <div className="overflow-x-auto rounded-xl glass"><table className="w-full text-sm">
        <thead><tr className="text-surface-500 border-b border-white/10">
          <th className="px-4 py-2 text-left w-10">#</th><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Artist</th><th className="px-4 py-2 text-left">Album</th><th className="px-4 py-2 text-right">Duration</th><th className="px-4 py-2 text-left">Format</th>{user?.is_admin && <th className="w-8"></th>}
        </tr></thead>
        <tbody>{tracks.map((t) => (
          <TrackRow key={t.id} track={t} onPlay={() => onPlay(t, tracks)} tracks={tracks} isPlaying={currentTrack?.id === t.id} user={user} onTagSaved={reload} />
        ))}</tbody>
      </table></div>}
    </div>
  );
}

function AlbumsView({ onPlay, currentTrack, onAlbumClick }) {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  useEffect(() => { setLoading(true); api.albums().then(setAlbums).finally(() => setLoading(false)); }, []);
  const filtered = filter.trim()
    ? albums.filter((a) => {
        const q = filter.toLowerCase();
        return (a.title || '').toLowerCase().includes(q) || (a.artist || '').toLowerCase().includes(q);
      })
    : albums;
  if (loading) return <p className="text-surface-500">Loading...</p>;
  return (
    <div>
      <div className="relative mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input className="input w-full pl-10" placeholder="Filter albums..." value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filtered.map((a) => (
        <button key={a.id} onClick={() => onAlbumClick(a)} className="card-hover w-full text-left group">
          <div className="aspect-square rounded-xl mb-3 overflow-hidden bg-black/40 ring-1 ring-white/10 shadow-lg shadow-black/20">
            {a.cover_path ? <img src={api.coverUrl(a.cover_path)} alt={a.title} className="w-full h-full object-cover transition-all duration-300 group-hover:brightness-110" draggable="false" />
            : <div className="w-full h-full flex items-center justify-center"><svg className="w-12 h-12 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg></div>}
          </div>
          <div className="px-1 pb-2">
            <h3 className="text-sm font-medium truncate">{a.title}</h3>
            <p className="text-xs text-surface-400 truncate mt-0.5">{a.artist}</p>
            <p className="text-xs text-surface-500 mt-1.5 text-right pr-1 leading-relaxed">{a.track_count} tracks · {formatDuration(a.duration)}</p>
          </div>
        </button>
      ))}
      </div>
    </div>
  );
}

const ARTIST_IMG_CACHE_KEY = 'tunecloud-artist-images';

function loadArtistImageCache() {
  try { return JSON.parse(localStorage.getItem(ARTIST_IMG_CACHE_KEY)) || {}; } catch { return {}; }
}

function saveArtistImageCache(cache) {
  try { localStorage.setItem(ARTIST_IMG_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

function ArtistsView({ onPlay, currentTrack, user, onArtistClick }) {
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [artistImages, setArtistImages] = useState(() => loadArtistImageCache());

  useEffect(() => {
    setLoading(true);
    api.artists().then((list) => {
      setArtists(list);
      const cache = loadArtistImageCache();
      const missing = list.filter((a) => !cache[a.name]);
      if (missing.length > 0) {
        let changed = false;
        Promise.allSettled(missing.map(async (a) => {
          try {
            const data = await api.spotifyArtist(a.name);
            if (data?.found && data.artist?.image) {
              cache[a.name] = data.artist.image;
              changed = true;
            }
          } catch {}
        })).then(() => {
          if (changed) {
            saveArtistImageCache(cache);
            setArtistImages({ ...cache });
          }
        });
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-surface-500">Loading...</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {artists.map((a) => (
        <button key={a.id} onClick={() => onArtistClick(a)} className="card-hover w-full text-left group">
          <div className="aspect-square rounded-xl mb-3 overflow-hidden bg-black/40 ring-1 ring-white/10 shadow-lg shadow-black/20">
            {artistImages[a.name]
              ? <img src={artistImages[a.name]} alt={a.name} className="w-full h-full object-cover transition-all duration-300 group-hover:brightness-110" draggable="false" />
              : <div className="w-full h-full flex items-center justify-center"><svg className="w-12 h-12 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>}
          </div>
          <div className="px-1 pb-2">
            <h3 className="text-sm font-medium truncate">{a.name}</h3>
            <p className="text-xs text-surface-500 mt-1 text-right pr-1 leading-relaxed">{a.album_count} albums · {a.track_count} tracks</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function ArtistDetail({ artist, onPlay, currentTrack, onBack, user }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [artistImage, setArtistImage] = useState(() => loadArtistImageCache()[artist.name] || null);

  const reload = async () => {
    setLoading(true);
    const all = await api.tracks({ limit: 10000, sort: 'album', order: 'asc' });
    const filtered = all.tracks.filter((t) => t.artist === artist.name);
    filtered.sort((a, b) => { const aa = a.album || '', bb = b.album || ''; if (aa !== bb) return aa.localeCompare(bb); return (a.track_number || 999) - (b.track_number || 999) || (a.file_name || '').localeCompare(b.file_name || ''); });
    setTracks(filtered);
    setLoading(false);
  };
  useEffect(() => { reload(); }, [artist.name]);

  useEffect(() => {
    if (artistImage) return;
    const cache = loadArtistImageCache();
    if (cache[artist.name]) { setArtistImage(cache[artist.name]); return; }
    api.spotifyArtist(artist.name).then((data) => {
      if (data?.found && data.artist?.image) {
        setArtistImage(data.artist.image);
        cache[artist.name] = data.artist.image;
        saveArtistImageCache(cache);
      }
    }).catch(() => {});
  }, [artist.name]);

  const duration = tracks.reduce((s, t) => s + (t.duration || 0), 0);

  const albums = [];
  const albumMap = {};
  for (const t of tracks) {
    const key = t.album || 'Unknown Album';
    if (!albumMap[key]) { albumMap[key] = { title: key, tracks: [] }; albums.push(albumMap[key]); }
    albumMap[key].tracks.push(t);
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-surface-400 hover:text-white mb-4 flex items-center gap-1 glass w-fit px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-white/10">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Artists
      </button>

      <div className="flex gap-6 mb-8 glass p-6 rounded-2xl">
        <div className="w-48 h-48 rounded-xl overflow-hidden bg-black/40 shrink-0 shadow-lg shadow-indigo-500/10 ring-1 ring-white/10">
          {artistImage
            ? <img src={artistImage} alt={artist.name} className="w-full h-full object-cover" draggable="false" />
            : <div className="w-full h-full flex items-center justify-center"><svg className="w-16 h-16 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>}
        </div>
        <div className="flex flex-col justify-end">
          <p className="text-xs uppercase tracking-wider text-surface-400 mb-1">Artist</p>
          <h2 className="text-3xl font-bold mb-1 text-white drop-shadow-[0_0_20px_rgba(99,102,241,0.15)]">{artist.name}</h2>
          <div className="flex items-center gap-3 mt-2 text-sm text-surface-400">
            <span>{artist.album_count} albums</span>
            <span>{tracks.length} tracks</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>

      {loading ? <p className="text-surface-500">Loading tracks...</p>
      : albums.map((al) => (
        <div key={al.title} className="mb-6">
          <h3 className="text-sm font-medium text-surface-400 mb-2">{al.title}</h3>
          <div className="overflow-x-auto rounded-xl glass"><table className="w-full text-sm">
            <thead><tr className="text-surface-500 border-b border-white/10">
              <th className="px-4 py-2 text-left w-10">#</th><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Artist</th><th className="px-4 py-2 text-left">Album</th><th className="px-4 py-2 text-right">Duration</th><th className="px-4 py-2 text-left">Format</th>{user?.is_admin && <th className="w-8"></th>}
            </tr></thead>
            <tbody>{al.tracks.map((t) => (
              <TrackRow key={t.id} track={t} onPlay={() => onPlay(t, tracks)} tracks={tracks} isPlaying={currentTrack?.id === t.id} user={user} onTagSaved={reload} />
            ))}</tbody>
          </table></div>
        </div>
      ))
      }
    </div>
  );
}

function SearchView({ onPlay, currentTrack, user, onAlbumClick, onArtistClick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const doSearch = (q) => { if (!q.trim()) { setResults(null); return; } api.search(q).then(setResults).catch(console.error); };
  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  return (
    <div>
      <div className="relative mb-6">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input className="input w-full pl-10" placeholder="Search tracks, albums, artists..." value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </div>
      {results && <div className="space-y-6">
        {results.artists.length > 0 && <div><h3 className="text-sm font-medium text-surface-400 mb-2">Artists ({results.artists.length})</h3><div className="flex flex-wrap gap-2">{results.artists.map((a) => <button key={a.id} onClick={() => onArtistClick?.(a)} className="px-3 py-1 bg-white/5 backdrop-blur-sm rounded-full text-sm border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-200">{a.name}</button>)}</div></div>}
        {results.albums.length > 0 && <div><h3 className="text-sm font-medium text-surface-400 mb-2">Albums ({results.albums.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">{results.albums.map((a) => (
            <button key={a.id} onClick={() => onAlbumClick?.(a)} className="card-hover text-left">
              {a.cover_path ? <div className="aspect-square rounded-lg overflow-hidden mb-2 bg-black/40 ring-1 ring-white/10"><img src={api.coverUrl(a.cover_path)} alt="" className="w-full h-full object-cover" draggable="false" /></div> : null}
              <h4 className="text-sm font-medium truncate">{a.title}</h4><p className="text-xs text-surface-400 truncate">{a.artist}</p>
            </button>
          ))}</div></div>}
        {results.tracks.length > 0 && <div><h3 className="text-sm font-medium text-surface-400 mb-2">Tracks ({results.tracks.length})</h3>
            <div className="overflow-x-auto rounded-xl glass"><table className="w-full text-sm">
              <thead><tr className="text-surface-500 border-b border-white/10"><th className="px-4 py-2 text-left w-10">#</th><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Artist</th><th className="px-4 py-2 text-left">Album</th><th className="px-4 py-2 text-right">Duration</th><th className="px-4 py-2 text-left">Format</th>{user?.is_admin && <th className="w-8"></th>}</tr></thead>
            <tbody>{results.tracks.map((t) => <TrackRow key={t.id} track={t} onPlay={() => onPlay(t, results.tracks)} tracks={results.tracks} isPlaying={currentTrack?.id === t.id} user={user} onTagSaved={() => doSearch(query)} />)}</tbody>
          </table></div></div>}
        {results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0 && <p className="text-surface-500">No results found for "{query}"</p>}
      </div>}
    </div>
  );
}

function LoginView({ onLogin }) {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const fn = tab === 'login' ? api.login : api.register;
      const data = await fn(username, password);
      setAuthToken(data.token);
      onLogin(data.user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center" style={{background: 'linear-gradient(135deg, #0a0a0f 0%, #14141f 30%, #1a1a2e 60%, #0f0f1a 100%)'}}>
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-400 drop-shadow-[0_0_20px_rgba(99,102,241,0.3)]">TuneCloud</h1>
          <p className="text-surface-500 text-sm mt-1">Sign in to your music library</p>
        </div>
        <form onSubmit={handleSubmit} className="card p-6 space-y-4 shadow-glow-md">
          <div>
            <label className="block text-sm text-surface-400 mb-1">Username</label>
            <input className="input w-full" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="block text-sm text-surface-400 mb-1">Password</label>
            <input className="input w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button type="submit" disabled={loading} className="btn w-full">
            {loading ? 'Please wait...' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminView() {
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => api.adminUsers().then(setUsers).catch(console.error);
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault(); setErr(''); setOk(''); setLoading(true);
    try {
      await api.register(username, password);
      setOk(`User "${username}" created`);
      setUsername(''); setPassword('');
      load();
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold mb-4 drop-shadow-[0_0_10px_rgba(99,102,241,0.15)]">Admin — Users</h2>
      <div className="card p-4 mb-6">
        <h3 className="text-sm font-medium text-surface-400 mb-3">Create User</h3>
        <form onSubmit={create} className="space-y-3">
          <input className="input w-full" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input className="input w-full" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          {ok && <p className="text-green-400 text-sm">{ok}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Creating...' : 'Create User'}</button>
        </form>
      </div>
      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="card-hover px-4 py-3 flex items-center justify-between">
            <div>
              <span className="font-medium">{u.username}</span>
              {u.is_admin && <span className="ml-2 text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-400/20">admin</span>}
            </div>
            <span className="text-xs text-surface-500">{new Date(u.created_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState('browse');
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [repeat, setRepeat] = useState('none');
  const [shuffle, setShuffle] = useState(false);
  const [volume, setVolume] = useState(() => { try { return parseFloat(localStorage.getItem(VOL_KEY)) || 0.7; } catch { return 0.7; } });
  const [scanVersion, setScanVersion] = useState(0);

  useEffect(() => {
    if (getAuthToken()) {
      api.me().then((data) => {
        if (data.authenticated) setUser(data.user);
        else setAuthToken(null);
        setAuthLoading(false);
      }).catch(() => { setAuthToken(null); setAuthLoading(false); });
    } else {
      setAuthLoading(false);
    }
  }, []);

  const handleLogin = (userData) => setUser(userData);
  const handleLogout = () => { setUser(null); setAuthToken(null); setQueue([]); setQueueIndex(-1); };

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
  const handleArtistClick = (artist) => { setSelectedArtist(artist); setView('artist'); };
  const handleBackToArtists = () => { setSelectedArtist(null); setView('artists'); };
  const handleViewChange = (v) => { setSelectedAlbum(null); setSelectedArtist(null); setView(v); };
  const handleHome = () => { setSelectedAlbum(null); setSelectedArtist(null); setView('browse'); };

  const hasPrev = pickPrev() >= 0;
  const hasNext = pickNext() >= 0;

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{background: 'linear-gradient(135deg, #0a0a0f 0%, #14141f 30%, #1a1a2e 60%, #0f0f1a 100%)'}}>
        <div className="glass px-6 py-4 rounded-xl"><p className="text-surface-400">Loading...</p></div>
      </div>
    );
  }
  if (!user) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={view} onViewChange={handleViewChange} onHome={handleHome} user={user} onLogout={handleLogout} isAdmin={user?.is_admin} onScanComplete={() => setScanVersion((v) => v + 1)} />
        <main className="flex-1 overflow-y-auto p-6 pb-28 bg-black/20 backdrop-blur-sm">
          {view === 'browse' && <BrowseView key={scanVersion} onPlay={handlePlay} currentTrack={currentTrack} user={user} />}
          {view === 'albums' && <AlbumsView key={scanVersion} onPlay={handlePlay} currentTrack={currentTrack} onAlbumClick={handleAlbumClick} />}
          {view === 'album' && selectedAlbum && <AlbumDetail album={selectedAlbum} onPlay={handlePlay} currentTrack={currentTrack} onBack={handleBackToAlbums} user={user} />}
          {view === 'artists' && <ArtistsView key={scanVersion} onPlay={handlePlay} currentTrack={currentTrack} user={user} onArtistClick={handleArtistClick} />}
          {view === 'artist' && selectedArtist && <ArtistDetail artist={selectedArtist} onPlay={handlePlay} currentTrack={currentTrack} onBack={handleBackToArtists} user={user} />}
          {view === 'search' && <SearchView onPlay={handlePlay} currentTrack={currentTrack} user={user} onAlbumClick={handleAlbumClick} onArtistClick={handleArtistClick} />}
          {view === 'admin' && <AdminView />}
        </main>
      </div>
      {currentTrack && (
        <Player track={currentTrack} queue={queue} queueIndex={queueIndex}
          onNext={hasNext ? handleNext : null} onPrev={hasPrev ? handlePrev : null}
          onClose={closePlayer} repeat={repeat} shuffle={shuffle}
          onRepeat={toggleRepeat} onShuffle={toggleShuffle}
          volume={volume} onVolume={handleVolume} />
      )}
      <ToastContainer />
    </div>
  );
}
