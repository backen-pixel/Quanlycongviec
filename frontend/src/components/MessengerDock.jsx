import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import { LeadChatTab, MessengerGroupChatTab } from './LeadChatTabs';
import DepartmentChatBubble from './DepartmentChatBubble';
import { X, Minus, Maximize2, Users, Building2, Pin } from 'lucide-react';
import api from '../lib/api';
import { publicFileUrl } from '../lib/publicFileUrl';
import OnlineStatusDot, { getUserPresence } from './OnlineStatusDot';
import { usePresence } from '../shared/context/PresenceContext';
import {
  formatChatHeaderPresenceLabel,
} from '../lib/userPresenceDisplay';
import {
  buildMessengerMessagePreview,
  normalizeMessengerPreviewText,
  pickNewestMessengerPreview,
} from '../lib/messengerPreview';
import { isMessengerCallLogMessage } from '../lib/messengerCallLog';
import { messengerThreadKey } from '../lib/messengerHubStorage';
import { useRelativeTimeTick } from '../hooks/useRelativeTimeTick';
import MessengerQuickChatDock, {
  QUICK_CHAT_DOCK_VISUAL_W,
  QUICK_CHAT_PANEL_W,
} from './MessengerQuickChatDock';

export const MESSENGER_DOCK_W = QUICK_CHAT_DOCK_VISUAL_W;
const BUBBLE_W = 340;
const BUBBLE_GAP = 14;
const BUBBLE_MAX_H = 520;
const DOCK_FIXED_RIGHT = 16;
const DOCK_PANEL_GAP = 12;
const VIEWPORT_MARGIN = 8;
/** Trên layout CRM (main z-10); dưới modal toàn trang (vd. z-220) nhờ createPortal ra document.body */
const Z_BUBBLE = 100;
const DOCK_MAX_SHORTCUTS = 50;

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** Bubble chat — bên trái dock cố định */
function computeBubbleLayout(index, viewport, panelExpanded) {
  const margin = VIEWPORT_MARGIN;
  const dockOffset = DOCK_FIXED_RIGHT + QUICK_CHAT_DOCK_VISUAL_W + (panelExpanded ? QUICK_CHAT_PANEL_W + DOCK_PANEL_GAP : 0);
  const bubbleH = Math.min(BUBBLE_MAX_H, viewport.h - margin * 2);

  let right = dockOffset + BUBBLE_GAP + index * (BUBBLE_W + BUBBLE_GAP);
  const leftEdge = viewport.w - right - BUBBLE_W;
  if (leftEdge < margin) {
    right = viewport.w - BUBBLE_W - margin;
  }

  let bottom = margin;
  const bubbleTop = viewport.h - bottom - bubbleH;
  if (bubbleTop < margin) {
    bottom = Math.max(margin, viewport.h - bubbleH - margin);
  }

  return { right, bottom, height: bubbleH };
}

/** Thứ tự trên thanh compact: ghim → có tin mới/chưa đọc → gần đây nhất */
function compareDockItems(a, b) {
  const aPin = !!a.pinned;
  const bPin = !!b.pinned;
  if (aPin !== bPin) return aPin ? -1 : 1;

  const aUnread = Number(a.unread) || 0;
  const bUnread = Number(b.unread) || 0;
  if (aUnread > 0 && bUnread === 0) return -1;
  if (bUnread > 0 && aUnread === 0) return 1;
  if (aUnread !== bUnread) return bUnread - aUnread;

  const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
  const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
  return bTime - aTime;
}

function readLsMessengerThreads(uid) {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(messengerThreadKey(uid));
    const ls = raw ? JSON.parse(raw) : [];
    return (Array.isArray(ls) ? ls : []).filter((t) => t.kind === 'messenger' && t.groupId);
  } catch {
    return [];
  }
}

