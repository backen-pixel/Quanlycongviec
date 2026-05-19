import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { messengerThreadKey, messengerUnreadKey, messengerUnreadGroupKey } from '../lib/messengerHubStorage';
import { alertIncomingNotification } from '../lib/notificationAlert';
import { isNotificationTypeEnabled } from '../lib/notificationPrefsCache';
import api from '../lib/api';

function showBrowserChatNotification({ title, body, tag }) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try {
    const n = new Notification(title, { body, tag, silent: true });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore */
  }
}

const MessengerDockContext = createContext(null);

function winKeyLead(leadId) {
  return `l:${leadId}`;
}
function winKeyGroup(groupId) {
  return `g:${groupId}`;
}

export function MessengerDockProvider({ children }) {
  const { user, socket } = useAuth();
  const uid = user?.userId || user?.id;

  const [windows, setWindows] = useState([]);
  const [hubThreadLeadIds, setHubThreadLeadIds] = useState([]);
  const [hubMessengerGroupIds, setHubMessengerGroupIds] = useState([]);
  const [unreadByLeadId, setUnreadByLeadId] = useState({});
  const [unreadByGroupId, setUnreadByGroupId] = useState({});
  /** Toast tin nhắn đến (avatar + người gửi + preview) — auto ẩn sau ~7s */
  const [chatToasts, setChatToasts] = useState([]);
  const toastTimersRef = useRef(new Map());
  const unreadLeadHydratedRef = useRef(false);
  const unreadGroupHydratedRef = useRef(false);

  const presenceLeadRef = useRef(new Map());
  const presenceGroupRef = useRef(new Map());
  const windowsRef = useRef(windows);
  windowsRef.current = windows;

  useEffect(() => {
    unreadLeadHydratedRef.current = false;
    if (!uid) {
      setUnreadByLeadId({});
      return;
    }
    try {
      const raw = localStorage.getItem(messengerUnreadKey(uid));
      if (!raw) {
        setUnreadByLeadId({});
        unreadLeadHydratedRef.current = true;
        return;
      }
      const p = JSON.parse(raw);
      const next = {};
      if (p && typeof p === 'object') {
        Object.entries(p).forEach(([k, v]) => {
          const n = Number(v);
          if (!Number.isNaN(n) && n > 0) next[k] = n;
        });
      }
      setUnreadByLeadId(next);
    } catch {
      setUnreadByLeadId({});
    }
    unreadLeadHydratedRef.current = true;
  }, [uid]);

  useEffect(() => {
    if (!uid || !unreadLeadHydratedRef.current) return;
    try {
      const toSave = Object.fromEntries(Object.entries(unreadByLeadId).filter(([, v]) => Number(v) > 0));
      localStorage.setItem(messengerUnreadKey(uid), JSON.stringify(toSave));
    } catch {
      /* ignore */
    }
  }, [unreadByLeadId, uid]);

  useEffect(() => {
    unreadGroupHydratedRef.current = false;
    if (!uid) {
      setUnreadByGroupId({});
      return;
    }
    try {
      const raw = localStorage.getItem(messengerUnreadGroupKey(uid));
      if (!raw) {
        setUnreadByGroupId({});
        unreadGroupHydratedRef.current = true;
        return;
      }
      const p = JSON.parse(raw);
      const next = {};
      if (p && typeof p === 'object') {
        Object.entries(p).forEach(([k, v]) => {
          const n = Number(v);
          if (!Number.isNaN(n) && n > 0) next[k] = n;
        });
      }
      setUnreadByGroupId(next);
    } catch {
      setUnreadByGroupId({});
    }
    unreadGroupHydratedRef.current = true;
  }, [uid]);

  useEffect(() => {
    if (!uid || !unreadGroupHydratedRef.current) return;
    try {
      const toSave = Object.fromEntries(Object.entries(unreadByGroupId).filter(([, v]) => Number(v) > 0));
      localStorage.setItem(messengerUnreadGroupKey(uid), JSON.stringify(toSave));
    } catch {
      /* ignore */
    }
  }, [unreadByGroupId, uid]);

  // Hydrate unread group counts từ server khi đăng nhập / mở app — đảm bảo badge
  // hiển thị tin nhắn mới đã đến lúc user offline (không chỉ dựa socket realtime).
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const hydrateFromServer = async () => {
      try {
        const { data } = await api.get('/messenger/groups');
        if (cancelled || !Array.isArray(data)) return;
        setUnreadByGroupId((prev) => {
          const next = { ...prev };
          for (const g of data) {
            const n = Number(g?.unread_count) || 0;
            if (g?.id && n > 0) next[g.id] = n;
          }
          return next;
        });
      } catch {
        /* ignore */
      }
    };
    void hydrateFromServer();
    const tick = () => { if (!document.hidden) void hydrateFromServer(); };
    const interval = setInterval(tick, 120_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [uid]);

  const dismissChatToast = useCallback((id) => {
    setChatToasts((prev) => prev.filter((t) => t.id !== id));
    const tm = toastTimersRef.current.get(id);
    if (tm) {
      clearTimeout(tm);
      toastTimersRef.current.delete(id);
    }
  }, []);

  const pushChatToast = useCallback((toast) => {
    setChatToasts((prev) => {
      // Gộp toast cùng thread (lead/group) — giữ tối đa 4 toast
      const sameThread = prev.filter(
        (t) => !(t.leadId && t.leadId === toast.leadId) && !(t.groupId && t.groupId === toast.groupId),
      );
      const next = [toast, ...sameThread].slice(0, 4);
      return next;
    });
    const tm = setTimeout(() => dismissChatToast(toast.id), 7000);
    toastTimersRef.current.set(toast.id, tm);
  }, [dismissChatToast]);

  useEffect(() => () => {
    toastTimersRef.current.forEach((t) => clearTimeout(t));
    toastTimersRef.current.clear();
  }, []);

  const markLeadRead = useCallback((leadId) => {
    if (!leadId) return;
    setUnreadByLeadId((prev) => ({ ...prev, [leadId]: 0 }));
  }, []);

  const markGroupRead = useCallback((groupId) => {
    if (!groupId) return;
    setUnreadByGroupId((prev) => ({ ...prev, [groupId]: 0 }));
    // Đồng bộ read receipt lên server để lần hydrate sau không khôi phục badge.
    api.patch(`/messenger/groups/${groupId}/read`).catch(() => { /* ignore */ });
  }, []);

  const registerLeadChatPresence = useCallback((leadId) => {
    if (!leadId) return () => {};
    const m = presenceLeadRef.current;
    m.set(leadId, (m.get(leadId) || 0) + 1);
    return () => {
      const c = (m.get(leadId) || 1) - 1;
      if (c <= 0) m.delete(leadId);
      else m.set(leadId, c);
    };
  }, []);

  const registerMessengerGroupPresence = useCallback((groupId) => {
    if (!groupId) return () => {};
    const m = presenceGroupRef.current;
    m.set(groupId, (m.get(groupId) || 0) + 1);
    return () => {
      const c = (m.get(groupId) || 1) - 1;
      if (c <= 0) m.delete(groupId);
      else m.set(groupId, c);
    };
  }, []);

  const syncHubThreadLeadIds = useCallback((ids) => {
    setHubThreadLeadIds(Array.from(new Set((ids || []).filter(Boolean))));
  }, []);

  const syncHubMessengerGroupIds = useCallback((ids) => {
    setHubMessengerGroupIds(Array.from(new Set((ids || []).filter(Boolean))));
  }, []);

  useEffect(() => {
    if (!uid) return;
    try {
      const raw = localStorage.getItem(messengerThreadKey(uid));
      const threads = raw ? JSON.parse(raw) : [];
      syncHubThreadLeadIds((threads || []).map((t) => t.leadId).filter(Boolean));
      syncHubMessengerGroupIds((threads || []).map((t) => t.groupId).filter(Boolean));
    } catch {
      syncHubThreadLeadIds([]);
      syncHubMessengerGroupIds([]);
    }
  }, [uid, syncHubThreadLeadIds, syncHubMessengerGroupIds]);

  const openLeadChat = useCallback(
    (lead) => {
      if (!lead?.id) return;
      const id = lead.id;
      markLeadRead(id);
      const wk = winKeyLead(id);
      setWindows((w) => {
        const exists = w.some((x) => x.windowKey === wk);
        if (exists) {
          return w.map((x) =>
            x.windowKey === wk
              ? {
                  ...x,
                  minimized: false,
                  title: lead.title || x.title,
                  code: lead.code || x.code,
                  type: lead.type || x.type || 'lead',
                }
              : x,
          );
        }
        return [
          ...w,
          {
            windowKey: wk,
            chatType: 'lead',
            leadId: id,
            groupId: null,
            title: lead.title || 'Chat',
            code: lead.code || '',
            type: lead.type || 'lead',
            minimized: false,
          },
        ];
      });
    },
    [markLeadRead],
  );

  const openMessengerGroupChat = useCallback(
    (g) => {
      if (!g?.id) return;
      markGroupRead(g.id);
      const peerUserId = g.peer_id || g.peerUserId || null;
      const wk = winKeyGroup(g.id);
      setWindows((w) => {
        const exists = w.some((x) => x.windowKey === wk);
        if (exists) {
          return w.map((x) =>
            x.windowKey === wk
              ? {
                  ...x,
                  minimized: false,
                  title: g.name || g.title || x.title,
                  peerUserId: peerUserId || x.peerUserId || null,
                  isDirect: g.is_direct ?? x.isDirect ?? false,
                }
              : x,
          );
        }
        return [
          ...w,
          {
            windowKey: wk,
            chatType: 'messenger_group',
            leadId: null,
            groupId: g.id,
            title: g.name || g.title || 'Nhóm',
            code: '',
            type: 'group',
            minimized: false,
            peerUserId,
            isDirect: !!g.is_direct,
          },
        ];
      });
    },
    [markGroupRead],
  );

  const closeWindow = useCallback((windowKey) => {
    setWindows((w) => w.filter((x) => x.windowKey !== windowKey));
  }, []);

  const toggleMinimize = useCallback(
    (windowKey) => {
      setWindows((w) => {
        const hit = w.find((x) => x.windowKey === windowKey);
        const nextMin = hit ? !hit.minimized : false;
        const next = w.map((x) => (x.windowKey === windowKey ? { ...x, minimized: nextMin } : x));
        if (hit && !nextMin) {
          if (hit.chatType === 'messenger_group' && hit.groupId) markGroupRead(hit.groupId);
          else if (hit.leadId) markLeadRead(hit.leadId);
        }
        return next;
      });
    },
    [markLeadRead, markGroupRead],
  );

  useEffect(() => {
    if (!socket || !uid) return;
    const leadJoin = [...new Set([...windows.filter((w) => w.chatType === 'lead').map((w) => w.leadId), ...hubThreadLeadIds])].filter(Boolean);
    const grpJoin = [...new Set([...windows.filter((w) => w.chatType === 'messenger_group').map((w) => w.groupId), ...hubMessengerGroupIds])].filter(Boolean);
    leadJoin.forEach((id) => socket.emit('join:lead', id));
    grpJoin.forEach((id) => socket.emit('join:messenger_group', id));
    return () => {
      leadJoin.forEach((id) => socket.emit('leave:lead', id));
      grpJoin.forEach((id) => socket.emit('leave:messenger_group', id));
    };
  }, [socket, uid, windows, hubThreadLeadIds, hubMessengerGroupIds]);

  useEffect(() => {
    if (!socket || !uid) return;
    const onLeadChat = (msg) => {
      const leadId = msg.lead_id;
      if (!leadId) return;
      window.dispatchEvent(
        new CustomEvent('messenger:chat-activity', { detail: { leadId, created_at: msg.created_at } }),
      );
      const isSelf = String(msg.user_id) === String(uid);
      if (isSelf) {
        markLeadRead(leadId);
        return;
      }
      if ((presenceLeadRef.current.get(leadId) || 0) > 0) {
        markLeadRead(leadId);
        return;
      }
      const expandedDock = windowsRef.current.some((w) => w.chatType === 'lead' && w.leadId === leadId && !w.minimized);
      if (expandedDock) {
        markLeadRead(leadId);
        return;
      }
      const leadTitle = msg.lead?.title || msg.lead_title || msg.lead_name || 'Lead/Deal';
      const preview =
        msg.content || (Array.isArray(msg.attachments) && msg.attachments.length ? '[Tệp đính kèm]' : '');
      const senderName = msg.user?.full_name || 'Ai đó';
      openLeadChat({
        id: leadId,
        title: leadTitle,
        code: msg.lead?.code || msg.lead_code || '',
        type: msg.lead?.type || 'lead',
      });
      pushChatToast({
        id: `lead-${leadId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'lead',
        leadId,
        groupId: null,
        sender: {
          id: msg.user?.id || msg.user_id,
          name: senderName,
          avatar: msg.user?.avatar || null,
        },
        title: leadTitle,
        preview,
        ts: msg.created_at || new Date().toISOString(),
      });
      if (isNotificationTypeEnabled('lead_chat', 'lead')) {
        void alertIncomingNotification({ type: 'lead_chat', entityType: 'lead' });
      }
      showBrowserChatNotification({
        title: senderName,
        body: `${leadTitle}: ${preview || 'Tin nhắn mới'}`,
        tag: `lead-chat-${leadId}`,
      });
    };
    const onGroupChat = (msg) => {
      const gid = msg.group_id;
      if (!gid) return;
      window.dispatchEvent(
        new CustomEvent('messenger:group-chat-activity', { detail: { groupId: gid, created_at: msg.created_at } }),
      );
      const isSelf = String(msg.user_id) === String(uid);
      if (isSelf) {
        markGroupRead(gid);
        return;
      }
      if ((presenceGroupRef.current.get(gid) || 0) > 0) {
        markGroupRead(gid);
        return;
      }
      const expandedDock = windowsRef.current.some(
        (w) => w.chatType === 'messenger_group' && w.groupId === gid && !w.minimized,
      );
      if (expandedDock) {
        markGroupRead(gid);
        return;
      }
      const groupTitle = msg.group?.name || msg.group_name || 'Nhóm chat';
      const preview =
        msg.content || (Array.isArray(msg.attachments) && msg.attachments.length ? '[Tệp đính kèm]' : '');
      const senderName = msg.user?.full_name || 'Ai đó';
      openMessengerGroupChat({ id: gid, name: groupTitle, title: groupTitle });
      pushChatToast({
        id: `grp-${gid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'group',
        leadId: null,
        groupId: gid,
        sender: {
          id: msg.user?.id || msg.user_id,
          name: senderName,
          avatar: msg.user?.avatar || null,
        },
        title: groupTitle,
        preview,
        ts: msg.created_at || new Date().toISOString(),
      });
      if (isNotificationTypeEnabled('messenger_chat', 'messenger_group')) {
        void alertIncomingNotification({ type: 'messenger_chat', entityType: 'messenger_group' });
      }
      showBrowserChatNotification({
        title: groupTitle,
        body: `${senderName}: ${preview || 'Tin nhắn mới'}`,
        tag: `messenger-group-${gid}`,
      });
    };
    socket.on('lead:chat', onLeadChat);
    socket.on('messenger_group:chat', onGroupChat);
    return () => {
      socket.off('lead:chat', onLeadChat);
      socket.off('messenger_group:chat', onGroupChat);
    };
  }, [socket, uid, markLeadRead, markGroupRead, pushChatToast, openLeadChat, openMessengerGroupChat]);

  const value = useMemo(
    () => ({
      windows,
      unreadByLeadId,
      unreadByGroupId,
      chatToasts,
      dismissChatToast,
      openLeadChat,
      openMessengerGroupChat,
      closeWindow,
      toggleMinimize,
      markLeadRead,
      markGroupRead,
      registerLeadChatPresence,
      registerMessengerGroupPresence,
      syncHubThreadLeadIds,
      syncHubMessengerGroupIds,
    }),
    [
      windows,
      unreadByLeadId,
      unreadByGroupId,
      chatToasts,
      dismissChatToast,
      openLeadChat,
      openMessengerGroupChat,
      closeWindow,
      toggleMinimize,
      markLeadRead,
      markGroupRead,
      registerLeadChatPresence,
      registerMessengerGroupPresence,
      syncHubThreadLeadIds,
      syncHubMessengerGroupIds,
    ],
  );

  return (
    <MessengerDockContext.Provider value={value}>
      {children}
    </MessengerDockContext.Provider>
  );
}

export function useMessengerDock() {
  const ctx = useContext(MessengerDockContext);
  if (!ctx) throw new Error('useMessengerDock must be used within MessengerDockProvider');
  return ctx;
}
