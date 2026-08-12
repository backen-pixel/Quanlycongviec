import { api } from '../api/client';
import { API_ORIGIN } from '../config';
import { buildMessengerMessagePreview } from './messengerPreview';
import { buildCallHistoryFromThreads, isMessengerCallLogMessage, type CallHistoryItem } from './messengerCallLog';
import { normalizeReactions } from './messengerReactions';
import type { MessengerGroupRow, MessengerMessage, MessengerReadReceipt, MessengerThread } from '../types/messenger';

export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  const s = String(url).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `${API_ORIGIN}${s.startsWith('/') ? s : `/${s}`}`;
}

function formatThreadTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate()
      && d.getMonth() === now.getMonth()
      && d.getFullYear() === now.getFullYear();
    if (sameDay) {
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate()
      && d.getMonth() === yesterday.getMonth()
      && d.getFullYear() === yesterday.getFullYear();
    if (isYesterday) return 'Hôm qua';
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays < 7) {
      return d.toLocaleDateString('vi-VN', { weekday: 'short' });
    }
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

export function formatMessageTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function mapGroupRow(row: Record<string, unknown>, myUserId?: string | null): MessengerThread {
  const id = String(row.id || '');
  const lastMessage = row.last_message != null ? String(row.last_message) : '';
  return {
    id,
    name: String(row.display_name || row.name || row.raw_name || 'Chat'),
    preview: lastMessage,
    timeLabel: formatThreadTime(row.last_message_at as string | undefined),
    unread: Number(row.unread_count || 0),
    online: false,
    isGroup: !row.is_direct,
    avatarColor: undefined,
    avatarUrl: resolveMediaUrl(
      (row.peer_avatar as string) || (row.avatar as string) || null,
    ),
    peerId: row.peer_id != null ? String(row.peer_id) : null,
    isDirect: Boolean(row.is_direct),
    lastMessageAt: row.last_message_at != null ? String(row.last_message_at) : null,
    lastUserId: row.last_user_id != null ? String(row.last_user_id) : null,
    myUserId: myUserId || null,
  };
}

export function mapMessageRow(row: Record<string, unknown>): MessengerMessage {
  const user = (row.user || {}) as Record<string, unknown>;
  const replyParent = row.reply_to_message as Record<string, unknown> | null | undefined;
  return {
    id: String(row.id || ''),
    group_id: String(row.group_id || ''),
    user_id: row.user_id != null ? String(row.user_id) : null,
    content: row.content != null ? String(row.content) : '',
    message_type: row.message_type != null ? String(row.message_type) : 'text',
    created_at: row.created_at != null ? String(row.created_at) : new Date().toISOString(),
    is_system: Boolean(row.is_system),
    is_recalled: Boolean(row.is_recalled || row.recalled_at),
    recalled_at: row.recalled_at != null ? String(row.recalled_at) : null,
    recalled_by: row.recalled_by != null ? String(row.recalled_by) : null,
    reply_to: row.reply_to != null ? String(row.reply_to) : null,
    reply_to_message: replyParent?.id ? mapMessageRow({ ...replyParent, group_id: row.group_id }) : null,
    mention_user_ids: Array.isArray(row.mention_user_ids)
      ? row.mention_user_ids.map((id) => String(id))
      : null,
    attachment_url: row.attachment_url != null ? String(row.attachment_url) : null,
    attachment_name: row.attachment_name != null ? String(row.attachment_name) : null,
    attachment_mime: row.attachment_mime != null ? String(row.attachment_mime) : null,
    attachments: Array.isArray(row.attachments) ? row.attachments : null,
    reactions: normalizeReactions(row.reactions),
    user: user.id || user.full_name || user.display_name
      ? {
          id: user.id != null ? String(user.id) : undefined,
          full_name: user.full_name != null ? String(user.full_name) : null,
          display_name: user.display_name != null ? String(user.display_name) : null,
          nickname: user.nickname != null ? String(user.nickname) : null,
          group_nickname: user.group_nickname != null ? String(user.group_nickname) : null,
          contact_nickname: user.contact_nickname != null ? String(user.contact_nickname) : null,
          avatar: user.avatar != null ? String(user.avatar) : null,
        }
      : null,
  };
}