function mergeApiGroupsWithPreviewCache(apiList, uid, prevGroups = []) {
  const lsById = new Map(readLsMessengerThreads(uid).map((t) => [String(t.groupId), t]));
  const prevById = new Map((prevGroups || []).map((g) => [String(g.id), g]));
  return (Array.isArray(apiList) ? apiList : []).map((g) => {
    const ls = lsById.get(String(g.id));
    const prev = prevById.get(String(g.id));
    const { preview, lastMessageAt } = pickNewestMessengerPreview([
      { preview: g.last_message, at: g.last_message_at || g.created_at },
      { preview: ls?.lastPreview, at: ls?.lastMessageAt || ls?.updatedAt },
      { preview: prev?.last_message, at: prev?.last_message_at || prev?.created_at },
    ]);
    return {
      ...g,
      last_message: preview || g.last_message || null,
      last_message_at: lastMessageAt || g.last_message_at || g.created_at,
    };
  });
}

function persistDockThreadPreview(uid, groupId, preview, at) {
  if (!uid || !groupId || !preview) return;
  try {
    const raw = localStorage.getItem(messengerThreadKey(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(parsed) ? parsed : [];
    const idx = arr.findIndex((t) => t.kind === 'messenger' && String(t.groupId) === String(groupId));
    const patch = {
      kind: 'messenger',
      groupId,
      lastPreview: preview,
      lastMessageAt: at,
      updatedAt: at,
    };
    if (idx >= 0) arr[idx] = { ...arr[idx], ...patch };
    else arr.push(patch);
    localStorage.setItem(messengerThreadKey(uid), JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

function avatarUrl(av) {
  if (!av || typeof av !== 'string') return null;
  const u = publicFileUrl(av.trim());
  return u || null;
}

/** Avatar tròn/vuông — ảnh thật nếu có, fallback chữ cái + gradient. */
function DockAvatar({ src, name, size = 'sm', className = '', ringClass = 'ring-2 ring-white/70', maxInitials = 1, children }) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = avatarUrl(src);
  const showImg = !!(url && !imgFailed);
  const label = name || '?';
  const sizeCls =
    size === 'header'
      ? 'w-9 h-9 text-xs rounded-2xl'
      : size === 'dock'
        ? 'w-10 h-10 text-[11px] rounded-xl'
        : 'w-8 h-8 text-[11px] rounded-xl';
  const initials = initialsOf(label).slice(0, maxInitials);

  return (
    <span
      className={`relative shrink-0 flex items-center justify-center font-bold text-white shadow-sm overflow-hidden ${sizeCls} ${ringClass} ${className}`}
      style={!showImg ? { background: bubbleGradientFor(label) } : undefined}
    >
      {showImg ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        initials
      )}
      {children}
    </span>
  );
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const BUBBLE_GRADIENTS = [
  'linear-gradient(135deg, #0ea5e9, #0891b2)',
  'linear-gradient(135deg, #8b5cf6, #6366f1)',
  'linear-gradient(135deg, #f43f5e, #ec4899)',
  'linear-gradient(135deg, #22c55e, #16a34a)',
  'linear-gradient(135deg, #f59e0b, #ea580c)',
  'linear-gradient(135deg, #14b8a6, #0d9488)',
];
function bubbleGradientFor(name) {
  const s = String(name || '?');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return BUBBLE_GRADIENTS[h % BUBBLE_GRADIENTS.length];
}

export default function MessengerDock() {
  const { user, socket } = useAuth();
  const uid = user?.userId || user?.id;
  const {
    windows,
    closeWindow,
    toggleMinimize,
    unreadByLeadId,
    unreadByGroupId,
    unreadByDeptId,
    openMessengerGroupChat,
    openLeadChat,
    openDepartmentChat,
    pinnedGroupIds,
    syncPinnedGroupIds,
    toggleMessengerGroupPin,
  } = useMessengerDock();
  const [dockExpanded, setDockExpanded] = useState(false);
  const [panelSearch, setPanelSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [staffRows, setStaffRows] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);

  const dockRef = useRef(null);
  const panelRef = useRef(null);

  const viewport = useViewportSize();

  const closeDock = useCallback(() => {
    setDockExpanded(false);
    setPanelSearch('');
    setStaffRows([]);
    setOnlineOnly(false);
  }, []);

  useEffect(() => {
    if (!dockExpanded) return;
    const onDown = (e) => {
      const t = e.target;
      if (panelRef.current?.contains(t) || dockRef.current?.contains(t)) return;
      closeDock();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [dockExpanded, closeDock]);

  const loadDockData = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const [{ data: apiList }, { data: pinPayload }] = await Promise.all([
        api.get('/messenger/groups'),
        api.get('/messenger/pins').catch(() => ({ data: { group_ids: [] } })),
      ]);
      setGroups((prev) => mergeApiGroupsWithPreviewCache(apiList, uid, prev));
      syncPinnedGroupIds(Array.isArray(pinPayload?.group_ids) ? pinPayload.group_ids : []);
    } catch {
      setGroups((prev) => (prev.length ? prev : []));
      syncPinnedGroupIds([]);
    } finally {
      setGroupsLoading(false);
    }
  }, [uid, syncPinnedGroupIds]);

  const toggleDockExpanded = useCallback(() => {
    setDockExpanded((v) => {
      if (!v) void loadDockData();
      return !v;
    });
  }, [loadDockData]);

  useEffect(() => {
    if (!user) return;
    void loadDockData();
  }, [user, loadDockData]);

  useEffect(() => {
    if (!uid) return undefined;
    let reloadT;
    const onGroupActivity = (e) => {
      const {
        groupId,
        created_at,
        content,
        attachments,
        message_type,
        is_self,
        sender_name,
        user_id,
        recalled_at,
        is_recalled,
      } = e.detail || {};
      if (!groupId || !created_at) return;
      const body = buildMessengerMessagePreview(
        {
          content,
          attachments,
          message_type,
          user_id,
          recalled_at,
          is_recalled: !!(recalled_at || is_recalled),
        },
        { forUserId: uid, maxLen: 80 },
      );
      const isCallLog = isMessengerCallLogMessage({ content, message_type, attachments });
      const prefix = isCallLog ? '' : is_self ? 'Bạn: ' : sender_name ? `${sender_name}: ` : '';
      const livePreview = body ? normalizeMessengerPreviewText(isCallLog ? body : `${prefix}${body}`) : '';
      setGroups((prev) => {
        const idx = prev.findIndex((g) => String(g.id) === String(groupId));
        if (idx === -1) {
          clearTimeout(reloadT);
          reloadT = setTimeout(() => void loadDockData(), 500);
          return prev;
        }
        return prev.map((g) => {
          if (String(g.id) !== String(groupId)) return g;
          const nextTs = new Date(created_at).getTime();
          const curTs = new Date(g.last_message_at || g.created_at || 0).getTime();
          if (nextTs < curTs) return g;
          const ls = readLsMessengerThreads(uid).find((t) => String(t.groupId) === String(groupId));
          const { preview, lastMessageAt } = pickNewestMessengerPreview([
            { preview: livePreview, at: created_at },
            { preview: g.last_message, at: g.last_message_at || g.created_at },
            { preview: ls?.lastPreview, at: ls?.lastMessageAt || ls?.updatedAt },
          ]);
          const nextPreview = preview || g.last_message;
          const nextAt = lastMessageAt || created_at;
          if (nextPreview) persistDockThreadPreview(uid, groupId, nextPreview, nextAt);
          return {
            ...g,
            last_message: nextPreview,
            last_message_at: nextAt,
          };
        });
      });
    };
    window.addEventListener('messenger:group-chat-activity', onGroupActivity);
    return () => {
      clearTimeout(reloadT);
      window.removeEventListener('messenger:group-chat-activity', onGroupActivity);
    };
  }, [uid, loadDockData]);

  useEffect(() => {
    if (!dockExpanded) return;
    void loadDockData();
  }, [dockExpanded, loadDockData]);

  const expanded = useMemo(() => windows.filter((w) => !w.minimized), [windows]);

  useEffect(() => {
    const q = panelSearch.trim();
    if (!dockExpanded || !q) {
      setStaffRows([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setStaffLoading(true);
      try {
        const { data } = await api.get('/users', { params: { search: q } });
        const users = data?.users || [];
        if (!cancelled) setStaffRows(Array.isArray(users) ? users.slice(0, 20) : []);
      } catch {
        if (!cancelled) setStaffRows([]);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [panelSearch, dockExpanded]);

  const dockShortcuts = useMemo(() => {
    const pinSet = new Set(pinnedGroupIds.map(String));
    const sorted = [...groups].sort((a, b) => {
      const aPin = pinSet.has(String(a.id));
      const bPin = pinSet.has(String(b.id));
      if (aPin && !bPin) return -1;
      if (!aPin && bPin) return 1;
      return new Date(b.last_message_at || b.created_at || 0) - new Date(a.last_message_at || a.created_at || 0);
    });
    return sorted.slice(0, DOCK_MAX_SHORTCUTS).map((g) => ({
      ...g,
      pinned: pinSet.has(String(g.id)),
    }));
  }, [groups, pinnedGroupIds]);

  const pinnedGroupIdSet = useMemo(() => new Set(pinnedGroupIds.map(String)), [pinnedGroupIds]);

  const toggleGroupPin = useCallback(
    (groupId, currentlyPinned, e) => toggleMessengerGroupPin(groupId, currentlyPinned, e),
    [toggleMessengerGroupPin],
  );

  const groupAvatarById = useMemo(() => {
    const m = new Map();
    for (const g of groups) {
      if (g?.id && g.peer_avatar) m.set(String(g.id), g.peer_avatar);
    }
    return m;
  }, [groups]);

  const groupPeerById = useMemo(() => {
    const m = new Map();
    for (const g of groups) {
      if (g?.id && g.is_direct && g.peer_id) m.set(String(g.id), String(g.peer_id));
    }
    return m;
  }, [groups]);

  const presenceUserIds = useMemo(() => {
    const ids = new Set();
    staffRows.forEach((u) => {
      if (u?.id) ids.add(String(u.id));
    });
    groups.forEach((g) => {
      if (g.is_direct && g.peer_id) ids.add(String(g.peer_id));
    });
    dockShortcuts.forEach((g) => {
      if (g.is_direct && g.peer_id) ids.add(String(g.peer_id));
    });
    windows.forEach((w) => {
      if (w.peerUserId) ids.add(String(w.peerUserId));
      else if (w.groupId && groupPeerById.has(String(w.groupId))) {
        ids.add(groupPeerById.get(String(w.groupId)));
      }
    });
    return [...ids];
  }, [staffRows, groups, dockShortcuts, windows, groupPeerById]);

  const presenceByUser = usePresence(presenceUserIds, { enabled: !!uid });

  useRelativeTimeTick();

  const onPickStaff = async (u) => {
    if (!u?.id || String(u.id) === String(uid)) return;
    try {
      const { data } = await api.post('/messenger/direct', { peer_user_id: u.id });
      if (data?.id) {
        openMessengerGroupChat({
          id: data.id,
          name: data.display_name || u.full_name,
          display_name: data.display_name || u.full_name,
          is_direct: true,
          peer_id: data.peer_id || u.id,
          peer_avatar: data.peer_avatar || u.avatar || null,
        });
      }
      closeDock();
    } catch (e) {
      alert(e.response?.data?.error || 'Không mở được chat 1-1');
    }
  };

  const onDockItemClick = (item) => {
    if (item.rawGroup) {
      onDockShortcutClick(item.rawGroup);
      return;
    }
    if (item.rawWindow) {
      toggleMinimize(item.rawWindow.windowKey);
    }
  };

  const onDockShortcutClick = (g) => {
    if (!g?.id) return;
    openMessengerGroupChat({
      id: g.id,
      name: g.name || g.raw_name,
      is_direct: !!g.is_direct,
      peer_id: g.peer_id || null,
      peer_avatar: g.peer_avatar || null,
      avatar: g.avatar || null,
    });
  };

  const onDockItemPin = (item, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    const gid = item.groupId ?? item.rawGroup?.id ?? item.rawWindow?.groupId;
    if (!gid) return;
    void toggleGroupPin(gid, pinnedGroupIdSet.has(String(gid)), e);
  };

  const dockShortcutIdSet = useMemo(
    () => new Set(dockShortcuts.map((g) => String(g.id))),
    [dockShortcuts],
  );

  const dockWindowIcons = useMemo(
    () =>
      windows.filter((w) => {
        if (w.chatType === 'messenger_group' && w.groupId) {
          return !dockShortcutIdSet.has(String(w.groupId));
        }
        return true;
      }),
    [windows, dockShortcutIdSet],
  );

  /** Danh sách chuẩn hóa cho quick-chat dock — sắp xếp để tin mới đẩy avatar lên đầu (tối đa 8 trên thanh) */
  const dockItems = useMemo(() => {
    const pinSet = new Set(pinnedGroupIds.map(String));
    const items = [];

    for (const g of groups) {
      const title = g.name || g.raw_name || (g.is_direct ? 'Chat 1-1' : 'Nhóm');
      items.push({
        key: `g-${g.id}`,
        kind: g.is_direct ? 'direct' : 'group',
        title,
        avatar: g.is_direct ? g.peer_avatar : g.avatar,
        peerId: g.is_direct ? g.peer_id : null,
        groupId: g.id,
        unread: unreadByGroupId[g.id] || 0,
        pinned: pinSet.has(String(g.id)),
        department: g.is_direct ? null : 'Nhóm chat nội bộ',
        lastMessageAt: g.last_message_at || g.created_at || null,
        lastPreview: normalizeMessengerPreviewText(g.last_message) || '',
        rawGroup: { ...g, pinned: pinSet.has(String(g.id)) },
      });
    }

    for (const w of dockWindowIcons) {
      const n =
        w.chatType === 'messenger_group' && w.groupId
          ? unreadByGroupId[w.groupId] || 0
          : w.chatType === 'department' && w.deptId
            ? unreadByDeptId[w.deptId] || 0
            : w.leadId
              ? unreadByLeadId[w.leadId] || 0
              : 0;
      items.push({
        key: w.windowKey,
        kind: w.chatType === 'department' ? 'department' : w.chatType === 'messenger_group' ? (w.isDirect ? 'direct' : 'group') : 'window',
        title: w.title || w.code || 'Chat',
        avatar: w.avatar || (w.groupId ? groupAvatarById.get(String(w.groupId)) : null),
        peerId: w.peerUserId || (w.groupId ? groupPeerById.get(String(w.groupId)) : null),
        groupId: w.chatType === 'messenger_group' ? w.groupId : null,
        unread: n,
        pinned: w.groupId ? pinSet.has(String(w.groupId)) : false,
        department: w.chatType === 'department' ? 'Phòng ban' : w.chatType === 'lead' ? 'Lead / CRM' : null,
        color: w.color || null,
        lastMessageAt: w.lastMessageAt || w.updatedAt || null,
        lastPreview: w.groupId ? normalizeMessengerPreviewText(groups.find((g) => String(g.id) === String(w.groupId))?.last_message) || '' : '',
        rawWindow: w,
      });
    }

    return items.sort(compareDockItems);
  }, [groups, pinnedGroupIds, dockWindowIcons, unreadByGroupId, unreadByDeptId, unreadByLeadId, groupAvatarById, groupPeerById]);

  const filteredPanelItems = useMemo(() => {
    const f = panelSearch.trim().toLowerCase();
    let list = dockItems;
    if (f) list = list.filter((item) => item.title.toLowerCase().includes(f));
    if (onlineOnly) {
      list = list.filter((item) => {
        if (!item.peerId) return item.kind === 'group';
        return !!getUserPresence(presenceByUser, item.peerId)?.online;
      });
    }
    return list;
  }, [dockItems, panelSearch, onlineOnly, presenceByUser]);

  const recentConversations = useMemo(
    () => filteredPanelItems.filter((item) => item.kind === 'direct' || item.kind === 'window' || item.kind === 'department'),
    [filteredPanelItems],
  );

  const groupConversations = useMemo(
    () => filteredPanelItems.filter((item) => item.kind === 'group'),
    [filteredPanelItems],
  );

  const activeKeys = useMemo(() => {
    const keys = new Set();
    windows.forEach((w) => {
      if (!w.minimized) keys.add(w.windowKey);
      if (w.chatType === 'messenger_group' && w.groupId && !w.minimized) {
        keys.add(`g-${w.groupId}`);
      }
    });
    return keys;
  }, [windows]);

  if (!user) return null;

  const totalUnread =
    Object.values(unreadByLeadId || {}).reduce((a, b) => a + (Number(b) || 0), 0) +
    Object.values(unreadByGroupId || {}).reduce((a, b) => a + (Number(b) || 0), 0) +
    Object.values(unreadByDeptId || {}).reduce((a, b) => a + (Number(b) || 0), 0);

  const ui = (
    <>
      {expanded.map((w, i) => {
        const bubbleLayout = computeBubbleLayout(i, viewport, dockExpanded);
        const peerForHeader =
          w.peerUserId || (w.groupId ? groupPeerById.get(String(w.groupId)) : null);
        const peerPresence = peerForHeader ? getUserPresence(presenceByUser, peerForHeader) : null;
        const showPeerDot = w.chatType !== 'department' && (w.isDirect || peerForHeader);
        const peerOnline = showPeerDot ? !!peerPresence?.online : false;
        const windowAvatar =
          w.avatar || (w.groupId ? groupAvatarById.get(String(w.groupId)) : null) || null;
        const headerGradient =
          w.chatType === 'department' && w.color
            ? `linear-gradient(135deg, ${w.color}, ${w.color}cc)`
            : w.chatType === 'lead'
              ? 'linear-gradient(135deg, #6366f1, #a855f7)'
              : bubbleGradientFor(w.title || w.code);
        return (
        <div
          key={w.windowKey}
          className="fixed flex flex-col rounded-2xl border border-white/40 bg-white/95 backdrop-blur-xl shadow-2xl overflow-hidden ring-1 ring-black/5 transition-all"
          style={{
            zIndex: Z_BUBBLE,
            width: BUBBLE_W,
            height: bubbleLayout.height,
            right: bubbleLayout.right,
            bottom: bubbleLayout.bottom,
          }}
        >
          {/* HEADER — gradient + glass overlay tạo cảm giác chiều sâu */}
          <div
            className="relative shrink-0 flex items-center gap-2.5 px-3 py-2.5 text-white overflow-hidden"
            style={{ background: headerGradient }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-black/10 pointer-events-none" />
            {w.chatType === 'department' ? (
              <div className="relative w-9 h-9 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center shrink-0 ring-2 ring-white/40 shadow-md">
                <Building2 className="h-4 w-4" />
                {showPeerDot ? (
                  <OnlineStatusDot presence={peerPresence} size="md" className="absolute -bottom-0.5 -right-0.5" />
                ) : null}
              </div>
            ) : (
              <DockAvatar
                src={windowAvatar}
                name={w.title || w.code}
                size="header"
                ringClass="ring-2 ring-white/40 shadow-md"
                maxInitials={1}
              >
                {showPeerDot ? (
                  <OnlineStatusDot presence={peerPresence} size="md" className="absolute -bottom-0.5 -right-0.5" />
                ) : null}
              </DockAvatar>
            )}
            <div className="relative flex-1 min-w-0">
              <p className="text-[13px] font-bold truncate drop-shadow-sm">{w.title}</p>
              {w.chatType === 'lead' && w.code ? (
                <p className="text-[10px] text-white/90 truncate font-medium">{w.code}</p>
              ) : w.chatType === 'department' ? (
                <p className="text-[10px] text-white/85 truncate flex items-center gap-1"><Building2 className="h-2.5 w-2.5" /> Chat phòng ban</p>
              ) : w.chatType === 'messenger_group' ? (
                <p className="text-[10px] text-white/90 truncate flex items-center gap-1">
                  {showPeerDot ? (
                    <>
                      <span className={`w-1.5 h-1.5 rounded-full ${peerOnline ? 'bg-emerald-300' : 'bg-white/50'}`} />
                      {formatChatHeaderPresenceLabel(peerPresence)}
                    </>
                  ) : (
                    <><Users className="h-2.5 w-2.5" /> Nhóm chat nội bộ</>
                  )}
                </p>
              ) : null}
            </div>
            <div className="relative flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => toggleMinimize(w.windowKey)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition"
                title="Thu nhỏ"
              >
                <Minus className="h-4 w-4" />
              </button>
              {w.chatType === 'lead' && w.leadId ? (
                <Link
                  to={`/crm/leads/${w.leadId}?tab=comments`}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition"
                  title="Mở Lead / Deal (CRM)"
                >
                  <Maximize2 className="h-4 w-4" />
                </Link>
              ) : w.chatType === 'department' && w.deptId ? (
                <Link
                  to={`/departments/${w.deptId}/chat`}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition"
                  title="Mở trang Chat phòng ban"
                >
                  <Maximize2 className="h-4 w-4" />
                </Link>
              ) : w.chatType === 'messenger_group' && w.groupId ? (
                <>
                  <button
                    type="button"
                    onClick={(e) =>
                      void toggleGroupPin(w.groupId, pinnedGroupIdSet.has(String(w.groupId)), e)
                    }
                    className={`p-1.5 rounded-lg transition ${
                      pinnedGroupIdSet.has(String(w.groupId))
                        ? 'bg-white/25 text-amber-200 hover:bg-white/30'
                        : 'hover:bg-white/20'
                    }`}
                    title={
                      pinnedGroupIdSet.has(String(w.groupId))
                        ? 'Bỏ ghim trên thanh chat nhanh'
                        : 'Ghim lên thanh chat nhanh'
                    }
                  >
                    <Pin
                      className={`h-4 w-4 ${pinnedGroupIdSet.has(String(w.groupId)) ? 'fill-current' : ''}`}
                    />
                  </button>
                  <Link
                    to={`/crm/messenger?openGroup=${encodeURIComponent(w.groupId)}`}
                    className="p-1.5 rounded-lg hover:bg-white/20 transition"
                    title={w.isDirect ? 'Mở chat 1-1 trong trang Nhóm chat' : 'Mở nhóm chat trong trang Nhóm chat'}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <Link
                  to="/crm/messenger"
                  className="p-1.5 rounded-lg hover:bg-white/20 transition"
                  title="Mở trang Nhóm chat"
                >
                  <Maximize2 className="h-4 w-4" />
                </Link>
              )}
              <button
                type="button"
                onClick={() => closeWindow(w.windowKey)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition"
                title="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex flex-col bg-gradient-to-b from-slate-50/80 to-white/60">
            {w.chatType === 'messenger_group' && w.groupId ? (
              <MessengerGroupChatTab groupId={w.groupId} socket={socket} fillParent compact groupTitle={w.title || ''} />
            ) : w.chatType === 'department' && w.deptId ? (
              <DepartmentChatBubble deptId={w.deptId} socket={socket} fillParent />
            ) : w.leadId ? (
              <LeadChatTab leadId={w.leadId} socket={socket} fillParent compact />
            ) : null}
          </div>
        </div>
        );
      })}

      <MessengerQuickChatDock
        publicFileUrl={publicFileUrl}
        expanded={dockExpanded}
        onToggleExpanded={toggleDockExpanded}
        onClose={closeDock}
        items={dockItems}
        groupsLoading={groupsLoading}
        presenceByUser={presenceByUser}
        activeKeys={activeKeys}
        totalUnread={totalUnread}
        panelSearch={panelSearch}
        onPanelSearchChange={setPanelSearch}
        onlineOnly={onlineOnly}
        onOnlineOnlyChange={setOnlineOnly}
        staffRows={staffRows}
        staffLoading={staffLoading}
        recentConversations={recentConversations}
        groupConversations={groupConversations}
        onItemClick={onDockItemClick}
        onTogglePin={onDockItemPin}
        onPickStaff={onPickStaff}
        uid={uid}
        panelRef={panelRef}
        dockRef={dockRef}
      />
    </>
  );

  return createPortal(ui, document.body);
}
