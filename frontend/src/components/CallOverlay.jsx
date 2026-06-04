/**
 * CallOverlay — modal toàn màn hình hiển thị cuộc gọi đang diễn ra.
 *
 * Hỗ trợ:
 *   - Cuộc gọi 1-1 audio / video
 *   - Cuộc gọi nhóm audio / video (mesh)
 *
 * Trạng thái hiển thị:
 *   - incoming:             full-screen, avatar pulse, nút "Chấp nhận" / "Từ chối"
 *   - outgoing|connecting:  full-screen "Đang gọi…" / "Đang kết nối…" + nút huỷ
 *   - active (1-1, audio):  pill nổi góc trên-phải
 *   - active (1-1, video):  full-screen video lớn + PiP self-preview
 *   - active (nhóm, audio): pill compact, mở rộng → grid avatars
 *   - active (nhóm, video): full-screen grid videos + PiP self-preview
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Users, Maximize2, Minimize2,
  Crown, UserPlus, Check, X, MonitorUp, MonitorOff,
} from 'lucide-react';
import { useCall } from '../context/CallContext';
import { callOverlayZ } from '../lib/callOverlayZIndex';
import { publicFileUrl } from '../lib/publicFileUrl';

function formatDuration(ms) {
  if (!ms || ms < 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** Hỗ trợ React component cho <video> với srcObject (cần set qua ref). */