export async function fetchMessengerGroups(myUserId?: string | null): Promise<MessengerThread[]> {
  const { data } = await api.get<unknown[]>('/messenger/groups', {
    params: { _ts: Date.now() },
  });
  const list = Array.isArray(data) ? data : [];
  return list
    .map((row) => mapGroupRow(row as Record<string, unknown>, myUserId))
    .sort((a, b) => {
      const ta = new Date(a.lastMessageAt || 0).getTime();
      const tb = new Date(b.lastMessageAt || 0).getTime();
      return tb - ta;
    });
}

export type MessengerMessagesPage = {
  messages: MessengerMessage[];
  hasMore: boolean;
};

const CHAT_PAGE_LIMIT = 60;

export async function fetchMessengerMessagesPage(
  groupId: string,
  opts?: { limit?: number; before?: string },
): Promise<MessengerMessagesPage> {
  const limit = Math.min(Math.max(Number(opts?.limit) || CHAT_PAGE_LIMIT, 1), 200);
  const params: Record<string, string | number> = { limit };
  if (opts?.before) params.before = opts.before;
  const res = await api.get<unknown[]>(`/messenger/groups/${groupId}/chat`, { params });
  const list = Array.isArray(res.data) ? res.data : [];
  const header = res.headers?.['x-has-more'] ?? res.headers?.['X-Has-More'];
  const hasMore = header === '1' || header === 1 || list.length >= limit;
  return {
    messages: list.map((row) => mapMessageRow(row as Record<string, unknown>)),
    hasMore,
  };
}

export async function fetchMessengerMessages(
  groupId: string,
  opts?: { limit?: number; before?: string },
): Promise<MessengerMessage[]> {
  const page = await fetchMessengerMessagesPage(groupId, opts);
  return page.messages;
}

export async function sendMessengerText(
  groupId: string,
  content: string,
  opts?: { replyTo?: string | null; mentionUserIds?: string[] },
): Promise<MessengerMessage> {
  const body: { content: string; reply_to?: string; mention_user_ids?: string[] } = { content };
  if (opts?.replyTo) body.reply_to = opts.replyTo;
  if (opts?.mentionUserIds?.length) body.mention_user_ids = opts.mentionUserIds;
  const { data } = await api.post<Record<string, unknown>>(`/messenger/groups/${groupId}/chat`, body);
  return mapMessageRow(data || {});
}

export async function fetchReadReceipts(groupId: string): Promise<MessengerReadReceipt[]> {
  const { data } = await api.get<unknown[]>(`/messenger/groups/${groupId}/read-receipts`);
  return (Array.isArray(data) ? data : []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      user_id: String(row.user_id || ''),
      last_read_at: String(row.last_read_at || ''),
    };
  }).filter((r) => r.user_id);
}

export async function toggleMessageReaction(
  groupId: string,
  messageId: string,
  emoji: string,
): Promise<MessengerMessage['reactions']> {
  const { data } = await api.post<{ reactions?: unknown[] }>(
    `/messenger/groups/${groupId}/chat/${messageId}/reaction`,
    { emoji },
  );
  return normalizeReactions(data?.reactions);
}

export async function recallMessengerMessage(groupId: string, messageId: string): Promise<MessengerMessage> {
  const { data } = await api.post<Record<string, unknown>>(
    `/messenger/groups/${groupId}/chat/${messageId}/recall`,
  );
  return mapMessageRow(data || { id: messageId, group_id: groupId, is_recalled: true });
}

export async function markMessengerGroupRead(groupId: string): Promise<void> {
  await api.patch(`/messenger/groups/${groupId}/read`);
}

export type MessengerGroupMember = {
  id: string;
  name: string;
  legalName?: string | null;
  avatar?: string | null;
  role?: string;
  nickname?: string | null;
  groupNickname?: string | null;
  contactNickname?: string | null;
};

