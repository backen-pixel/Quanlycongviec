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

export function formatDuration(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  if (n < 1) return '0:00';
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

export function callLogDisplayText(message, viewerUserId) {
  if (!message) return '';
  const parsed = parseCallLogPayload(message.content);
  if (parsed) return formatCallLogLine(parsed, viewerUserId) || message.content || '';
  return message.content || '';
}