function StreamVideo({ stream, muted = false, mirror = false, className = '', style }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream || null;
    }
    if (stream) {
      el.play?.().catch(() => { /* autoplay có thể bị chặn — user đã có nút interact rồi */ });
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${mirror ? 'scale-x-[-1]' : ''}`}
      style={style}
    />
  );
}

function Avatar({ name, avatar, size = 120, ring = true, status: pStatus }) {
  const src = avatar ? publicFileUrl(avatar) : null;
  const letter = (name || 'U')[0].toUpperCase();
  const ringClass = ring ? 'ring-4 ring-white/30 shadow-2xl' : '';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={`rounded-full object-cover w-full h-full ${ringClass}`}
        />
      ) : (
        <div
          className={`rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white font-bold w-full h-full ${ringClass}`}
          style={{ fontSize: size * 0.4 }}
        >
          {letter}
        </div>
      )}
      {pStatus === 'connected' && (
        <span className="absolute bottom-1 right-1 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white" />
      )}
      {pStatus === 'inviting' && (
        <span className="absolute bottom-1 right-1 w-3 h-3 bg-amber-400 rounded-full ring-2 ring-white animate-pulse" />
      )}
    </div>
  );
}

/* ─── Panel yêu cầu join (chỉ host nhìn thấy) ─── */
function JoinRequestsPanel({ floating = true }) {
  const { isHost, pendingJoinRequests, approveJoinRequest, denyJoinRequest } = useCall();
  const list = Object.entries(pendingJoinRequests || {}).map(([id, info]) => ({ id, ...info }));
  if (!isHost || list.length === 0) return null;

  const containerClass = floating
    ? 'fixed top-20 right-4 w-80 bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl shadow-2xl border border-white/10 overflow-hidden'
    : 'w-full bg-slate-800/80 backdrop-blur-xl text-white rounded-2xl shadow-xl border border-white/10 overflow-hidden';

  return (
    <div className={containerClass} style={floating ? callOverlayZ(1) : undefined}>
      <div className="px-4 py-3 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-b border-white/10 flex items-center gap-2">
        <UserPlus size={16} className="text-amber-300" />
        <p className="text-xs font-semibold uppercase tracking-wider">
          Yêu cầu tham gia · {list.length}
        </p>
      </div>
      <ul className="divide-y divide-white/5 max-h-64 overflow-y-auto">
        {list.map((req) => (
          <li key={req.id} className="px-3 py-2 flex items-center gap-2">
            <Avatar name={req.name} avatar={null} size={32} ring={false} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{req.name}</p>
              <p className="text-[10px] text-white/50">Xin tham gia cuộc gọi</p>
            </div>
            <button
              type="button"
              onClick={() => denyJoinRequest(req.id)}
              className="w-8 h-8 rounded-full bg-rose-600/80 hover:bg-rose-600 flex items-center justify-center transition"
              title="Từ chối"
            >
              <X size={14} />
            </button>
            <button
              type="button"
              onClick={() => approveJoinRequest(req.id)}
              className="w-8 h-8 rounded-full bg-emerald-600/80 hover:bg-emerald-600 flex items-center justify-center transition"
              title="Duyệt"
            >
              <Check size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Self-preview PiP (góc dưới-phải) ─── */
function SelfPreview({ stream, cameraOn }) {
  if (!stream || !cameraOn) return null;
  return (
    <div
      className="fixed bottom-24 right-6 w-40 h-28 rounded-xl overflow-hidden shadow-2xl ring-2 ring-white/40 bg-black"
      style={callOverlayZ(1)}
    >
      <StreamVideo stream={stream} muted mirror className="w-full h-full object-cover" />
    </div>
  );
}

/* ─── Video tile cho 1 participant trong group (có thể có stream hoặc không) ─── */
function ParticipantVideoTile({ name, avatar, stream, hasVideo, joined, isMe, isHost, isScreenSharing, spotlight = false }) {
  const showVideo = !!(stream && hasVideo);
  // Screen-share: KHÔNG mirror (sẽ ngược chiều khi đọc), và contain để không bị crop chữ
  const videoFit = isScreenSharing ? 'object-contain bg-black' : 'object-cover';
  const mirror = isMe && !isScreenSharing;
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-slate-800 ring-1 ring-white/10 ${
      spotlight ? 'h-full w-full' : 'aspect-video'
    } ${isScreenSharing ? 'ring-2 ring-sky-400' : ''}`}>
      {showVideo ? (
        <StreamVideo stream={stream} muted={isMe} mirror={mirror} className={`w-full h-full ${videoFit}`} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-800 to-slate-900">
          <Avatar name={name} avatar={avatar} size={spotlight ? 140 : 64} ring={false} />
          {!joined && <span className="text-amber-300 text-[11px]">Đang gọi…</span>}
        </div>
      )}
      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        {isHost && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-[10px] font-bold flex items-center gap-1 shadow">
            <Crown size={10} /> Chủ phòng
          </span>
        )}
        {isScreenSharing && (
          <span className="px-2 py-0.5 rounded-full bg-sky-500/90 text-white text-[10px] font-bold flex items-center gap-1 shadow">
            <MonitorUp size={10} /> Chia sẻ
          </span>
        )}
      </div>
      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 text-white text-xs pointer-events-none">
        <span className={`w-2 h-2 rounded-full ${joined ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
        <span className="font-semibold truncate flex-1 bg-black/40 px-2 py-0.5 rounded-md backdrop-blur-sm">
          {name}{isMe ? ' (Bạn)' : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * Tính số cột tối ưu cho gallery view (không có screen share).
 * Đảm bảo tile vừa vặn — không quá nhỏ.
 */
function optimalGridCols(n) {
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  if (n <= 4) return 2;
  if (n <= 6) return 3;
  if (n <= 9) return 3;
  if (n <= 12) return 4;
  if (n <= 20) return 5;
  return 6;
}

/** Render khu vực participants — spotlight nếu có screen-share, ngược lại gallery auto. */
function ParticipantsLayout({ participants, localStream, cameraOn, isMeScreenSharing }) {
  const list = Object.entries(participants || {}).map(([id, p]) => ({
    id,
    ...p,
    stream: p.isMe ? localStream : p.stream,
    hasVideo: p.isMe ? cameraOn : p.hasVideo,
    isScreenSharing: p.isMe ? isMeScreenSharing : p.isScreenSharing,
  }));
  const spotlight = list.find((p) => p.isScreenSharing) || null;

  if (spotlight) {
    const others = list.filter((p) => p.id !== spotlight.id);
    return (
      <div className="h-full flex flex-col gap-3">
        <div className="flex-[5] min-h-0">
          <ParticipantVideoTile
            name={spotlight.name}
            avatar={spotlight.avatar}
            stream={spotlight.stream}
            hasVideo={spotlight.hasVideo}
            joined={spotlight.joined}
            isMe={spotlight.isMe}
            isHost={spotlight.isHost}
            isScreenSharing
            spotlight
          />
        </div>
        {others.length > 0 && (
          <div className="flex-[1] min-h-0">
            <div className="h-full flex gap-2 overflow-x-auto pb-1">
              {others.map((p) => (
                <div key={p.id} className="h-full aspect-video shrink-0">
                  <ParticipantVideoTile
                    name={p.name}
                    avatar={p.avatar}
                    stream={p.stream}
                    hasVideo={p.hasVideo}
                    joined={p.joined}
                    isMe={p.isMe}
                    isHost={p.isHost}
                    isScreenSharing={p.isScreenSharing}
                    spotlight
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Gallery auto-fit: tile lớn khi ít người, nhỏ dần khi nhiều
  const cols = optimalGridCols(list.length);
  return (
    <div
      className="h-full grid gap-3 content-center"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      {list.map((p) => (
        <ParticipantVideoTile
          key={p.id}
          name={p.name}
          avatar={p.avatar}
          stream={p.stream}
          hasVideo={p.hasVideo}
          joined={p.joined}
          isMe={p.isMe}
          isHost={p.isHost}
          isScreenSharing={p.isScreenSharing}
        />
      ))}
    </div>
  );
}

/* ─── 1-1 VIDEO ACTIVE ─── */
function DirectVideoActive() {
  const {
    peer, participants, localStream, directRemoteStream,
    isMuted, cameraOn, startedAt, toggleMute, toggleCamera, endCall,
    isScreenSharing, toggleScreenShare,
  } = useCall();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const hasRemoteVideo = directRemoteStream && directRemoteStream.getVideoTracks().some((t) => t.enabled);
  const peerIsSharing = !!(peer?.id && participants?.[peer.id]?.isScreenSharing);
  const remoteFit = peerIsSharing ? 'object-contain bg-black' : 'object-cover';

  return createPortal(
    <div className="fixed inset-0 bg-black flex flex-col" style={callOverlayZ()}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 px-6 py-4 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between text-white">
        <div>
          <p className="text-xs text-white/70">Đang gọi video</p>
          <h2 className="text-lg font-bold truncate max-w-[50vw]">{peer?.name || 'Người dùng'}</h2>
        </div>
        <span className="text-sm font-mono bg-white/10 px-3 py-1 rounded-full">{formatDuration(now - (startedAt || now))}</span>
      </div>

      {/* Remote video — full screen. Khi peer share màn hình → object-contain để không crop. */}
      <div className="flex-1 relative">
        {peerIsSharing && (
          <span className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-sky-500/90 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
            <MonitorUp size={12} /> Đối phương đang chia sẻ màn hình
          </span>
        )}
        {hasRemoteVideo && directRemoteStream ? (
          <StreamVideo stream={directRemoteStream} className={`w-full h-full ${remoteFit}`} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-900 via-violet-900 to-slate-900">
            <Avatar name={peer?.name} avatar={peer?.avatar} size={140} />
            <p className="text-white text-xl font-bold">{peer?.name || 'Người dùng'}</p>
            <p className="text-white/60 text-sm">Camera đối phương đang tắt</p>
          </div>
        )}
      </div>

      {/* Local PiP */}
      <SelfPreview stream={localStream} cameraOn={cameraOn} />

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4 z-10">
        <button
          type="button"
          onClick={toggleMute}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-xl ${
            isMuted ? 'bg-amber-500 text-white' : 'bg-white/15 hover:bg-white/25 text-white backdrop-blur'
          }`}
          title={isMuted ? 'Bật micro' : 'Tắt micro'}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button
          type="button"
          onClick={toggleCamera}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-xl ${
            !cameraOn ? 'bg-amber-500 text-white' : 'bg-white/15 hover:bg-white/25 text-white backdrop-blur'
          }`}
          title={cameraOn ? 'Tắt camera' : 'Bật camera'}
        >
          {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
        </button>
        <button
          type="button"
          onClick={toggleScreenShare}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-xl ${
            isScreenSharing ? 'bg-sky-500 text-white' : 'bg-white/15 hover:bg-white/25 text-white backdrop-blur'
          }`}
          title={isScreenSharing ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}
        >
          {isScreenSharing ? <MonitorOff size={22} /> : <MonitorUp size={22} />}
        </button>
        <button
          type="button"
          onClick={endCall}
          className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-2xl transition"
          title="Kết thúc"
        >
          <PhoneOff size={26} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ─── GROUP CALL ACTIVE — pill compact + expanded ─── */
