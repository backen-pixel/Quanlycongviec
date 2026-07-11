import type { MessengerMessage } from '../types/messenger';

const CALL_LOG_PREFIX = ':call_log:';

export type CallLogPayload = {
  v: number;
  status: 'completed' | 'missed' | 'rejected' | 'busy' | 'cancelled';
  kind?: 'audio' | 'video' | string;
  isGroup?: boolean;
  callerId?: string;
  calleeId?: string;
  hostId?: string;
  durationSec?: number;
  participantCount?: number;
};

export function parseCallLogPayload(content: unknown): CallLogPayload | null {
  const raw = content == null ? '' : String(content).trim();
  if (!raw.startsWith(CALL_LOG_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(CALL_LOG_PREFIX.length));
    return parsed && typeof parsed === 'object' ? (parsed as CallLogPayload) : null;
  } catch {
    return null;
  }
}

export function parseCallLogFromAttachments(attachments: unknown): CallLogPayload | null {
  const arr = Array.isArray(attachments) ? attachments : [];
  const hit = arr.find(
    (a) => a && typeof a === 'object' && ((a as { type?: string }).type === 'call_log' || (a as { kind?: string }).kind === 'call_log'),
  ) as { payload?: CallLogPayload; data?: CallLogPayload } | undefined;
  if (!hit) return null;
  const p = hit.payload || hit.data || hit;
  if (p && typeof p === 'object' && ((p as CallLogPayload).v === 1 || (p as CallLogPayload).status)) {
    return { ...(p as CallLogPayload), v: 1 };
  }
  return null;
}

export function extractCallLogPayloadFromMessage(message: MessengerMessage | null | undefined): CallLogPayload | null {
  if (!message) return null;
  return parseCallLogPayload(message.content) || parseCallLogFromAttachments(message.attachments);
}

export function formatDuration(sec: number): string {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  if (n < 1) return '0:00';
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatCallLogLine(payload: CallLogPayload | null, viewerUserId?: string | null): string | null {
  if (!payload || payload.v !== 1) return null;
  const kindLabel = payload.kind === 'video' ? 'Video' : 'Thoại';
  const me = viewerUserId != null ? String(viewerUserId) : '';
  const callerId = String(payload.callerId || payload.hostId || '');

  if (payload.isGroup) {
    switch (payload.status) {
      case 'completed':
        return `Cuộc gọi nhóm ${kindLabel} · ${formatDuration(payload.durationSec || 0)}`;
      case 'missed':
        return `Cuộc gọi nhóm nhỡ (${kindLabel})`;
      case 'cancelled':
        return `Đã huỷ cuộc gọi nhóm (${kindLabel})`;
      default:
        return `Cuộc gọi nhóm (${kindLabel})`;
    }
  }

  const isOutgoing = !!(me && callerId && me === callerId);
  switch (payload.status) {
    case 'completed':
      return isOutgoing
        ? `Cuộc gọi đi (${kindLabel}) · ${formatDuration(payload.durationSec || 0)}`
        : `Cuộc gọi đến (${kindLabel}) · ${formatDuration(payload.durationSec || 0)}`;
    case 'missed':
      return isOutgoing
        ? `Cuộc gọi đi · không có phản hồi (${kindLabel})`
        : `Cuộc gọi nhỡ (${kindLabel})`;
    case 'rejected':
      return isOutgoing
        ? `Bị từ chối (${kindLabel})`
        : `Cuộc gọi đến · đã từ chối (${kindLabel})`;
    case 'busy':
      return isOutgoing ? `Máy bận (${kindLabel})` : `Cuộc gọi đến · máy bận (${kindLabel})`;
    case 'cancelled':
      return isOutgoing ? `Đã huỷ cuộc gọi (${kindLabel})` : `Cuộc gọi nhỡ (${kindLabel})`;
    default:
      return `Cuộc gọi (${kindLabel})`;
  }
}

export function isMessengerCallLogMessage(message: MessengerMessage | null | undefined): boolean {
  if (!message) return false;
  if (message.message_type === 'call') return true;
  return !!extractCallLogPayloadFromMessage(message);
}

export function callLogDisplayText(message: MessengerMessage | null | undefined, viewerUserId?: string | null): string {
  if (!message) return '';
  const parsed = extractCallLogPayloadFromMessage(message);
  if (parsed) return formatCallLogLine(parsed, viewerUserId) || '';
  if (message.message_type === 'call' && message.content) {
    const raw = String(message.content).trim();
    if (raw && !raw.startsWith(CALL_LOG_PREFIX)) return raw;
  }
  return String(message.content || '');
}

export type CallHistoryItem = {
  id: string;
  groupId: string;
  groupName: string;
  groupAvatarUrl?: string | null;
  isDirect?: boolean;
  message: MessengerMessage;
  label: string;
  status: CallLogPayload['status'];
  kind: string;
  durationSec: number;
  createdAt: string;
  isOutgoing: boolean;
};

export function buildCallHistoryFromThreads(
  threads: Array<{ id: string; name: string; avatarUrl?: string | null; isDirect?: boolean; lastMessage?: MessengerMessage | null }>,
  viewerUserId: string,
): CallHistoryItem[] {
  const items: CallHistoryItem[] = [];
  for (const t of threads) {
    const m = t.lastMessage;
    if (!m || !isMessengerCallLogMessage(m)) continue;
    const payload = extractCallLogPayloadFromMessage(m);
    if (!payload) continue;
    const callerId = String(payload.callerId || payload.hostId || '');
    items.push({
      id: String(m.id),
      groupId: t.id,
      groupName: t.name,
      groupAvatarUrl: t.avatarUrl,
      isDirect: t.isDirect,
      message: m,
      label: callLogDisplayText(m, viewerUserId),
      status: payload.status,
      kind: payload.kind === 'video' ? 'video' : 'audio',
      durationSec: payload.durationSec || 0,
      createdAt: String(m.created_at || ''),
      isOutgoing: !!(viewerUserId && callerId && viewerUserId === callerId),
    });
  }
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
