/**
 * Presentation — overlay cuộc gọi 1-1 DUY NHẤT (web). Render theo state máy trạng thái.
 * Voice: chỉ <audio> ẩn cho remote. Video: <video> remote nền + local PiP.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCall } from './CallProvider';
import { statusLabel } from './callState';

function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function CallOverlay() {
  const {
    session, localStream, remoteStream,
    acceptCall, rejectCall, endCall, toggleMute, toggleCamera, switchCamera,
  } = useCall();

  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [now, setNow] = useState(Date.now());

  const isVideo = session?.media === 'video';
  const showVideo = isVideo && session?.state === 'CONNECTED';

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream, showVideo]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, showVideo]);

  useEffect(() => {
    if (session?.state !== 'CONNECTED') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session?.state]);

  const duration = useMemo(
    () => (session?.state === 'CONNECTED' && session.connectedAt ? now - session.connectedAt : 0),
    [now, session?.state, session?.connectedAt],
  );

  if (!session || session.state === 'IDLE') return null;

  const incomingRinging = session.direction === 'incoming' && session.state === 'RINGING';

  return (
    <div style={S.root}>
      <audio ref={remoteAudioRef} autoPlay />
      {showVideo && <video ref={remoteVideoRef} autoPlay playsInline style={S.remoteVideo} />}
      {showVideo && !session.isCameraOff && (
        <video ref={localVideoRef} autoPlay playsInline muted style={S.pip} />
      )}

      {!showVideo && (
        <div style={S.info}>
          {session.peer.avatar
            ? <img src={session.peer.avatar} alt="" style={S.avatar} />
            : <div style={{ ...S.avatar, ...S.avatarFallback }}>{(session.peer.name || '?').slice(0, 1).toUpperCase()}</div>}
          <div style={S.name}>{session.peer.name}</div>
          <div style={S.status}>
            {session.state === 'CONNECTED' ? fmt(duration) : statusLabel(session.state, session.direction)}
          </div>
          {!!session.error && <div style={S.error}>{session.error}</div>}
        </div>
      )}

      <div style={S.controls}>
        {incomingRinging ? (
          <>
            <button type="button" style={{ ...S.btn, ...S.accept }} onClick={acceptCall}>Nghe</button>
            <button type="button" style={{ ...S.btn, ...S.danger }} onClick={rejectCall}>Từ chối</button>
          </>
        ) : (
          <>
            <button type="button" style={{ ...S.btn, ...(session.isMuted ? S.active : {}) }} onClick={toggleMute}>
              {session.isMuted ? 'Bật mic' : 'Tắt mic'}
            </button>
            {isVideo && (
              <button type="button" style={{ ...S.btn, ...(session.isCameraOff ? S.active : {}) }} onClick={toggleCamera}>
                {session.isCameraOff ? 'Bật cam' : 'Tắt cam'}
              </button>
            )}
            {isVideo && <button type="button" style={S.btn} onClick={switchCamera}>Đổi cam</button>}
            <button type="button" style={{ ...S.btn, ...S.danger }} onClick={endCall}>Kết thúc</button>
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  root: {
    position: 'fixed', inset: 0, zIndex: 4000, background: '#0b141a',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    padding: '60px 0',
  },
  remoteVideo: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  pip: { position: 'absolute', top: 24, right: 24, width: 160, height: 220, objectFit: 'cover', borderRadius: 12, background: '#1f2c34' },
  info: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 40, zIndex: 1 },
  avatar: { width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', background: '#1f2c34' },
  avatarFallback: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 48, fontWeight: 700 },
  name: { color: '#fff', fontSize: 26, fontWeight: 700, marginTop: 20 },
  status: { color: '#aebac1', fontSize: 16, marginTop: 8 },
  error: { color: '#f87171', fontSize: 14, marginTop: 10 },
  controls: { display: 'flex', gap: 16, zIndex: 1, paddingBottom: 8 },
  btn: { minWidth: 96, padding: '14px 18px', borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 15, cursor: 'pointer' },
  active: { background: '#374151' },
  accept: { background: '#22c55e' },
  danger: { background: '#ef4444' },
};