export async function fetchMessengerGroupDetail(groupId: string): Promise<{
  id: string;
  name: string;
  avatar?: string | null;
  isDirect?: boolean;
  peerId?: string | null;
  peerFullName?: string | null;
  peerNickname?: string | null;
  members: MessengerGroupMember[];
}> {
  const { data } = await api.get<Record<string, unknown>>(`/messenger/groups/${groupId}`, {
    params: { _ts: Date.now() },
  });
  const membersRaw = Array.isArray(data.members) ? data.members : [];
  const members = membersRaw.map((row) => {
    const m = row as Record<string, unknown>;
    const user = (m.user || {}) as Record<string, unknown>;
    const legal = String(user.full_name || user.email || 'Thành viên');
    const display = String(user.display_name || user.group_nickname || user.nickname || legal);
    return {
      id: String(m.user_id || user.id || ''),
      name: display,
      legalName: legal,
      avatar: user.avatar != null ? String(user.avatar) : null,
      role: m.role != null ? String(m.role) : undefined,
      nickname: user.nickname != null ? String(user.nickname) : null,
      groupNickname: user.group_nickname != null ? String(user.group_nickname) : null,
      contactNickname: user.contact_nickname != null ? String(user.contact_nickname) : null,
    };
  }).filter((m) => m.id);
  return {
    id: String(data.id || groupId),
    name: String(data.display_name || data.name || 'Nhóm chat'),
    avatar: resolveMediaUrl(
      (data.peer_avatar as string) || (data.avatar as string) || null,
    ),
    isDirect: Boolean(data.is_direct),
    peerId: data.peer_id != null ? String(data.peer_id) : null,
    peerFullName: data.peer_full_name != null ? String(data.peer_full_name) : null,
    peerNickname: (() => {
      const rawNick = data.peer_nickname != null
        ? String(data.peer_nickname).trim()
        : (data.nickname != null ? String(data.nickname).trim() : '');
      if (rawNick) return rawNick;
      const display = data.display_name != null ? String(data.display_name).trim() : '';
      const legal = data.peer_full_name != null ? String(data.peer_full_name).trim() : '';
      if (display && legal && display !== legal) return display;
      return null;
    })(),
    members,
  };
}

/** Biệt danh cá nhân (chat 1-1 / toàn app). */
export async function setContactNickname(
  targetUserId: string,
  nickname: string,
  groupId?: string | null,
): Promise<string> {
  const trimmed = nickname.trim();
  const body = groupId ? { group_id: groupId } : {};
  if (!trimmed) {
    const { data } = await api.delete<{ display_name?: string }>(`/messenger/nicknames/${targetUserId}`, {
      data: body,
    });
    return String(data?.display_name || '');
  }
  const { data } = await api.put<{ display_name?: string }>(`/messenger/nicknames/${targetUserId}`, {
    nickname: trimmed,
    ...body,
  });
  return String(data?.display_name || trimmed);
}

/** Biệt danh thành viên trong nhóm. */
export async function setGroupMemberNickname(
  groupId: string,
  targetUserId: string,
  nickname: string,
): Promise<string> {
  const trimmed = nickname.trim();
  if (!trimmed) {
    const { data } = await api.delete<{ display_name?: string }>(
      `/messenger/groups/${groupId}/nicknames/${targetUserId}`,
    );
    return String(data?.display_name || '');
  }
  const { data } = await api.put<{ display_name?: string }>(
    `/messenger/groups/${groupId}/nicknames/${targetUserId}`,
    { nickname: trimmed },
  );
  return String(data?.display_name || trimmed);
}

export async function updateMessengerGroupName(groupId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Tên nhóm không được để trống');
  await api.patch(`/messenger/groups/${groupId}`, { name: trimmed });
}

export async function updateMessengerGroupAvatar(
  groupId: string,
  asset: { uri: string; name?: string; type?: string },
): Promise<string> {
  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    name: asset.name || 'avatar.jpg',
    type: asset.type || 'image/jpeg',
  } as unknown as Blob);
  const { data } = await api.patch<{ avatar?: string }>(`/messenger/groups/${groupId}/avatar`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data?.avatar ? String(data.avatar) : '';
}

