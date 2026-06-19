import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import { LeadChatTab, MessengerGroupChatTab } from './LeadChatTabs';
import DepartmentChatBubble from './DepartmentChatBubble';
import { MessageCircle, X, Minus, Maximize2, Search, Users, Loader2, ChevronRight, Building2, User, UserPlus, Pin } from 'lucide-react';
import api from '../lib/api';
import { publicFileUrl } from '../lib/publicFileUrl';
import OnlineStatusDot, { getUserPresence } from './OnlineStatusDot';
import { usePresence } from '../shared/context/PresenceContext';
import {
  formatChatHeaderPresenceLabel,
  formatLastActiveShort,
} from '../lib/userPresenceDisplay';
import { useRelativeTimeTick } from '../hooks/useRelativeTimeTick';

export const MESSENGER_DOCK_W = 52;
const BUBBLE_W = 340;
const BUBBLE_GAP = 14;
const DOCK_W = MESSENGER_DOCK_W;
const LAUNCHER_W = 300;
/** Trên layout CRM (main z-10); dưới modal toàn trang (vd. z-220) nhờ createPortal ra document.body */
const Z_BUBBLE = 100;
const Z_LAUNCHER = 110;
const Z_DOCK = 120;
/** Thanh dock neo sát mép phải, trên cùng viewport */
const DOCK_TOP_PX = 12;
const DOCK_MAX_SHORTCUTS = 15;

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
  } = useMessengerDock();
  const [launcherOpen, setLauncherOpen] = useState(false);
  /** 'direct' | 'group' — mở launcher theo mục menu chat */
  const [launcherMode, setLauncherMode] = useState(null);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [pinnedGroupIds, setPinnedGroupIds] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [staffQ, setStaffQ] = useState('');
  const [staffRows, setStaffRows] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [groupFilter, setGroupFilter] = useState('');

  const launcherRef = useRef(null);
  const dockBarRef = useRef(null);
  const quickMenuRef = useRef(null);

  useEffect(() => {
    if (!launcherOpen && !quickMenuOpen) return;
    const onDown = (e) => {
      const t = e.target;
      if (
        launcherRef.current?.contains(t) ||
        dockBarRef.current?.contains(t) ||
        quickMenuRef.current?.contains(t)
      ) {
        return;
      }
      setLauncherOpen(false);
      setQuickMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [launcherOpen, quickMenuOpen]);

  const openLauncher = useCallback((mode) => {
    setLauncherMode(mode);
    setQuickMenuOpen(false);
    setLauncherOpen(true);
  }, []);

  const closeLauncher = useCallback(() => {
    setLauncherOpen(false);
    setLauncherMode(null);
    setStaffQ('');
    setStaffRows([]);
    setGroupFilter('');
  }, []);

  const loadDockData = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const [{ data: apiList }, { data: pinPayload }] = await Promise.all([
        api.get('/messenger/groups'),
        api.get('/messenger/pins').catch(() => ({ data: { group_ids: [] } })),
      ]);
      setGroups(Array.isArray(apiList) ? apiList : []);
      setPinnedGroupIds(Array.isArray(pinPayload?.group_ids) ? pinPayload.group_ids : []);
    } catch {
      setGroups([]);
      setPinnedGroupIds([]);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadDockData();
  }, [user, loadDockData]);

  useEffect(() => {
    if (!launcherOpen) return;
    void loadDockData();
  }, [launcherOpen, loadDockData]);

  const expanded = useMemo(() => windows.filter((w) => !w.minimized), [windows]);

  useEffect(() => {
    const q = staffQ.trim();
    if (!launcherOpen) {
      setStaffRows([]);
      return;
    }
    if (!q) {
      setStaffRows([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setStaffLoading(true);
      try {
        const { data } = await api.get('/users', { params: { search: q } });
        const users = data?.users || [];
        if (!cancelled) setStaffRows(Array.isArray(users) ? users.slice(0, 14) : []);
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
  }, [staffQ, launcherOpen]);

  const filteredGroups = useMemo(() => {
    const f = groupFilter.trim().toLowerCase();
    let list = groups;
    if (launcherMode === 'group') list = list.filter((g) => !g.is_direct);
    else if (launcherMode === 'direct') list = list.filter((g) => g.is_direct);
    if (!f) return list;
    return list.filter((g) => {
      const n = (g.name || '').toLowerCase();
      const r = (g.raw_name || '').toLowerCase();
      return n.includes(f) || r.includes(f);
    });
  }, [groups, groupFilter, launcherMode]);

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

  const toggleGroupPin = useCallback(async (groupId, currentlyPinned, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    const next = !currentlyPinned;
    try {
      await api.put(`/messenger/pins/${groupId}`, { pinned: next });
      setPinnedGroupIds((prev) => {
        const id = String(groupId);
        if (next) return prev.some((x) => String(x) === id) ? prev : [...prev, groupId];
        return prev.filter((x) => String(x) !== id);
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Không ghim được hội thoại');
    }
  }, []);

  const groupAvatarById = useMemo(() => {
    const m = new Map();
    for (const g of groups) {
      if (g?.id && g.peer_avatar) m.set(String(g.id), g.peer_avatar);
    }
    return m;
  }, [groups]);

  const uid = user?.userId || user?.id;

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
      closeLauncher();
    } catch (e) {
      alert(e.response?.data?.error || 'Không mở được chat 1-1');
    }
  };

  const onPickGroup = (g) => {
    if (!g?.id) return;
    openMessengerGroupChat({
      id: g.id,
      name: g.name || g.raw_name,
      is_direct: !!g.is_direct,
      peer_id: g.peer_id || null,
      peer_avatar: g.peer_avatar || null,
      avatar: g.avatar || null,
    });
    closeLauncher();
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

  if (!user) return null;

  const totalUnread =
    Object.values(unreadByLeadId || {}).reduce((a, b) => a + (Number(b) || 0), 0) +
    Object.values(unreadByGroupId || {}).reduce((a, b) => a + (Number(b) || 0), 0) +
    Object.values(unreadByDeptId || {}).reduce((a, b) => a + (Number(b) || 0), 0);

  const ui = (
    <>
      {expanded.map((w, i) => {
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
            height: 'min(520px, calc(100vh - 32px))',
            right: DOCK_W + BUBBLE_GAP + i * (BUBBLE_W + BUBBLE_GAP),
            bottom: 16,
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

      {launcherOpen ? (
        <div
          ref={launcherRef}
          className="fixed flex flex-col rounded-l-2xl border border-white/40 bg-white/85 backdrop-blur-2xl shadow-2xl overflow-hidden ring-1 ring-black/5"
          style={{
            zIndex: Z_LAUNCHER,
            width: LAUNCHER_W,
            maxHeight: 'min(72vh, 580px)',
            right: DOCK_W,
            top: DOCK_TOP_PX,
          }}
        >
          {/* Header hero */}
          <div className="shrink-0 relative px-3.5 py-3 border-b border-white/40 bg-gradient-to-br from-sky-500/95 via-cyan-500/95 to-violet-500/95 text-white overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-black/10 pointer-events-none" />
            <div className="relative flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-white/25 backdrop-blur ring-2 ring-white/40 flex items-center justify-center shadow">
                  {launcherMode === 'group' ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-xs font-bold drop-shadow-sm">
                    {launcherMode === 'group' ? 'Nhóm chat' : 'Chat 1-1'}
                  </p>
                  <p className="text-[10px] text-white/85">
                    {launcherMode === 'group' ? 'Chọn nhóm hoặc tạo mới' : 'Tìm nhân viên hoặc hội thoại gần đây'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  to="/crm/messenger"
                  className="text-[10px] font-semibold text-white px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur transition"
                  onClick={() => closeLauncher()}
                >
                  Trang đầy đủ
                </Link>
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-white hover:bg-white/20 transition"
                  title="Đóng"
                  onClick={() => closeLauncher()}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4 [scrollbar-width:thin]">
            {(launcherMode === 'direct' || launcherMode === null) && (
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                <Search className="h-3 w-3" /> Tìm nhân viên
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={staffQ}
                  onChange={(e) => setStaffQ(e.target.value)}
                  placeholder="Tên, email…"
                  className="w-full text-sm border border-white/60 bg-white/70 backdrop-blur rounded-xl pl-8 pr-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300/70 focus:bg-white shadow-sm transition"
                />
              </div>
              {staffLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tìm…
                </div>
              ) : staffRows.length ? (
                <ul className="mt-1.5 space-y-0.5 border border-white/60 bg-white/55 backdrop-blur rounded-xl max-h-40 overflow-y-auto p-1 [scrollbar-width:thin]">
                  {staffRows.map((u) => {
                    const pres = getUserPresence(presenceByUser, u.id);
                    const online = !!pres?.online;
                    return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => void onPickStaff(u)}
                        disabled={String(u.id) === String(uid)}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-sky-50 rounded-lg disabled:opacity-40 flex items-center gap-2 transition"
                      >
                        <DockAvatar src={u.avatar} name={u.full_name || u.email} size="sm">
                          <OnlineStatusDot presence={pres} className="absolute -bottom-0.5 -right-0.5" />
                        </DockAvatar>
                        <span className="truncate flex-1 min-w-0">
                          <span className="font-semibold text-slate-800 block truncate">{u.full_name || u.email}</span>
                          {u.email && u.full_name ? (
                            <span className="block text-[10px] text-slate-500 truncate">{u.email}</span>
                          ) : null}
                          {!online && (
                            <span className="block text-[10px] text-slate-400 truncate">
                              {formatLastActiveShort(pres?.last_ping_at)}
                            </span>
                          )}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </button>
                    </li>
                    );
                  })}
                </ul>
              ) : staffQ.trim() ? (
                <p className="text-[11px] text-slate-400 py-1.5 text-center">Không có kết quả</p>
              ) : null}
            </div>
            )}

            {(launcherMode === 'group' || launcherMode === 'direct' || launcherMode === null) && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <Users className="h-3 w-3" />
                  {launcherMode === 'direct'
                    ? 'Hội thoại gần đây'
                    : launcherMode === 'group'
                      ? 'Nhóm của tôi'
                      : 'Nhóm & hội thoại'}
                </label>
                {launcherMode === 'group' && (
                  <Link
                    to="/crm/messenger"
                    className="text-[10px] font-semibold text-sky-600 hover:text-sky-800 hover:underline shrink-0 inline-flex items-center gap-0.5"
                    onClick={() => closeLauncher()}
                  >
                    <UserPlus className="h-3 w-3" /> Tạo nhóm
                  </Link>
                )}
              </div>
              <input
                type="search"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                placeholder={launcherMode === 'direct' ? 'Lọc tên người…' : 'Lọc tên nhóm…'}
                className="w-full text-sm border border-white/60 bg-white/70 backdrop-blur rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300/70 focus:bg-white shadow-sm mb-1.5 transition"
              />
              {groupsLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải nhóm…
                </div>
              ) : filteredGroups.length ? (
                <ul className="space-y-0.5 border border-white/60 bg-white/55 backdrop-blur rounded-xl max-h-52 overflow-y-auto p-1 [scrollbar-width:thin]">
                  {filteredGroups.map((g) => {
                    const n = unreadByGroupId[g.id] || 0;
                    const peerPresence = g.is_direct && g.peer_id ? getUserPresence(presenceByUser, g.peer_id) : null;
                    const peerOnline = !!peerPresence?.online;
                    const isPinned = pinnedGroupIds.some((id) => String(id) === String(g.id));
                    return (
                      <li key={g.id}>
                        <div className="flex items-center gap-0.5 group/row">
                          <button
                            type="button"
                            onClick={() => onPickGroup(g)}
                            className="flex-1 min-w-0 text-left px-2 py-1.5 text-xs hover:bg-cyan-50 rounded-lg flex items-center justify-between gap-2 transition"
                          >
                            <span className="flex items-center gap-2 min-w-0 flex-1">
                              <DockAvatar
                                src={g.is_direct ? g.peer_avatar : g.avatar}
                                name={g.name || g.raw_name}
                                size="sm"
                              >
                                {g.is_direct && g.peer_id ? (
                                  <OnlineStatusDot presence={peerPresence} size="md" className="absolute -bottom-0.5 -right-0.5" />
                                ) : null}
                              </DockAvatar>
                              <span className="min-w-0 flex-1">
                                <span className="truncate font-semibold text-slate-800 block flex items-center gap-1">
                                  {isPinned ? <Pin className="h-2.5 w-2.5 text-amber-500 fill-amber-500 shrink-0" /> : null}
                                  {g.name || 'Nhóm'}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {g.is_direct
                                    ? (peerOnline ? 'Đang hoạt động' : formatLastActiveShort(peerPresence?.last_ping_at))
                                    : 'Nhóm chat'}
                                </span>
                              </span>
                            </span>
                            {n > 0 ? (
                              <span className="shrink-0 min-w-[20px] h-[20px] px-1.5 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                                {n > 99 ? '…' : n}
                              </span>
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover/row:text-sky-600 transition" />
                            )}
                          </button>
                          <button
                            type="button"
                            title={isPinned ? 'Bỏ ghim' : 'Ghim lên dock'}
                            onClick={(e) => void toggleGroupPin(g.id, isPinned, e)}
                            className={`shrink-0 p-1 rounded-lg transition ${
                              isPinned ? 'text-amber-500' : 'text-slate-300 opacity-0 group-hover/row:opacity-100 hover:text-amber-500'
                            }`}
                          >
                            <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-amber-500' : ''}`} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-400 py-1.5 text-center">
                  {launcherMode === 'direct'
                    ? 'Chưa có hội thoại 1-1'
                    : launcherMode === 'group'
                      ? 'Chưa có nhóm hoặc không khớp lọc'
                      : 'Chưa có nhóm hoặc không khớp lọc'}
                </p>
              )}
            </div>
            )}
          </div>
        </div>
      ) : null}

      {quickMenuOpen && !launcherOpen ? (
        <div
          ref={quickMenuRef}
          className="fixed flex flex-col gap-1 p-1.5 rounded-l-2xl border border-white/50 bg-white/90 shadow-xl backdrop-blur-xl ring-1 ring-black/5 min-w-[148px]"
          style={{ zIndex: Z_LAUNCHER, right: DOCK_W + 4, top: DOCK_TOP_PX }}
        >
          <p className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Menu chat</p>
          <button
            type="button"
            onClick={() => openLauncher('direct')}
            className="flex items-center gap-2 w-full text-left px-2.5 py-2 text-xs font-semibold text-slate-800 rounded-xl hover:bg-sky-50 transition"
          >
            <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 text-white flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5" />
            </span>
            Chat 1-1
          </button>
          <button
            type="button"
            onClick={() => openLauncher('group')}
            className="flex items-center gap-2 w-full text-left px-2.5 py-2 text-xs font-semibold text-slate-800 rounded-xl hover:bg-violet-50 transition"
          >
            <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 text-white flex items-center justify-center shrink-0">
              <Users className="h-3.5 w-3.5" />
            </span>
            Nhóm chat
          </button>
          <Link
            to="/crm/messenger"
            className="flex items-center gap-2 w-full text-left px-2.5 py-2 text-xs font-medium text-slate-600 rounded-xl hover:bg-slate-50 transition border-t border-slate-100 mt-0.5 pt-2"
            onClick={() => setQuickMenuOpen(false)}
          >
            <MessageCircle className="h-3.5 w-3.5 text-sky-500 shrink-0" />
            Trang chat đầy đủ
          </Link>
        </div>
      ) : null}

      <div
        ref={dockBarRef}
        className="group/dock fixed flex flex-col items-center gap-1.5 py-2 px-1.5 rounded-l-2xl border border-white/50 bg-white/75 shadow-xl backdrop-blur-xl ring-1 ring-black/5 max-h-[calc(100vh-24px)] overflow-y-auto [scrollbar-width:thin] opacity-30 hover:opacity-100 transition-opacity duration-200"
        style={{ zIndex: Z_DOCK, right: 0, top: DOCK_TOP_PX, width: DOCK_W }}
      >
        <button
          type="button"
          onClick={() => {
            if (launcherOpen) {
              closeLauncher();
              return;
            }
            setQuickMenuOpen((v) => !v);
          }}
          className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shadow-md transition-all shrink-0 ${
            launcherOpen || quickMenuOpen
              ? 'bg-slate-800 text-white ring-2 ring-sky-400 scale-95 opacity-100'
              : 'bg-gradient-to-br from-sky-500 via-cyan-500 to-violet-500 text-white hover:scale-105 hover:shadow-lg ring-2 ring-white/60'
          }`}
          title={launcherOpen || quickMenuOpen ? 'Đóng menu chat' : 'Menu chat — 1-1 & nhóm'}
        >
          <MessageCircle className="h-5 w-5" />
          {!launcherOpen && !quickMenuOpen && totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>

        {(dockShortcuts.length > 0 || groupsLoading) && (
          <div className="w-7 border-t border-slate-300/60 my-0.5 shrink-0" />
        )}

        {groupsLoading && dockShortcuts.length === 0 ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
        ) : null}

        {dockShortcuts.map((g) => {
          const n = unreadByGroupId[g.id] || 0;
          const peerId = g.is_direct ? g.peer_id : null;
          const peerPresence = peerId ? getUserPresence(presenceByUser, peerId) : null;
          const openWin = windows.find(
            (w) => w.chatType === 'messenger_group' && String(w.groupId) === String(g.id),
          );
          const isActive = openWin && !openWin.minimized;
          const avatarSrc = g.is_direct ? g.peer_avatar : g.avatar;
          const title = g.name || g.raw_name || (g.is_direct ? 'Chat 1-1' : 'Nhóm');

          return (
            <div key={g.id} className="relative shrink-0">
              <button
                type="button"
                title={
                  g.pinned
                    ? `${title} — Chuột phải để bỏ ghim`
                    : `${title} — Chuột phải để ghim`
                }
                onClick={() => onDockShortcutClick(g)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void toggleGroupPin(g.id, g.pinned, e);
                }}
                className={`relative block transition-all hover:scale-110 hover:shadow-md ${
                  isActive ? 'ring-2 ring-sky-400 rounded-xl scale-105' : ''
                }`}
              >
                {g.is_direct ? (
                  <DockAvatar
                    src={avatarSrc}
                    name={title}
                    size="dock"
                    ringClass={`ring-2 shadow-sm ${g.pinned ? 'ring-amber-400/80' : 'ring-white/60'}`}
                    maxInitials={2}
                  >
                    {peerId ? (
                      <OnlineStatusDot
                        presence={peerPresence}
                        size="md"
                        className="absolute -bottom-0.5 -right-0.5"
                      />
                    ) : null}
                  </DockAvatar>
                ) : avatarSrc ? (
                  <DockAvatar
                    src={avatarSrc}
                    name={title}
                    size="dock"
                    ringClass={`ring-2 shadow-sm ${g.pinned ? 'ring-amber-400/80' : 'ring-white/60'}`}
                    maxInitials={2}
                  />
                ) : (
                  <span
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm ring-2 ${
                      g.pinned ? 'ring-amber-400/80' : 'ring-white/60'
                    }`}
                    style={{ background: bubbleGradientFor(title) }}
                  >
                    <Users className="h-4 w-4" />
                  </span>
                )}
                {g.pinned ? (
                  <span className="absolute -top-0.5 -left-0.5 h-3.5 w-3.5 rounded-full bg-amber-400 flex items-center justify-center ring-1 ring-white shadow">
                    <Pin className="h-2 w-2 text-white fill-white" />
                  </span>
                ) : null}
                {n > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-white text-[9px] font-bold flex items-center justify-center border border-white shadow">
                    {n > 99 ? '…' : n}
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );

  return createPortal(ui, document.body);
}
