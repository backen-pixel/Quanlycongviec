import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Waveform tĩnh — thanh progress tím overlay giống Spotify. */
function WaveformBars({ progress = 0, bars = 48 }) {
  const heights = useMemo(() => {
    return Array.from({ length: bars }, (_, i) => {
      const wave = Math.sin(i * 0.55) * 0.35 + Math.cos(i * 0.21) * 0.25;
      return 28 + Math.abs(wave) * 72;
    });
  }, [bars]);

  return (
    <div className="relative h-8 flex items-end gap-[2px] flex-1 min-w-0 overflow-hidden rounded-md">
      {heights.map((h, i) => {
        const filled = (i / bars) <= progress;
        return (
          <span
            key={i}
            className={`w-[3px] rounded-full transition-colors duration-150 ${filled ? 'bg-violet-500' : 'bg-violet-200/80'}`}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

export default function VoiceSpotifyPlayer({ src, className = '' }) {
  const audioRef = useRef(null);
  const trackRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    const onTime = () => setCurrent(el.currentTime || 0);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, [src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = muted ? 0 : volume;
  }, [volume, muted, src]);

  const progress = duration > 0 ? current / duration : 0;

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el || !src) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const seek = (e) => {
    const el = audioRef.current;
    const track = trackRef.current;
    if (!el || !track || !duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    setCurrent(el.currentTime);
  };

  if (!src) {
    return (
      <div className={`rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-400 ${className}`}>
        Không có file audio
      </div>
    );
  }

  return (
    <div className={`rounded-xl bg-white/60 backdrop-blur-sm border border-violet-100/80 px-3 py-2.5 ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-violet-500 text-white flex items-center justify-center shadow-md shadow-violet-500/30 hover:scale-105 transition-transform"
          aria-label={playing ? 'Tạm dừng' : 'Phát'}
        >
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} className="ml-0.5" fill="currentColor" />}
        </button>
        <div className="flex-1 min-w-0 space-y-1">
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={duration || 0}
            aria-valuenow={current}
            onClick={seek}
            onKeyDown={(e) => {
              const el = audioRef.current;
              if (!el) return;
              if (e.key === 'ArrowRight') el.currentTime = Math.min(duration, current + 5);
              if (e.key === 'ArrowLeft') el.currentTime = Math.max(0, current - 5);
            }}
            className="cursor-pointer"
          >
            <WaveformBars progress={progress} />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium tabular-nums">
            <span>{fmtTime(current)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 shrink-0 w-20">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="p-1 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600"
            aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
          >
            {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setMuted(false);
              setVolume(Number(e.target.value));
            }}
            className="w-full h-1 accent-violet-600 cursor-pointer"
            aria-label="Âm lượng"
          />
        </div>
      </div>
    </div>
  );
}