/** Hình nền chat per-user — đồng bộ web / app. */
export async function fetchMessengerChatWallpaper(groupId: string): Promise<string | null> {
  const { data } = await api.get<{ wallpaper_url?: string | null }>(`/messenger/groups/${groupId}/wallpaper`);
  const url = data?.wallpaper_url ? String(data.wallpaper_url).trim() : '';
  return url ? resolveMediaUrl(url) : null;
}

export async function uploadMessengerChatWallpaper(
  groupId: string,
  asset: { uri: string; name?: string; type?: string },
): Promise<string | null> {
  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    name: asset.name || 'wallpaper.jpg',
    type: asset.type || 'image/jpeg',
  } as unknown as Blob);
  const { data } = await api.put<{ wallpaper_url?: string | null }>(
    `/messenger/groups/${groupId}/wallpaper`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  const url = data?.wallpaper_url ? String(data.wallpaper_url).trim() : '';
  return url ? resolveMediaUrl(url) : null;
}

export async function clearMessengerChatWallpaper(groupId: string): Promise<void> {
  try {
    await api.delete(`/messenger/groups/${groupId}/wallpaper`);
  } catch {
    await api.put(`/messenger/groups/${groupId}/wallpaper`, { clear: true });
  }
}

export async function fetchCallHistoryItems(
  threads: MessengerThread[],
  myUserId: string,
  maxThreads = 20,
): Promise<CallHistoryItem[]> {
  const candidates = threads
    .filter((t) => /cuộc gọi|📞|call/i.test(t.preview))
    .slice(0, maxThreads);
  if (!candidates.length) return [];

  const enriched: Array<MessengerThread & { lastMessage?: MessengerMessage | null }> = [];
  await Promise.all(
    candidates.map(async (t) => {
      try {
        const msgs = await fetchMessengerMessages(t.id, { limit: 40 });
        for (const callMsg of msgs.filter(isMessengerCallLogMessage)) {
          enriched.push({ ...t, lastMessage: callMsg });
        }
      } catch {
        /* ignore */
      }
    }),
  );

  return buildCallHistoryFromThreads(enriched, myUserId);
}

export function patchThreadFromMessage(
  thread: MessengerThread,
  message: MessengerMessage,
  myUserId?: string | null,
  incrementUnread = false,
): MessengerThread {
  const preview = buildMessengerMessagePreview(message, { forUserId: myUserId }) || thread.preview;
  const mine = myUserId && message.user_id && String(message.user_id) === String(myUserId);
  return {
    ...thread,
    preview,
    timeLabel: formatThreadTime(message.created_at),
    lastMessageAt: message.created_at,
    lastUserId: message.user_id,
    unread: incrementUnread && !mine ? thread.unread + 1 : thread.unread,
  };
}

export type { MessengerGroupRow };

export async function createDirectChat(peerUserId: string): Promise<string> {
  const { data } = await api.post<{ id?: string }>('/messenger/direct', { peer_user_id: peerUserId });
  if (!data?.id) throw new Error('Không tạo được hội thoại');
  return data.id;
}

export async function createMessengerGroup(
  name: string,
  memberIds: string[],
): Promise<{ id: string; name: string }> {
  const members = memberIds.map((user_id) => ({ user_id, role: 'member' }));
  const { data } = await api.post<{ id?: string; name?: string }>('/messenger/groups', { name, members });
  if (!data?.id) throw new Error('Không tạo được nhóm');
  return { id: String(data.id), name: String(data.name || name) };
}

export async function leaveMessengerGroup(groupId: string): Promise<void> {
  await api.post(`/messenger/groups/${groupId}/leave`);
}

export async function addMessengerGroupMembers(
  groupId: string,
  memberIds: string[],
): Promise<void> {
  if (!memberIds.length) return;
  await api.post(`/messenger/groups/${groupId}/members`, {
    members: memberIds.map((user_id) => ({ user_id, role: 'member' })),
  });
}
