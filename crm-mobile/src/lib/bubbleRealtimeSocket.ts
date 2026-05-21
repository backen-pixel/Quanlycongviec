/**
 * Realtime bridge: 1 socket toàn cục, join mọi nhóm Messenger user là member +
 * mọi lead user đang theo dõi, đẩy tin nhắn mới xuống native bubble cache để
 * ExpandedChatPanel cập nhật ngay (không phụ thuộc Expo Push).
 *
 * Khi app bị tắt hoàn toàn — JS không chạy, socket cũng tắt. Lúc đó dùng FCM
 * data-only (CrmFirebaseMessagingService) để trigger bubble. Hai cơ chế bù trừ.
 */

import { NativeModules, Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN } from '../config';
import { api, getStoredToken } from '../api/client';

type Overlay = {
  appendMessage?: (bubbleKey: string, msgJson: string) => void;
  updateMessageReactions?: (bubbleKey: string, messageId: string, reactionsJson: string) => void;
  noteConvWithAvatar?: (
    groupId: string,
    title: string,
    avatarLetter: string,
    avatarUrl: string,
  ) => void;
  pushIncomingMessage?: (
    bubbleKey: string,
    title: string,
    avatarLetter: string,
    avatarUrl: string,
    senderName: string,
    message: string,
  ) => void;
};

const Overlay: Overlay | undefined = NativeModules.FloatingBubbleOverlay;

type IncomingMessage = {
  id?: string;
  group_id?: string;
  lead_id?: string;
  user_id?: string | null;
  content?: string | null;
  created_at?: string | null;
  is_system?: boolean;
  message_type?: string | null;
  attachment_url?: string | null;
  attachment_mime?: string | null;
  user?: { id?: string; full_name?: string | null; avatar?: string | null } | null;
};

let socket: Socket | null = null;
let started = false;
let currentUserId = '';
let joinedGroups = new Set<string>();
let joinedLeads = new Set<string>();
let foregroundGroupId: string | null = null;
let foregroundLeadId: string | null = null;

function absUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const u = raw.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  const base = (API_ORIGIN || '').replace(/\/$/, '');
  return base ? `${base}/${u.replace(/^\//, '')}` : u;
}

function letter(s: string): string {
  return s.trim()[0]?.toUpperCase() || '?';
}

function buildMsgPayload(
  m: IncomingMessage,
  bubbleKey: string,
): { payload: string; senderName: string; senderAvatar: string; text: string } {
  const senderName = m.is_system
    ? 'Hệ thống'
    : m.user?.full_name?.trim() || 'Người dùng';
  const senderId = String(m.user?.id || m.user_id || '');
  const senderAvatar = absUrl(m.user?.avatar);
  const ts = m.created_at ? new Date(m.created_at).getTime() : Date.now();
  const text = (m.content || '').trim();
  const messageType = (m.message_type || 'text').toLowerCase();
  const attachmentUrl = absUrl(m.attachment_url);
  const attachmentMime = m.attachment_mime || '';
  const payload = JSON.stringify({
    id: String(m.id || ''),
    sender: senderName,
    senderId,
    text,
    avatar: senderAvatar,
    ts,
    messageType,
    attachmentUrl,
    attachmentMime,
    reactions: [],
  });
  return { payload, senderName, senderAvatar, text };
}

async function joinAllGroups() {
  try {
    const { data } = await api.get<{ id: string; name?: string | null }[]>('/messenger/groups');
    const list = Array.isArray(data) ? data : [];
    for (const g of list) {
      if (!g?.id || joinedGroups.has(g.id)) continue;
      socket?.emit('join:messenger_group', g.id);
      joinedGroups.add(g.id);
    }
  } catch {
    /* */
  }
}

/**
 * Bật realtime cho bong bóng chat. Idempotent — gọi nhiều lần không nhân đôi
 * socket. Phải gọi sau khi user login & token đã có.
 */
export async function startBubbleRealtime(userId: string) {
  if (Platform.OS !== 'android') return;
  if (started) return;
  started = true;
  currentUserId = String(userId || '');
  const token = await getStoredToken();
  if (!token) {
    started = false;
    return;
  }

  socket = io(API_ORIGIN, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1500,
  });

  socket.on('connect', () => {
    void joinAllGroups();
  });
  if (socket.connected) void joinAllGroups();

  // Messenger group: tin nhắn mới
  socket.on('messenger_group:chat', (m: IncomingMessage) => {
    if (!m?.id || !m.group_id) return;
    // Bỏ qua nếu screen chat đang focus đúng group (in-app socket khác sẽ xử lý)
    if (foregroundGroupId && String(foregroundGroupId) === String(m.group_id)) return;
    // Bỏ qua tin của chính mình (đã hiện optimistic trong screen)
    const senderId = String(m.user?.id || m.user_id || '');
    if (senderId && currentUserId && senderId === currentUserId) return;
    const bubbleKey = String(m.group_id);
    const { payload, senderName, senderAvatar, text } = buildMsgPayload(m, bubbleKey);
    Overlay?.appendMessage?.(bubbleKey, payload);
    // Đảm bảo bong bóng có trong stack (nếu user đã grant overlay) + peek nhỏ
    if (Overlay?.pushIncomingMessage) {
      Overlay.pushIncomingMessage(
        bubbleKey,
        senderName || 'Tin nhắn',
        letter(senderName),
        senderAvatar,
        senderName,
        text || '[Tệp đính kèm]',
      );
    }
  });

  socket.on(
    'messenger_group:reactions',
    (p: { message_id: string; reactions: { user_id: string; emoji: string }[]; group_id?: string }) => {
      if (!p?.message_id || !p.group_id) return;
      Overlay?.updateMessageReactions?.(
        String(p.group_id),
        String(p.message_id),
        JSON.stringify(p.reactions || []),
      );
    },
  );

  // Lead chat realtime (cùng cơ chế) — socket dùng event `lead:chat`
  socket.on('lead:chat', (m: IncomingMessage) => {
    if (!m?.id || !m.lead_id) return;
    const leadKey = `lead:${m.lead_id}`;
    if (foregroundLeadId && String(foregroundLeadId) === String(m.lead_id)) return;
    const senderId = String(m.user?.id || m.user_id || '');
    if (senderId && currentUserId && senderId === currentUserId) return;
    const { payload, senderName, senderAvatar, text } = buildMsgPayload(m, leadKey);
    Overlay?.appendMessage?.(leadKey, payload);
    if (Overlay?.pushIncomingMessage) {
      Overlay.pushIncomingMessage(
        leadKey,
        senderName || 'Tin nhắn',
        letter(senderName),
        senderAvatar,
        senderName,
        text || '[Tệp đính kèm]',
      );
    }
  });
}

export function stopBubbleRealtime() {
  if (!started) return;
  try { socket?.disconnect(); } catch { /* */ }
  socket = null;
  started = false;
  joinedGroups = new Set();
  joinedLeads = new Set();
  foregroundGroupId = null;
  foregroundLeadId = null;
}

/** Khi user mở 1 nhóm chat trong app → tạm "câm" realtime cho nhóm đó. */
export function setForegroundGroup(groupId: string | null) {
  foregroundGroupId = groupId;
}
export function setForegroundLead(leadId: string | null) {
  foregroundLeadId = leadId;
}

/** Khi user join nhóm mới → join socket room ngay (không cần đợi reload). */
export function joinGroupRoom(groupId: string) {
  if (!socket || !groupId || joinedGroups.has(groupId)) return;
  socket.emit('join:messenger_group', groupId);
  joinedGroups.add(groupId);
}