function GroupCallActive() {
  const {
    groupInfo, participants, isMuted, cameraOn, kind, startedAt,
    localStream, toggleMute, toggleCamera, endCall,
    isScreenSharing, toggleScreenShare,
  } = useCall();
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(kind === 'video'); // video group → tự động expand

  useEffect(() => {
    if (!startedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const list = Object.entries(participants || {}).map(([id, p]) => ({ id, ...p }));
  const joinedCount = list.filter((p) => p.joined).length;

  if (expanded) {
    const isVideo = kind === 'video';

    return createPortal(
      <div
        className="fixed inset-0 bg-gradient-to-br from-slate-900 via-violet-900 to-slate-900 flex flex-col p-6 backdrop-blur-xl"
        style={callOverlayZ()}
      >
        <JoinRequestsPanel />
        {/* Header */}
        <div className="flex items-center justify-between text-white mb-6">
          <div>
            <p className="text-xs text-white/60">Cuộc gọi nhóm {isVideo ? 'video' : 'thoại'}</p>
            <h2 className="text-xl font-bold truncate max-w-[60vw]">{groupInfo?.name || 'Nhóm'}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono bg-white/10 px-3 py-1 rounded-full">
              {formatDuration(now - (startedAt || now))}
            </span>
            <span className="text-sm bg-white/10 px-3 py-1 rounded-full flex items-center gap-1.5">
              <Users size={14} /> {joinedCount}
            </span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              title="Thu nhỏ"
            >
              <Minimize2 size={18} />
            </button>
          </div>
        </div>

        {/* Body: gallery hoặc spotlight (khi có screen share) cho video; avatars cho audio */}
        <div className="flex-1 min-h-0 px-2">
          {isVideo ? (
            <ParticipantsLayout
              participants={participants}
              localStream={localStream}
              cameraOn={cameraOn}
              isMeScreenSharing={isScreenSharing}
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 px-4 overflow-y-auto h-full content-center">
              {list.map((p) => (
                <div key={p.id} className="flex flex-col items-center text-white">
                  <Avatar name={p.name} avatar={p.avatar} size={120} status={p.joined ? 'connected' : 'inviting'} />
                  <p className="mt-3 text-sm font-semibold text-center truncate w-full">{p.name}</p>
                  <p className={`text-[11px] mt-0.5 ${p.joined ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {p.isMe ? 'Bạn' : p.joined ? 'Đã tham gia' : 'Đang gọi…'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            type="button"
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-xl ${
              isMuted ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title={isMuted ? 'Bật micro' : 'Tắt micro'}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          {isVideo && (
            <button
              type="button"
              onClick={toggleCamera}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-xl ${
                !cameraOn ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title={cameraOn ? 'Tắt camera' : 'Bật camera'}
            >
              {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
            </button>
          )}
          {isVideo && (
            <button
              type="button"
              onClick={toggleScreenShare}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-xl ${
                isScreenSharing ? 'bg-sky-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title={isScreenSharing ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}
            >
              {isScreenSharing ? <MonitorOff size={22} /> : <MonitorUp size={22} />}
            </button>
          )}
          <button
            type="button"
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-xl"
            title="Rời cuộc gọi"
          >
            <PhoneOff size={22} />
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  // PILL compact
  const visible = list.filter((p) => p.joined).slice(0, 3);
  const extraCount = Math.max(0, joinedCount - visible.length);

  return createPortal(
    <>
    <JoinRequestsPanel />
    <div
      className="fixed top-4 right-4 bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl shadow-2xl px-3 py-2 flex items-center gap-3 min-w-[280px] border border-white/10"
      style={callOverlayZ()}
    >
      <div className="flex -space-x-2">
        {visible.map((p) => (
          <div key={p.id} className="ring-2 ring-slate-900 rounded-full">
            <Avatar name={p.name} avatar={p.avatar} size={32} ring={false} />
          </div>
        ))}
        {extraCount > 0 && (
          <div className="w-8 h-8 rounded-full bg-violet-600 ring-2 ring-slate-900 flex items-center justify-center text-[10px] font-bold">
            +{extraCount}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{groupInfo?.name || 'Cuộc gọi nhóm'}</p>
        <p className="text-[11px] text-emerald-400 font-mono">
          {formatDuration(now - (startedAt || now))} · {joinedCount} người{kind === 'video' ? ' · 📹' : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
        title="Mở rộng"
      >
        <Maximize2 size={14} />
      </button>
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
        title="Rời"
      >
        <PhoneOff size={16} />
      </button>
    </div>
    </>,
    document.body,
  );
}

export default function CallOverlay() {
  const {
    status, mode, kind, peer, groupInfo, participants, isMuted, cameraOn, startedAt, error,
    localStream,
    acceptCall, rejectCall, endCall, toggleMute, toggleCamera,
  } = useCall();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (status !== 'active' || !startedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [status, startedAt]);

  if (status === 'idle') return null;

  /* ─── ACTIVE ─── */
  if (status === 'active') {
    if (mode === 'group') return <GroupCallActive />;
    if (kind === 'video') return <DirectVideoActive />;
    // Direct audio: pill nhỏ
    return createPortal(
      <div
        className="fixed top-4 right-4 bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl shadow-2xl px-3 py-2 flex items-center gap-3 min-w-[260px] border border-white/10"
        style={callOverlayZ()}
      >
        <Avatar name={peer?.name} avatar={peer?.avatar} size={36} ring={false} />
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

  /* ─── INCOMING / OUTGOING / CONNECTING ─── */
  const isIncoming = status === 'incoming';
  const isGroup = mode === 'group';
  const isVideo = kind === 'video';
  const subtitle = isIncoming
    ? (isGroup ? `Cuộc gọi nhóm${isVideo ? ' video' : ''} đến` : `Cuộc gọi${isVideo ? ' video' : ''} đến`)
    : status === 'outgoing'
      ? (isGroup && Object.keys(participants || {}).length === 0
          ? 'Đang chờ chủ phòng duyệt…'
          : 'Đang gọi…')
      : 'Đang kết nối…';

  const title = isGroup ? (groupInfo?.name || 'Nhóm chat') : (peer?.name || 'Người dùng');
  const subInfo = isGroup
    ? (isIncoming
        ? `${peer?.name || 'Người gọi'} đang gọi cho nhóm`
        : `${Object.values(participants || {}).filter((p) => p.joined).length} đã tham gia`)
    : null;

  return createPortal(
    <div
      className="fixed inset-0 bg-gradient-to-br from-slate-900 via-violet-900 to-slate-900 flex flex-col items-center justify-center p-6 backdrop-blur-xl"
      style={callOverlayZ()}
    >
      {isGroup && <JoinRequestsPanel />}
      {isGroup && status !== 'incoming' ? (
        <div className="w-full max-w-3xl mb-8">
          <div className="text-center text-white mb-6">
            <p className="text-xs text-white/60 mb-1">{subtitle}</p>
            <h2 className="text-2xl font-bold">{title}</h2>
            {subInfo && <p className="text-sm text-white/70 mt-1">{subInfo}</p>}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 justify-items-center">
            {Object.entries(participants || {}).map(([id, p]) => (
              <div key={id} className="flex flex-col items-center text-white">
                <Avatar
                  name={p.name}
                  avatar={p.avatar}
                  size={84}
                  ring={false}
                  status={p.joined ? 'connected' : 'inviting'}
                />
                <p className="mt-2 text-xs font-semibold text-center truncate w-20">{p.name}</p>
                <p className={`text-[10px] ${p.joined ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {p.isMe ? 'Bạn' : p.joined ? 'Đã vào' : 'Đang gọi…'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="relative mb-8">
            {(isIncoming || status === 'outgoing') && (
              <>
                <span className="absolute inset-0 rounded-full bg-white/10 animate-ping" />
                <span className="absolute inset-0 rounded-full bg-white/5 animate-ping" style={{ animationDelay: '0.6s' }} />
              </>
            )}
            <div className="relative">
              {isGroup && isIncoming ? (
                <div className="w-[140px] h-[140px] rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 ring-4 ring-white/30 shadow-2xl flex items-center justify-center text-white">
                  <Users size={64} />
                </div>
              ) : (
                <Avatar name={peer?.name} avatar={peer?.avatar} size={140} />
              )}
            </div>
          </div>
          <p className="text-white text-2xl font-bold mb-1 text-center">{title}</p>
          <p className="text-white/70 text-sm mb-1 flex items-center gap-2">
            {isVideo && <Video size={14} className="opacity-80" />}
            {subtitle}
          </p>
          {subInfo && <p className="text-white/60 text-xs mt-1">{subInfo}</p>}
        </>
      )}

      {/* Local self-preview khi outgoing/connecting video call */}
      {isVideo && !isIncoming && <SelfPreview stream={localStream} cameraOn={cameraOn} />}

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
              {isVideo ? <Video size={28} /> : <Phone size={28} />}
            </button>
          </>
        ) : (
          <>
            {(isGroup || isVideo) && (
              <button
                type="button"
                onClick={toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-xl ${
                  isMuted ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={isMuted ? 'Bật micro' : 'Tắt micro'}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            )}
            {isVideo && (
              <button
                type="button"
                onClick={toggleCamera}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-xl ${
                  !cameraOn ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={cameraOn ? 'Tắt camera' : 'Bật camera'}
              >
                {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
            )}
            <button
              type="button"
              onClick={endCall}
              className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-2xl transition"
              title="Huỷ"
            >
              <PhoneOff size={28} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
