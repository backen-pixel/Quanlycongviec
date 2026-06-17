/**
 * callSignaling — Signaling cuộc gọi 1-1 (Voice/Video) theo hợp đồng sự kiện mới.
 * Xem docs/CALL_SYSTEM.md (mục 3 & 4).
 *
 * Client → Server: call-user, answer-call, reject-call, end-call, ice-candidate, sdp
 * Server → Client: incoming-call, call-answered, call-rejected, call-ended,
 *                  ice-candidate, sdp, busy, call-unavailable
 *
 * Server chỉ relay (SDP/ICE) theo room `user:<id>` — bền vững khi client reconnect.
 * Media (WebRTC) đi P2P/TURN, KHÔNG qua server.
 */
const {
  resolveDirectMessengerGroupId,
  finalizeDirectCallLog,
} = require('../helpers/messengerCallLog');

const RING_TIMEOUT_MS = 35_000; // > 30s timeout phía client một chút để dọn registry

/**
 * @param {import('socket.io').Server} io
 */
function attachCallSignaling(io) {
  /** @type {Map<string, CallEntry>} */
  const calls = new Map();

  const room = (uid) => `user:${String(uid)}`;
  const isOnline = (uid) => {
    const r = io.sockets.adapter.rooms.get(room(uid));
    return !!r && r.size > 0;
  };

  /** Tìm cuộc gọi đang hoạt động (đang reo hoặc đã kết nối) mà user tham gia. */
  function activeCallOf(uid) {
    const u = String(uid);
    for (const c of calls.values()) {
      if (c.ended) continue;
      if (c.callerId === u || c.calleeId === u) return c;
    }
    return null;
  }

  async function pushIncoming(calleeId, entry) {
    try {
      const { sendMobilePush } = require('../services/pushSender');
      await sendMobilePush(String(calleeId), {
        id: `call-${entry.callId}`,
        type: 'incoming_call',
        title: 'Cuộc gọi đến',
        message: `${entry.fromName || 'Ai đó'} đang gọi bạn`,
        entity_type: 'user',
        entity_id: entry.callerId,
        metadata: {
          call_id: entry.callId,
          kind: entry.media || 'audio',
          from_user_id: entry.callerId,
          from_name: entry.fromName || 'Người gọi',
          is_group: false,
        },
      });
    } catch (e) {
      console.warn('[callSignaling] pushIncoming:', e.message || e);
    }
  }

  function clearRing(entry) {
    if (entry?.ringTimer) {
      clearTimeout(entry.ringTimer);
      entry.ringTimer = null;
    }
  }

  /** Kết thúc + ghi log + dọn registry (idempotent). */
  async function finalize(entry, { status, endedByUserId, reason } = {}) {
    if (!entry || entry.ended) return;
    entry.ended = true;
    clearRing(entry);
    calls.delete(entry.callId);
    try {
      await finalizeDirectCallLog(io, {
        groupId: entry.groupId,
        callerId: entry.callerId,
        calleeId: entry.calleeId,
        fromName: entry.fromName,
        kind: entry.media || 'audio',
        startedAt: entry.startedAt,
        answeredAt: entry.answeredAt,
      }, { status, endedByUserId, reason });
    } catch (e) {
      console.warn('[callSignaling] finalize log:', e.message || e);
    }
  }

  /** Khi callee (re)connect — gửi lại incoming-call cho cuộc gọi còn đang reo. */
  function syncPending(uid, socket) {
    const u = String(uid);
    for (const c of calls.values()) {
      if (c.ended || c.answeredAt || c.calleeId !== u) continue;
      if (Date.now() - c.startedAt > RING_TIMEOUT_MS) continue;
      socket.emit('incoming-call', {
        callId: c.callId,
        fromUserId: c.callerId,
        fromName: c.fromName,
        fromAvatar: c.fromAvatar || null,
        media: c.media || 'audio',
      });
    }
  }

  /** @param {import('socket.io').Socket} socket */
  return function register(socket) {
    const uid = String(socket.user?.userId || socket.user?.id || '');
    if (!uid) return;

    syncPending(uid, socket);

    // ─── A gọi B ───
    socket.on('call-user', async ({ callId, toUserId, media = 'audio' } = {}) => {
      if (!callId || !toUserId) return;
      const callee = String(toUserId);
      if (callee === uid) return;

      // A đang dở 1 cuộc khác → bỏ qua (tránh tạo cuộc trùng).
      const myActive = activeCallOf(uid);
      if (myActive && myActive.callId !== callId) return;

      // B đang bận → trả busy, không làm phiền B.
      const calleeActive = activeCallOf(callee);
      if (calleeActive) {
        socket.emit('busy', { callId });
        return;
      }

      let groupId = null;
      try { groupId = await resolveDirectMessengerGroupId(uid, callee); } catch { /* noop */ }

      const entry = {
        callId,
        callerId: uid,
        calleeId: callee,
        media: media === 'video' ? 'video' : 'audio',
        fromName: socket.user?.fullName || socket.user?.full_name || 'Người gọi',
        fromAvatar: socket.user?.avatar || null,
        groupId,
        startedAt: Date.now(),
        answeredAt: null,
        ended: false,
        ringTimer: null,
      };
      calls.set(callId, entry);

      io.to(room(callee)).emit('incoming-call', {
        callId,
        fromUserId: uid,
        fromName: entry.fromName,
        fromAvatar: entry.fromAvatar,
        media: entry.media,
      });

      // B offline → đánh thức bằng FCM (native dựng màn cuộc gọi đến).
      if (!isOnline(callee)) void pushIncoming(callee, entry);

      // Hết giờ đổ chuông → MISSED.
      entry.ringTimer = setTimeout(() => {
        if (entry.ended || entry.answeredAt) return;
        socket.emit('call-unavailable', { callId, reason: 'timeout' });
        io.to(room(callee)).emit('call-ended', { callId });
        void finalize(entry, { status: 'missed', endedByUserId: uid });
      }, RING_TIMEOUT_MS);
    });

    // ─── B chấp nhận ───
    socket.on('answer-call', ({ callId, toUserId } = {}) => {
      const entry = calls.get(callId);
      if (!entry || entry.ended) return;
      if (entry.calleeId !== uid) return;
      if (!entry.answeredAt) entry.answeredAt = Date.now();
      clearRing(entry);
      // Báo caller: tạo offer.
      io.to(room(toUserId || entry.callerId)).emit('call-answered', { callId, byUserId: uid });
    });

    // ─── B từ chối ───
    socket.on('reject-call', ({ callId, toUserId, reason = 'rejected' } = {}) => {
      const entry = calls.get(callId);
      const caller = toUserId || entry?.callerId;
      if (caller) io.to(room(caller)).emit('call-rejected', { callId, reason });
      if (entry) void finalize(entry, { endedByUserId: uid, reason });
    });

    // ─── Một bên cúp máy ───
    socket.on('end-call', ({ callId, toUserId } = {}) => {
      const entry = calls.get(callId);
      const other = toUserId
        || (entry ? (entry.callerId === uid ? entry.calleeId : entry.callerId) : null);
      if (other) io.to(room(other)).emit('call-ended', { callId });
      if (entry) {
        const status = entry.answeredAt ? 'completed' : undefined;
        void finalize(entry, { status, endedByUserId: uid });
      }
    });

    // ─── Relay SDP (offer/answer) ───
    socket.on('sdp', ({ callId, toUserId, description } = {}) => {
      if (!callId || !toUserId || !description) return;
      io.to(room(toUserId)).emit('sdp', { callId, fromUserId: uid, description });
    });

    // ─── Relay ICE candidate ───
    socket.on('ice-candidate', ({ callId, toUserId, candidate } = {}) => {
      if (!callId || !toUserId || !candidate) return;
      io.to(room(toUserId)).emit('ice-candidate', { callId, fromUserId: uid, candidate });
    });

    // ─── Mất kết nối: dọn cuộc đang reo do user này tạo/đang chờ ───
    socket.on('disconnect', () => {
      // Nếu user còn socket khác trong room (multi-device) thì cuộc gọi vẫn sống.
      if (isOnline(uid)) return;
      for (const c of [...calls.values()]) {
        if (c.ended) continue;
        if (c.callerId !== uid && c.calleeId !== uid) continue;
        if (c.answeredAt) continue; // cuộc đã kết nối: để client tự end khi ICE failed
        const other = c.callerId === uid ? c.calleeId : c.callerId;
        io.to(room(other)).emit('call-ended', { callId: c.callId });
        void finalize(c, { endedByUserId: uid });
      }
    });
  };
}

module.exports = { attachCallSignaling };
