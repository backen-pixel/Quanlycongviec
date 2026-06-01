/**
 * CallOverlay — modal toàn màn hình hiển thị cuộc gọi đang diễn ra.
 *
 * 3 trạng thái hiển thị:
 *   - incoming:           full-screen với avatar pulse, nút "Chấp nhận" / "Từ chối"
 *   - outgoing|connecting: full-screen "Đang gọi…" / "Đang kết nối…" + nút huỷ
 *   - active:             pill nổi góc trên-phải, timer + mute + end (không che cả màn)
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { useCall } from '../context/CallContext';
import { publicFileUrl } from '../lib/publicFileUrl';

function formatDuration(ms) {
  if (!ms || ms < 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function Avatar({ name, avatar, size = 120 }) {
  const src = avatar ? publicFileUrl(avatar) : null;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover ring-4 ring-white/30 shadow-2xl"
        style={{ width: size, height: size }}
      />
    );
  }
  const letter = (name || 'U')[0].toUpperCase();
  return (
    <div
      className="rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 ring-4 ring-white/30 shadow-2xl flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {letter}
    </div>
  );
}

export default function CallOverlay() {
  const { status, peer, isMuted, startedAt, error, acceptCall, rejectCall, endCall, toggleMute } = useCall();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (status !== 'active' || !startedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [status, startedAt]);

  if (status === 'idle') return null;

  /* ─── ACTIVE: pill nhỏ góc trên ─── */
  if (status === 'active') {
    return createPortal(
      <div className="fixed top-4 right-4 z-[100] bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl shadow-2xl px-3 py-2 flex items-center gap-3 min-w-[260px] border border-white/10">
        <Avatar name={peer?.name} avatar={peer?.avatar} size={36} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{peer?.name || 'Cuộc gọi'}</p>
          <p className="text-[11px] text-emerald-400 font-mono">{formatDuration(now - startedAt)}</p>
        </div>
        <button
          type="button"
          onClick={toggleMute}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
            isMuted ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={isMuted ? 'Bật micro' : 'Tắt micro'}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          type="button"
          onClick={endCall}
          className="w-9 h-9 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition shadow-md"
          title="Kết thúc"
        >
          <PhoneOff size={16} />
        </button>
      </div>,
      document.body,
    );
  }

  /* ─── INCOMING/OUTGOING/CONNECTING: full-screen modal ─── */
  const isIncoming = status === 'incoming';
  const subtitle = isIncoming
    ? 'Cuộc gọi đến'
    : status === 'outgoing'
      ? 'Đang gọi…'
      : 'Đang kết nối…';

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-violet-900 to-slate-900 flex flex-col items-center justify-center p-6 backdrop-blur-xl">
      {/* Wave background pulses */}
      <div className="relative mb-8">
        {(isIncoming || status === 'outgoing') && (
          <>
            <span className="absolute inset-0 rounded-full bg-white/10 animate-ping" />
            <span className="absolute inset-0 rounded-full bg-white/5 animate-ping" style={{ animationDelay: '0.6s' }} />
          </>
        )}
        <div className="relative">
          <Avatar name={peer?.name} avatar={peer?.avatar} size={140} />
        </div>
      </div>

      <p className="text-white text-2xl font-bold mb-1 text-center">{peer?.name || 'Người dùng'}</p>
      <p className="text-white/70 text-sm mb-1">{subtitle}</p>
      {error && <p className="text-rose-300 text-xs mt-2">{error}</p>}

      <div className="flex items-center gap-6 mt-12">
        {isIncoming ? (
          <>
            <button
              type="button"
              onClick={rejectCall}
              className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-2xl transition"
              title="Từ chối"
            >
              <PhoneOff size={28} />
            </button>
            <button
              type="button"
              onClick={acceptCall}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center shadow-2xl transition animate-pulse"
              title="Chấp nhận"
            >
              <Phone size={28} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-2xl transition"
            title="Huỷ"
          >
            <PhoneOff size={28} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
