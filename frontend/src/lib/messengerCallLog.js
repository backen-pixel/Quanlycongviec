const CALL_LOG_PREFIX = ':call_log:';

export function parseCallLogPayload(content) {
  const raw = content == null ? '' : String(content).trim();
  if (!raw.startsWith(CALL_LOG_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(CALL_LOG_PREFIX.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function parseCallLogFromAttachments(attachments) {
  const arr = Array.isArray(attachments) ? attachments : [];
  const hit = arr.find((a) => a && (a.type === 'call_log' || a.kind === 'call_log'));
  if (!hit) return null;
  const p = hit.payload || hit.data || hit;
  if (p && typeof p === 'object' && (p.v === 1 || p.status)) return { v: 1, ...p };
  return null;
}

export function extractCallLogPayloadFromMessage(message) {
  if (!message) return null;
  return parseCallLogPayload(message.content) || parseCallLogFromAttachments(message.attachments);
}

export function formatDuration(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  if (n < 1) return '0:00';
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Thời lượng cuộc gọi dạng "22 giây" / "2 phút 5 giây". */
export function formatCallDurationVi(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  if (n < 60) return `${n} giây`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  if (s === 0) return `${m} phút`;
  return `${m} phút ${s} giây`;
}

export function getCallLogCardTitle(payload) {
  if (!payload || payload.v !== 1) return 'Cuộc gọi';
  return payload.kind === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
}

export function getCallLogCardSubtitle(payload, viewerUserId) {
  if (!payload || payload.v !== 1) return '';
  if (payload.status === 'completed' && payload.durationSec != null) {
    return formatCallDurationVi(payload.durationSec);
  }
  const me = viewerUserId != null ? String(viewerUserId) : '';
  const callerId = String(payload.callerId || payload.hostId || '');
  const isOutgoing = !!(me && callerId && me === callerId);

  if (payload.isGroup) {
    switch (payload.status) {
      case 'missed':
        return 'Cuộc gọi nhóm nhỡ';
      case 'cancelled':
        return 'Đã huỷ';
      default:
        return '';
    }
  }

  switch (payload.status) {
    case 'missed':
      return isOutgoing ? 'Không có phản hồi' : 'Cuộc gọi nhỡ';
    case 'rejected':
      return isOutgoing ? 'Bị từ chối' : 'Đã từ chối';
    case 'busy':
      return 'Máy bận';
    case 'cancelled':
      return isOutgoing ? 'Đã huỷ' : 'Cuộc gọi nhỡ';
    default:
      return '';
  }
}

/** Mục tiêu khi bấm Gọi lại — direct peer hoặc group call. */
export function resolveCallBackTarget(payload, message, viewerUserId, groupMeta, groupId, groupTitle) {
  if (!payload || payload.v !== 1) return null;
  const kind = payload.kind === 'video' ? 'video' : 'audio';

  if (payload.isGroup) {
    const members = (groupMeta?.members || [])
      .filter((m) => String(m.user_id) !== String(viewerUserId))
      .map((m) => ({
        id: m.user_id,
        name: m.user?.full_name || m.user?.email || 'Thành viên',
        avatar: m.user?.avatar || null,
      }));
    if (!members.length || !groupId) return null;
    return {
      type: 'group',
      kind,
      group: { id: groupId, name: groupTitle || 'Nhóm chat', members },
    };
  }

  const me = String(viewerUserId);
  const callerId = String(payload.callerId || message?.user_id || '');
  const calleeId = String(payload.calleeId || '');
  const peerId = me === callerId ? calleeId : callerId;
  if (!peerId || peerId === me) return null;

  const mem = (groupMeta?.members || []).find((m) => String(m.user_id) === peerId);
  const peerName =
    mem?.user?.full_name
    || mem?.user?.email
    || (me === callerId ? payload.calleeName : payload.callerName)
    || 'Thành viên';

  return {
    type: 'direct',
    kind,
    peer: { id: peerId, name: peerName, avatar: mem?.user?.avatar || null },
  };
}

/** Nhãn cuộc gọi trong chat theo người đang xem. */
export function formatCallLogLine(payload, viewerUserId) {
  if (!payload || payload.v !== 1) return null;
  const kindLabel = payload.kind === 'video' ? 'Video' : 'Thoại';
  const me = viewerUserId != null ? String(viewerUserId) : '';
  const callerId = String(payload.callerId || payload.hostId || '');

  if (payload.isGroup) {
    switch (payload.status) {
      case 'completed':
        return `📞 Cuộc gọi nhóm ${kindLabel} · ${formatDuration(payload.durationSec)}`;
      case 'missed':
        return `📞 Cuộc gọi nhóm nhỡ (${kindLabel})`;
      case 'cancelled':
        return `📞 Đã huỷ cuộc gọi nhóm (${kindLabel})`;
      default:
        return `📞 Cuộc gọi nhóm (${kindLabel})`;
    }
  }

  const isOutgoing = !!(me && callerId && me === callerId);

  switch (payload.status) {
    case 'completed':
      return isOutgoing
        ? `📞 Cuộc gọi đi (${kindLabel}) · ${formatDuration(payload.durationSec)}`
        : `📞 Cuộc gọi đến (${kindLabel}) · ${formatDuration(payload.durationSec)}`;
    case 'missed':
      return isOutgoing
        ? `📞 Cuộc gọi đi · không có phản hồi (${kindLabel})`
        : `📞 Cuộc gọi nhỡ (${kindLabel})`;
    case 'rejected':
      return isOutgoing
        ? `📞 Bị từ chối (${kindLabel})`
        : `📞 Cuộc gọi đến · đã từ chối (${kindLabel})`;
    case 'busy':
      return isOutgoing
        ? `📞 Máy bận (${kindLabel})`
        : `📞 Cuộc gọi đến · máy bận (${kindLabel})`;
    case 'cancelled':
      return isOutgoing
        ? `📞 Đã huỷ cuộc gọi (${kindLabel})`
        : `📞 Cuộc gọi nhỡ (${kindLabel})`;
    default:
      return `📞 Cuộc gọi (${kindLabel})`;
  }
}

/** Tin nhắn log cuộc gọi (theo prefix hoặc message_type). */
export function isMessengerCallLogMessage(message) {
  if (!message) return false;
  if (message.message_type === 'call') return true;
  return !!extractCallLogPayloadFromMessage(message);
}

export function callLogDisplayText(message, viewerUserId) {
  if (!message) return '';
  const parsed = extractCallLogPayloadFromMessage(message);
  if (parsed) return formatCallLogLine(parsed, viewerUserId) || '';
  if (message.message_type === 'call' && message.content) {
    const raw = String(message.content).trim();
    if (raw && !raw.startsWith(CALL_LOG_PREFIX)) return raw;
  }
  return message.content || '';
}
