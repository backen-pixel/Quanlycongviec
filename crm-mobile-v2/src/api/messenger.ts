import { colorFromName, relativeTime, resolveMediaUrl, timeLabel } from '../lib/media';
import { api } from './client';
import type { ChatMessage, ChatThread } from '../types';

type ApiGroup = {
  id: string;
  name?: string | null;
  raw_name?: string | null;
  avatar?: string | null;
  is_direct?: boolean;
  peer_avatar?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  last_user_id?: string | null;
  unread_count?: number;
};

type ApiMessage = {
  id: string;
  user_id?: string | null;
  content?: string | null;
  created_at?: string | null;
  is_system?: boolean;
  recalled_at?: string | null;
  is_recalled?: boolean | null;
};

export type ThreadItem = ChatThread & { avatarUrl: string | null };

export async function fetchThreads(myId: string, signal?: AbortSignal): Promise<ThreadItem[]> {
  const { data } = await api.get<ApiGroup[]>('/messenger/groups', { signal });
  const list = Array.isArray(data) ? data : [];
  return list.map((g): ThreadItem => {
    const name = g.name || g.raw_name || 'Hội thoại';
    const mine = g.last_user_id && myId && g.last_user_id === myId;
    return {
      id: g.id,
      name,
      preview: (mine ? 'Bạn: ' : '') + (g.last_message || 'Chưa có tin nhắn'),
      timeLabel: relativeTime(g.last_message_at),
      unread: g.unread_count || 0,
      isDirect: !!g.is_direct,
      color: colorFromName(name),
      avatarUrl: resolveMediaUrl(g.avatar || g.peer_avatar),
    };
  });
}

export async function fetchMessages(
  groupId: string,
  myId: string,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const { data } = await api.get<ApiMessage[]>(`/messenger/groups/${groupId}/chat`, { signal });
  const list = Array.isArray(data) ? data : [];
  return list
    .filter((m) => !m.is_system && !m.recalled_at && !m.is_recalled)
    .map((m): ChatMessage => ({
      id: m.id,
      text: m.content || '',
      time: timeLabel(m.created_at),
      mine: !!(m.user_id && myId && m.user_id === myId),
      read: true,
    }));
}

export async function sendMessage(groupId: string, content: string): Promise<ChatMessage> {
  const { data } = await api.post<ApiMessage>(`/messenger/groups/${groupId}/chat`, { content });
  return {
    id: data?.id || `tmp${Date.now()}`,
    text: data?.content || content,
    time: timeLabel(data?.created_at) || timeLabel(new Date().toISOString()),
    mine: true,
    read: false,
  };
}
