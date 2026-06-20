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
function winKeyDept(deptId) {
  return `d:${deptId}`;
}

/** Chỉ một bong bóng chat mở rộng — tránh sổ ngang hết màn hình. */
function withSingleExpanded(windows, focusedKey) {
  return windows.map((x) => ({
    ...x,
    minimized: x.windowKey !== focusedKey,
  }));
}

const DEPT_UNREAD_KEY_PREFIX = 'messenger:dept-unread:';
function deptUnreadKey(uid) {
  return `${DEPT_UNREAD_KEY_PREFIX}${uid}`;
}

/** Server là nguồn đúng khi unread=0 — tránh giữ số stale từ localStorage. */
function mergeGroupUnreadFromApi(prev, apiList) {
  const next = {};
  if (!Array.isArray(apiList)) return next;
  for (const g of apiList) {
    if (!g?.id) continue;
    const serverN = Number(g?.unread_count) || 0;
    if (serverN <= 0) continue;
    const localN = Number(prev?.[g.id]) || 0;
    next[g.id] = Math.max(serverN, localN);
  }
  return next;
}

export function MessengerDockProvider({ children }) {
  const { user, socket } = useAuth();
  const uid = user?.userId || user?.id;

  const [windows, setWindows] = useState([]);
  const [hubThreadLeadIds, setHubThreadLeadIds] = useState([]);
  const [hubMessengerGroupIds, setHubMessengerGroupIds] = useState([]);
  const [unreadByLeadId, setUnreadByLeadId] = useState({});
  const [unreadByGroupId, setUnreadByGroupId] = useState({});
  const [unreadByDeptId, setUnreadByDeptId] = useState({});
  /** Danh sách id phòng ban mà user là thành viên — dùng để join socket room nghe tin nhắn */
  const [myDepartmentIds, setMyDepartmentIds] = useState([]);
  /** Cache metadata phòng ban (name, color) để bật bong bóng với tiêu đề đúng */
  const [deptMetaMap, setDeptMetaMap] = useState({});
  /** Nhóm chat ghim trên thanh nhanh + danh sách hub — đồng bộ qua API /messenger/pins */
  const [pinnedGroupIds, setPinnedGroupIds] = useState([]);
  const unreadLeadHydratedRef = useRef(false);
  const unreadGroupHydratedRef = useRef(false);
  const unreadDeptHydratedRef = useRef(false);

  const presenceLeadRef = useRef(new Map());
  const presenceGroupRef = useRef(new Map());
  const presenceDeptRef = useRef(new Map());
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
    // Không khôi phục từ localStorage — tránh badge ảo (nhóm đã rời / đã đọc trên server).
    // unread lấy từ API hydrate + socket realtime.
    setUnreadByGroupId({});
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

  // ── Unread phòng ban (department chat) ───────────────────────────────
  useEffect(() => {
    unreadDeptHydratedRef.current = false;
    if (!uid) {
      setUnreadByDeptId({});
      return;
    }
    try {
      const raw = localStorage.getItem(deptUnreadKey(uid));
      if (!raw) {
        setUnreadByDeptId({});
        unreadDeptHydratedRef.current = true;
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
      setUnreadByDeptId(next);
    } catch {
      setUnreadByDeptId({});
    }
    unreadDeptHydratedRef.current = true;
  }, [uid]);

  useEffect(() => {
    if (!uid || !unreadDeptHydratedRef.current) return;
    try {
      const toSave = Object.fromEntries(Object.entries(unreadByDeptId).filter(([, v]) => Number(v) > 0));
      localStorage.setItem(deptUnreadKey(uid), JSON.stringify(toSave));
    } catch {
      /* ignore */
    }
  }, [unreadByDeptId, uid]);

  // Lấy danh sách phòng ban của tôi (để join socket room nghe tin nhắn realtime)
  useEffect(() => {
    if (!uid) {
      setMyDepartmentIds([]);
      setDeptMetaMap({});
      return;
    }
    let cancelled = false;
    const fetchDepts = async () => {
      try {
        const { data } = await api.get('/departments/my/list');
        const list = Array.isArray(data?.departments) ? data.departments : [];
        if (cancelled) return;
        setMyDepartmentIds(list.map((d) => d.id).filter(Boolean));
        setDeptMetaMap((prev) => {
          const next = { ...prev };
          for (const d of list) {
            if (d?.id) next[d.id] = { id: d.id, name: d.name || 'Phòng ban', color: d.color || '#6366F1' };
          }
          return next;
        });
      } catch {
        /* ignore */
      }
    };
    void fetchDepts();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Hydrate unread group counts từ server khi đăng nhập / mở app — đảm bảo badge
  // hiển thị tin nhắn mới đã đến lúc user offline (không chỉ dựa socket realtime).
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const hydrateFromServer = async () => {
      try {
        const { data } = await api.get('/messenger/groups');
        if (cancelled || !Array.isArray(data)) return;
        setUnreadByGroupId((prev) => mergeGroupUnreadFromApi(prev, data));
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

  const markLeadRead = useCallback((leadId) => {
    if (!leadId) return;
    setUnreadByLeadId((prev) => ({ ...prev, [leadId]: 0 }));
  }, []);

  const markGroupRead = useCallback((groupId, { skipPatch = false } = {}) => {
    if (!groupId) return;
    setUnreadByGroupId((prev) => {
      if (!prev[groupId]) return prev;
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
    if (skipPatch) return;
    // Đồng bộ read receipt lên server để lần hydrate sau không khôi phục badge.
    api.patch(`/messenger/groups/${groupId}/read`).catch(() => { /* ignore */ });
  }, []);

  /** Gộp unread_count từ GET /messenger/groups với số đang giữ local (realtime). */
  const syncUnreadFromGroups = useCallback((apiList) => {
    setUnreadByGroupId((prev) => mergeGroupUnreadFromApi(prev, apiList));
  }, []);

  const markDeptRead = useCallback((deptId) => {
    if (!deptId) return;
    setUnreadByDeptId((prev) => ({ ...prev, [deptId]: 0 }));
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

  const registerDepartmentChatPresence = useCallback((deptId) => {
    if (!deptId) return () => {};
    const m = presenceDeptRef.current;
    m.set(deptId, (m.get(deptId) || 0) + 1);
    return () => {
      const c = (m.get(deptId) || 1) - 1;
      if (c <= 0) m.delete(deptId);
      else m.set(deptId, c);
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
        let next;
        if (exists) {
          next = w.map((x) =>
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
        } else {
          next = [
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
        }
        return withSingleExpanded(next, wk);
      });
    },
    [markLeadRead],
  );

  const openMessengerGroupChat = useCallback(
    (g, { markRead = true } = {}) => {
      if (!g?.id) return;
      if (markRead) markGroupRead(g.id);
      const isDirect = !!g.is_direct;
      const peerUserId = g.peer_id || g.peerUserId || null;
      const title = isDirect
        ? (g.display_name || g.title || g.name || 'Trò chuyện')
        : (g.name || g.title || 'Nhóm');
      const avatar = g.peer_avatar ?? g.avatar ?? null;
      const wk = winKeyGroup(g.id);
      setWindows((w) => {
        const exists = w.some((x) => x.windowKey === wk);
        let next;
        if (exists) {
          next = w.map((x) =>
            x.windowKey === wk
              ? {
                  ...x,
                  minimized: false,
                  title,
                  peerUserId: peerUserId ?? x.peerUserId ?? null,
                  isDirect: isDirect || x.isDirect,
                  avatar: avatar ?? x.avatar ?? null,
                }
              : x,
          );
        } else {
          next = [
            ...w,
            {
              windowKey: wk,
              chatType: 'messenger_group',
              leadId: null,
              groupId: g.id,
              title,
              code: '',
              type: 'group',
              minimized: false,
              peerUserId,
              isDirect,
              avatar,
            },
          ];
        }
        return withSingleExpanded(next, wk);
      });
    },
    [markGroupRead],
  );

  const openDepartmentChat = useCallback(
    (d) => {
      if (!d?.id) return;
      markDeptRead(d.id);
      const wk = winKeyDept(d.id);
      const meta = deptMetaMap[d.id];
      const title = d.name || d.title || meta?.name || 'Phòng ban';
      const color = d.color || meta?.color || '#6366F1';
      setDeptMetaMap((prev) => ({ ...prev, [d.id]: { id: d.id, name: title, color } }));
      setWindows((w) => {
        const exists = w.some((x) => x.windowKey === wk);
        let next;
        if (exists) {
          next = w.map((x) =>
            x.windowKey === wk
              ? {
                  ...x,
                  minimized: false,
                  title,
                  color,
                }
              : x,
          );
        } else {
          next = [
            ...w,
            {
              windowKey: wk,
              chatType: 'department',
              leadId: null,
              groupId: null,
              deptId: d.id,
              title,
              code: '',
              type: 'department',
              color,
              minimized: false,
            },
          ];
        }
        return withSingleExpanded(next, wk);
      });
    },
    [markDeptRead, deptMetaMap],
  );

  const closeWindow = useCallback((windowKey) => {
    setWindows((w) => w.filter((x) => x.windowKey !== windowKey));
  }, []);

  const toggleMinimize = useCallback(
    (windowKey) => {
      setWindows((w) => {
        const hit = w.find((x) => x.windowKey === windowKey);
        if (!hit) return w;
        if (hit.minimized) {
          const next = w.map((x) =>
            x.windowKey === windowKey ? { ...x, minimized: false } : x,
          );
          const expanded = withSingleExpanded(next, windowKey);
          const focused = expanded.find((x) => x.windowKey === windowKey);
          if (focused && !focused.minimized) {
            if (focused.chatType === 'messenger_group' && focused.groupId) markGroupRead(focused.groupId);
            else if (focused.chatType === 'department' && focused.deptId) markDeptRead(focused.deptId);
            else if (focused.leadId) markLeadRead(focused.leadId);
          }
          return expanded;
        }
        return w.map((x) => (x.windowKey === windowKey ? { ...x, minimized: true } : x));
      });
    },
    [markLeadRead, markGroupRead, markDeptRead],
  );

  useEffect(() => {
    if (!socket || !uid) return;
    const leadJoin = [...new Set([...windows.filter((w) => w.chatType === 'lead').map((w) => w.leadId), ...hubThreadLeadIds])].filter(Boolean);
    const grpJoin = [...new Set([...windows.filter((w) => w.chatType === 'messenger_group').map((w) => w.groupId), ...hubMessengerGroupIds])].filter(Boolean);
    // Auto-join tất cả phòng ban user thuộc về để có thể nhận tin nhắn realtime
    // bất cứ nơi đâu trên web (không chỉ khi đang mở trang DepartmentChat).
    const deptJoin = [...new Set([
      ...myDepartmentIds,
      ...windows.filter((w) => w.chatType === 'department').map((w) => w.deptId),
    ])].filter(Boolean);
    const joinAll = () => {
      leadJoin.forEach((id) => socket.emit('join:lead', id));
      grpJoin.forEach((id) => socket.emit('join:messenger_group', id));
      deptJoin.forEach((id) => socket.emit('join:dept', id));
    };
    joinAll();
    socket.on('connect', joinAll);
    return () => {
      socket.off('connect', joinAll);
      leadJoin.forEach((id) => socket.emit('leave:lead', id));
      grpJoin.forEach((id) => socket.emit('leave:messenger_group', id));
      deptJoin.forEach((id) => socket.emit('leave:dept', id));
    };
  }, [socket, uid, windows, hubThreadLeadIds, hubMessengerGroupIds, myDepartmentIds]);

  /** Phát read receipt realtime tới mọi khung chat nhóm đang mở (web + bong bóng). */
  useEffect(() => {
    if (!socket) return undefined;
    const onRead = (payload) => {
      if (!payload?.group_id || !payload?.user_id || !payload?.last_read_at) return;
      window.dispatchEvent(new CustomEvent('messenger:group-read', { detail: payload }));
    };
    socket.on('messenger_group:read', onRead);
    return () => socket.off('messenger_group:read', onRead);
  }, [socket]);

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
      setUnreadByLeadId((prev) => ({
        ...prev,
        [leadId]: (Number(prev[leadId]) || 0) + 1,
      }));
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
        new CustomEvent('messenger:group-chat-activity', {
          detail: {
            groupId: gid,
            created_at: msg.created_at,
            content: msg.content || '',
            attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
            message_type: msg.message_type || null,
            user_id: msg.user_id,
            recalled_at: msg.recalled_at || null,
            is_recalled: !!(msg.recalled_at || msg.is_recalled),
            is_self: String(msg.user_id) === String(uid),
            sender_name: msg.user?.full_name || '',
          },
        }),
      );
      const isSelf = String(msg.user_id) === String(uid);
      if (isSelf) {
        markGroupRead(gid);
        return;
      }
      const activelyViewing =
        (presenceGroupRef.current.get(gid) || 0) > 0 ||
        windowsRef.current.some(
          (w) => w.chatType === 'messenger_group' && w.groupId === gid && !w.minimized,
        );
      if (activelyViewing) {
        markGroupRead(gid);
        return;
      }
      setUnreadByGroupId((prev) => ({
        ...prev,
        [gid]: (Number(prev[gid]) || 0) + 1,
      }));
      const groupTitle = msg.group?.name || msg.group_name || 'Nhóm chat';
      const preview =
        msg.content || (Array.isArray(msg.attachments) && msg.attachments.length ? '[Tệp đính kèm]' : '');
      const senderName = msg.user?.full_name || 'Ai đó';
      if (isNotificationTypeEnabled('messenger_chat', 'messenger_group')) {
        void alertIncomingNotification({ type: 'messenger_chat', entityType: 'messenger_group' });
      }
      showBrowserChatNotification({
        title: groupTitle,
        body: `${senderName}: ${preview || 'Tin nhắn mới'}`,
        tag: `messenger-group-${gid}`,
      });
    };
    const onDeptChat = (payload) => {
      const deptId = payload?.department_id;
      const msg = payload?.message;
      if (!deptId || !msg) return;
      const isSelf = String(msg.sender_id) === String(uid);
      if (isSelf) {
        markDeptRead(deptId);
        return;
      }
      // Đếm tin chưa đọc cho phòng ban (badge ở dock)
      setUnreadByDeptId((prev) => ({ ...prev, [deptId]: (Number(prev[deptId]) || 0) + 1 }));
      // Nếu user đang xem trang DepartmentChat của phòng ban này → không bật bong bóng
      if ((presenceDeptRef.current.get(deptId) || 0) > 0) {
        markDeptRead(deptId);
        return;
      }
      // Nếu đã có bong bóng dept mở (không thu nhỏ) → bỏ qua bật mới
      const expandedDock = windowsRef.current.some(
        (w) => w.chatType === 'department' && String(w.deptId) === String(deptId) && !w.minimized,
      );
      if (expandedDock) {
        markDeptRead(deptId);
        return;
      }
      const meta = deptMetaMap[deptId] || {};
      const deptName = meta.name || 'Phòng ban';
      const senderName = msg.sender?.full_name || 'Ai đó';
      const preview =
        msg.content ||
        (Array.isArray(msg.attachments) && msg.attachments.length ? '[Tệp đính kèm]' : 'Tin nhắn mới');
      if (isNotificationTypeEnabled('department_chat', 'department')) {
        void alertIncomingNotification({ type: 'department_chat', entityType: 'department' });
      }
      showBrowserChatNotification({
        title: deptName,
        body: `${senderName}: ${preview}`,
        tag: `dept-chat-${deptId}`,
      });
    };
    socket.on('lead:chat', onLeadChat);
    socket.on('messenger_group:chat', onGroupChat);
    socket.on('department_message', onDeptChat);
    return () => {
      socket.off('lead:chat', onLeadChat);
      socket.off('messenger_group:chat', onGroupChat);
      socket.off('department_message', onDeptChat);
    };
  }, [socket, uid, markLeadRead, markGroupRead, markDeptRead, deptMetaMap]);

  useEffect(() => {
    if (!uid) {
      setPinnedGroupIds([]);
      return undefined;
    }
    let cancelled = false;
    const loadPins = async () => {
      try {
        const { data } = await api.get('/messenger/pins');
        if (cancelled) return;
        setPinnedGroupIds(Array.isArray(data?.group_ids) ? data.group_ids : []);
      } catch {
        if (!cancelled) setPinnedGroupIds([]);
      }
    };
    void loadPins();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const syncPinnedGroupIds = useCallback((ids) => {
    setPinnedGroupIds(Array.isArray(ids) ? ids : []);
  }, []);

  const setMessengerGroupPin = useCallback(async (groupId, pinned, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!groupId) return !!pinned;
    const id = String(groupId);
    const currentlyPinned = pinnedGroupIds.some((x) => String(x) === id);
    const nextPinned = !!pinned;
    if (currentlyPinned === nextPinned) return nextPinned;
    try {
      await api.put(`/messenger/pins/${groupId}`, { pinned: nextPinned });
      setPinnedGroupIds((prev) => {
        if (nextPinned) return prev.some((x) => String(x) === id) ? prev : [...prev, groupId];
        return prev.filter((x) => String(x) !== id);
      });
      window.dispatchEvent(
        new CustomEvent('messenger:pin-changed', { detail: { groupId, pinned: nextPinned } }),
      );
      return nextPinned;
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Không ghim được hội thoại');
      return currentlyPinned;
    }
  }, [pinnedGroupIds]);

  const toggleMessengerGroupPin = useCallback(
    async (groupId, currentlyPinned, e) => setMessengerGroupPin(groupId, !currentlyPinned, e),
    [setMessengerGroupPin],
  );

  const value = useMemo(
    () => ({
      windows,
      unreadByLeadId,
      unreadByGroupId,
      unreadByDeptId,
      deptMetaMap,
      openLeadChat,
      openMessengerGroupChat,
      openDepartmentChat,
      closeWindow,
      toggleMinimize,
      markLeadRead,
      markGroupRead,
      markDeptRead,
      syncUnreadFromGroups,
      registerLeadChatPresence,
      registerMessengerGroupPresence,
      registerDepartmentChatPresence,
      syncHubThreadLeadIds,
      syncHubMessengerGroupIds,
      pinnedGroupIds,
      syncPinnedGroupIds,
      setMessengerGroupPin,
      toggleMessengerGroupPin,
    }),
    [
      windows,
      unreadByLeadId,
      unreadByGroupId,
      unreadByDeptId,
      deptMetaMap,
      openLeadChat,
      openMessengerGroupChat,
      openDepartmentChat,
      closeWindow,
      toggleMinimize,
      markLeadRead,
      markGroupRead,
      markDeptRead,
      syncUnreadFromGroups,
      registerLeadChatPresence,
      registerMessengerGroupPresence,
      registerDepartmentChatPresence,
      syncHubThreadLeadIds,
      syncHubMessengerGroupIds,
      pinnedGroupIds,
      syncPinnedGroupIds,
      setMessengerGroupPin,
      toggleMessengerGroupPin,
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
