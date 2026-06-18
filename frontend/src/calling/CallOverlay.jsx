/**
 * Presentation — overlay cuộc gọi 1-1 DUY NHẤT (web). Render theo state máy trạng thái.
 * Voice: avatar giữa màn hình. Video: khung 9:16 (mobile portrait) + nút điều khiển dưới cùng.
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
    session, localStream, remoteStream, groupPeers = [], groupJoinRequests = [],
    acceptCall, rejectCall, endCall, toggleMute, toggleCamera, switchCamera,
    approveGroupJoin, denyGroupJoin,
  } = useCall();

  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [now, setNow] = useState(Date.now());

  const isVideo = session?.media === 'video';
  const isGroup = session?.mode === 'group';
  const showVideo = isVideo && session?.state === 'CONNECTED' && !isGroup;

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
  const statusText = session.state === 'CONNECTED'
    ? fmt(duration)
    : (session.joinPending ? 'Đang chờ chủ phòng duyệt…' : statusLabel(session.state, session.direction));

  const displayName = isGroup ? (session.groupName || 'Cuộc gọi nhóm') : session.peer.name;
  const participantLine = isGroup
    ? `${1 + groupPeers.length} người trong cuộc gọi`
    : null;

  const controls = incomingRinging ? (
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
  );

  return (
    <div style={S.root}>
      <audio ref={remoteAudioRef} autoPlay />

      {isGroup && groupPeers.map((p) => (
        <audio
          key={p.userId}
          ref={(el) => { if (el && p.stream) el.srcObject = p.stream; }}
          autoPlay
        />
      ))}

      {isGroup ? (
        <div style={S.voiceStage}>
          <div style={S.info}>
            <div style={{ ...S.avatar, ...S.avatarFallback, fontSize: 36 }}>
              {(displayName || 'N').slice(0, 1).toUpperCase()}
            </div>
            <div style={S.name}>{displayName}</div>
            {participantLine && <div style={S.status}>{participantLine}</div>}
            <div style={S.status}>{statusText}</div>
            {groupPeers.length > 0 && (
              <div style={S.groupPeerList}>
                {groupPeers.map((p) => (
                  <div key={p.userId} style={S.groupPeerItem}>{p.name || 'Thành viên'}</div>
                ))}
              </div>
            )}
            {!!session.error && <div style={S.error}>{session.error}</div>}
          </div>
        </div>
      ) : isVideo ? (
        <div style={S.videoStage}>
          <div style={S.frame9x16}>
            {showVideo && (
              <video ref={remoteVideoRef} autoPlay playsInline style={S.remoteVideo} />
            )}
            {!showVideo && (
              <div style={S.framePlaceholder}>
                {session.peer.avatar
                  ? <img src={session.peer.avatar} alt="" style={S.avatar} />
                  : (
                    <div style={{ ...S.avatar, ...S.avatarFallback }}>
                      {(session.peer.name || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}
              </div>
            )}
            {showVideo && !session.isCameraOff && (
              <video ref={localVideoRef} autoPlay playsInline muted style={S.pip} />
            )}
            <div style={S.videoOverlayTop}>
              <div style={S.name}>{session.peer.name}</div>
              <div style={S.status}>{statusText}</div>
              {!!session.error && <div style={S.error}>{session.error}</div>}
            </div>
          </div>
        </div>
      ) : (
        <div style={S.voiceStage}>
          <div style={S.info}>
            {session.peer.avatar
              ? <img src={session.peer.avatar} alt="" style={S.avatar} />
              : (
                <div style={{ ...S.avatar, ...S.avatarFallback }}>
                  {(session.peer.name || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
            <div style={S.name}>{session.peer.name}</div>
            <div style={S.status}>{statusText}</div>
            {!!session.error && <div style={S.error}>{session.error}</div>}
          </div>
        </div>
      )}

      {isGroup && groupJoinRequests.length > 0 && !incomingRinging && (
        <div style={S.joinPanel}>
          <div style={S.joinPanelTitle}>Yêu cầu tham gia ({groupJoinRequests.length})</div>
          {groupJoinRequests.map((req) => (
            <div key={req.requesterId} style={S.joinRow}>
              <span style={S.joinName}>{req.requesterName}</span>
              <div style={S.joinActions}>
                <button type="button" style={{ ...S.joinBtn, ...S.joinApprove }} onClick={() => approveGroupJoin(req.requesterId)}>
                  Duyệt
                </button>
                <button type="button" style={{ ...S.joinBtn, ...S.joinDeny }} onClick={() => denyGroupJoin(req.requesterId)}>
                  Từ chối
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={S.controls}>{controls}</div>
    </div>
  );
}

const S = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 4000,
    background: '#0b141a',
    display: 'flex',
    flexDirection: 'column',
  },
  videoStage: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 16px 0',
  },
  frame9x16: {
    position: 'relative',
    aspectRatio: '9 / 16',
    height: '100%',
    maxHeight: 'calc(100vh - 120px)',
    maxWidth: 'min(100%, calc((100vh - 120px) * 9 / 16))',
    width: 'auto',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#1f2c34',
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    background: '#000',
  },
  framePlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, #1a2530 0%, #0b141a 100%)',
  },
  pip: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 96,
    height: 170,
    objectFit: 'cover',
    borderRadius: 10,
    background: '#1f2c34',
    border: '2px solid rgba(255,255,255,0.25)',
    zIndex: 2,
  },
  videoOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: '20px 16px 32px',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, transparent 100%)',
    zIndex: 1,
    textAlign: 'center',
  },
  voiceStage: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px 0',
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: '50%',
    objectFit: 'cover',
    background: '#1f2c34',
  },
  avatarFallback: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 48,
    fontWeight: 700,
  },
  name: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 700,
    marginTop: 12,
  },
  status: {
    color: '#aebac1',
    fontSize: 15,
    marginTop: 6,
  },
  error: {
    color: '#f87171',
    fontSize: 14,
    marginTop: 8,
  },
  controls: {
    flexShrink: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    padding: '20px 16px max(24px, env(safe-area-inset-bottom, 24px))',
    background: 'linear-gradient(to top, rgba(11,20,26,0.98) 70%, transparent)',
  },
  btn: {
    minWidth: 88,
    padding: '14px 16px',
    borderRadius: 999,
    border: 'none',
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
  },
  active: { background: '#374151' },
  accept: { background: '#22c55e' },
  danger: { background: '#ef4444' },
  groupPeerList: {
    marginTop: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    alignItems: 'center',
  },
  groupPeerItem: {
    color: '#d1d5db',
    fontSize: 14,
    padding: '4px 12px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.08)',
  },
  joinPanel: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 3,
    background: 'rgba(31,44,52,0.95)',
    borderRadius: 12,
    padding: '12px 14px',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  joinPanelTitle: {
    color: '#aebac1',
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  joinRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 0',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  joinName: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  joinActions: {
    display: 'flex',
    gap: 8,
    flexShrink: 0,
  },
  joinBtn: {
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    color: '#fff',
  },
  joinApprove: { background: '#22c55e' },
  joinDeny: { background: '#ef4444' },
};
