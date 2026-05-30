import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import { LeadChatTab, MessengerGroupChatTab } from './LeadChatTabs';
import DepartmentChatBubble from './DepartmentChatBubble';
import { MessageCircle, X, Minus, Maximize2, Search, Users, Loader2, ChevronRight, Building2 } from 'lucide-react';
import api from '../lib/api';
import { publicFileUrl } from '../lib/publicFileUrl';
import OnlineStatusDot, { isUserOnline } from './OnlineStatusDot';
import { usePresence } from '../shared/context/PresenceContext';

export const MESSENGER_DOCK_W = 52;
const BUBBLE_W = 340;
const BUBBLE_GAP = 14;
const DOCK_W = MESSENGER_DOCK_W;
const LAUNCHER_W = 300;
/** Trên layout CRM (main z-10); dưới modal toàn trang (vd. z-220) nhờ createPortal ra document.body */
const Z_BUBBLE = 100;
const Z_LAUNCHER = 110;
const Z_DOCK = 120;
const Z_TOAST = 125;
const TOAST_W = 280;
const TOAST_GAP = 10;

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
    chatToasts,
    dismissChatToast,
  } = useMessengerDock();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [staffQ, setStaffQ] = useState('');
  const [staffRows, setStaffRows] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [groupFilter, setGroupFilter] = useState('');

  const launcherRef = useRef(null);
  const dockBarRef = useRef(null);

  useEffect(() => {
    if (!launcherOpen) return;
    const onDown = (e) => {
      const t = e.target;
      if (launcherRef.current?.contains(t) || dockBarRef.current?.contains(t)) return;
      setLauncherOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [launcherOpen]);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const { data } = await api.get('/messenger/groups');
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!launcherOpen && !windows.some((w) => w.chatType === 'messenger_group')) return;
    void loadGroups();
  }, [launcherOpen, loadGroups, windows]);

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
    if (!f) return groups;
    return groups.filter((g) => {
      const n = (g.name || '').toLowerCase();
      const r = (g.raw_name || '').toLowerCase();
      return n.includes(f) || r.includes(f);
    });
  }, [groups, groupFilter]);

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
    windows.forEach((w) => {
      if (w.peerUserId) ids.add(String(w.peerUserId));
      else if (w.groupId && groupPeerById.has(String(w.groupId))) {
        ids.add(groupPeerById.get(String(w.groupId)));
      }
    });
    (chatToasts || []).forEach((t) => {
      if (t.sender?.id) ids.add(String(t.sender.id));
    });
    return [...ids];
  }, [staffRows, groups, windows, chatToasts, groupPeerById]);

  const presenceByUser = usePresence(presenceUserIds, { enabled: !!uid });

  const onPickStaff = async (u) => {
    if (!u?.id || String(u.id) === String(uid)) return;
    try {
      const { data } = await api.post('/messenger/direct', { peer_user_id: u.id });
      if (data?.id) {
        openMessengerGroupChat({
          id: data.id,
          name: data.name || data.display_name || u.full_name,
          is_direct: true,
          peer_id: u.id,
          peer_avatar: u.avatar || null,
        });
      }
      setLauncherOpen(false);
      setStaffQ('');
      setStaffRows([]);
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
    });
    setLauncherOpen(false);
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
        const showPeerDot = w.chatType !== 'department' && (w.isDirect || peerForHeader);
        const peerOnline = showPeerDot ? isUserOnline(presenceByUser, peerForHeader) : false;
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
            height: 480,
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
                  <OnlineStatusDot online={peerOnline} size="md" className="absolute -bottom-0.5 -right-0.5" />
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
                  <OnlineStatusDot online={peerOnline} size="md" className="absolute -bottom-0.5 -right-0.5" />
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
                      {peerOnline ? 'Đang hoạt động' : 'Offline'}
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
                  to={`/crm/leads/${w.leadId}?tab=chat`}
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
              <MessengerGroupChatTab groupId={w.groupId} socket={socket} fillParent />
            ) : w.chatType === 'department' && w.deptId ? (
              <DepartmentChatBubble deptId={w.deptId} socket={socket} fillParent />
            ) : w.leadId ? (
              <LeadChatTab leadId={w.leadId} socket={socket} fillParent />
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
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          {/* Header hero */}
          <div className="shrink-0 relative px-3.5 py-3 border-b border-white/40 bg-gradient-to-br from-sky-500/95 via-cyan-500/95 to-violet-500/95 text-white overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-black/10 pointer-events-none" />
            <div className="relative flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-white/25 backdrop-blur ring-2 ring-white/40 flex items-center justify-center shadow">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold drop-shadow-sm">Chat nhanh</p>
                  <p className="text-[10px] text-white/85">Tìm NV hoặc chọn nhóm</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  to="/crm/messenger"
                  className="text-[10px] font-semibold text-white px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur transition"
                  onClick={() => setLauncherOpen(false)}
                >
                  Trang đầy đủ
                </Link>
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-white hover:bg-white/20 transition"
                  title="Đóng"
                  onClick={() => setLauncherOpen(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4 [scrollbar-width:thin]">
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
                    const online = isUserOnline(presenceByUser, u.id);
                    return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => void onPickStaff(u)}
                        disabled={String(u.id) === String(uid)}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-sky-50 rounded-lg disabled:opacity-40 flex items-center gap-2 transition"
                      >
                        <DockAvatar src={u.avatar} name={u.full_name || u.email} size="sm">
                          <OnlineStatusDot online={online} className="absolute -bottom-0.5 -right-0.5" />
                        </DockAvatar>
                        <span className="truncate flex-1 min-w-0">
                          <span className="font-semibold text-slate-800 block truncate">{u.full_name || u.email}</span>
                          {u.email && u.full_name ? (
                            <span className="block text-[10px] text-slate-500 truncate">{u.email}</span>
                          ) : null}
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

            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                <Users className="h-3 w-3" /> Nhóm của tôi
              </label>
              <input
                type="search"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                placeholder="Lọc tên nhóm…"
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
                    const peerOnline = g.is_direct && g.peer_id ? isUserOnline(presenceByUser, g.peer_id) : false;
                    return (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => onPickGroup(g)}
                          className="w-full text-left px-2 py-1.5 text-xs hover:bg-cyan-50 rounded-lg flex items-center justify-between gap-2 transition group"
                        >
                          <span className="flex items-center gap-2 min-w-0 flex-1">
                            <DockAvatar
                              src={g.is_direct ? g.peer_avatar : null}
                              name={g.name || g.raw_name}
                              size="sm"
                            >
                              {g.is_direct && g.peer_id ? (
                                <OnlineStatusDot online={peerOnline} size="md" className="absolute -bottom-0.5 -right-0.5" />
                              ) : null}
                            </DockAvatar>
                            <span className="min-w-0 flex-1">
                              <span className="truncate font-semibold text-slate-800 block">{g.name || 'Nhóm'}</span>
                              <span className="text-[10px] text-slate-500">{g.is_direct ? 'Trực tiếp' : 'Nhóm chat'}</span>
                            </span>
                          </span>
                          {n > 0 ? (
                            <span className="shrink-0 min-w-[20px] h-[20px] px-1.5 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                              {n > 99 ? '…' : n}
                            </span>
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-sky-600 transition" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-400 py-1.5 text-center">Chưa có nhóm hoặc không khớp lọc</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast tin nhắn đến — pop từ phải sang trái, đè cạnh dock */}
      <div
        className="fixed flex flex-col gap-2 pointer-events-none"
        style={{
          zIndex: Z_TOAST,
          right: DOCK_W + TOAST_GAP,
          top: 70,
          width: TOAST_W,
        }}
      >
        {(chatToasts || []).map((t) => {
          const av = avatarUrl(t.sender?.avatar);
          const onOpen = () => {
            if (t.kind === 'group' && t.groupId) {
              openMessengerGroupChat({ id: t.groupId, name: t.title });
            } else if (t.kind === 'lead' && t.leadId) {
              openLeadChat({ id: t.leadId, title: t.title });
            } else if (t.kind === 'department' && t.deptId) {
              openDepartmentChat({ id: t.deptId, name: t.title });
            }
            dismissChatToast(t.id);
          };
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={onOpen}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}
              className="pointer-events-auto group relative flex items-start gap-2.5 px-3 py-2.5 rounded-2xl border border-white/60 bg-white/90 backdrop-blur-xl shadow-xl hover:shadow-2xl hover:border-sky-300 hover:bg-white cursor-pointer transition-all hover:-translate-x-0.5"
              title={`${t.sender?.name || ''} • ${t.title || ''}`}
            >
              <div className="shrink-0 relative">
                {av ? (
                  <img
                    src={av}
                    alt={t.sender?.name || ''}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white shadow">
                    {initialsOf(t.sender?.name)}
                  </div>
                )}
                <OnlineStatusDot
                  online={isUserOnline(presenceByUser, t.sender?.id)}
                  size="lg"
                  className="absolute -bottom-0.5 -right-0.5"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-semibold text-slate-800 truncate">{t.sender?.name || 'Ai đó'}</p>
                  <span className="text-[10px] text-slate-400 shrink-0">vừa xong</span>
                </div>
                {t.title ? (
                  <p className="text-[10px] text-slate-500 truncate">
                    {t.kind === 'group' ? 'Nhóm: ' : t.kind === 'department' ? 'Phòng ban: ' : ''}
                    {t.title}
                  </p>
                ) : null}
                <p className="text-xs text-slate-700 line-clamp-2 mt-0.5 break-words">{t.preview || '(tin nhắn mới)'}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); dismissChatToast(t.id); }}
                className="shrink-0 -mr-1 -mt-1 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition"
                title="Đóng"
                aria-label="Đóng thông báo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div
        ref={dockBarRef}
        className="fixed flex flex-col items-center gap-2 py-3 px-1.5 rounded-l-2xl border border-white/50 bg-white/75 shadow-xl backdrop-blur-xl ring-1 ring-black/5"
        style={{ zIndex: Z_DOCK, right: 0, top: '50%', transform: 'translateY(-50%)', width: DOCK_W }}
      >
        <button
          type="button"
          onClick={() => setLauncherOpen((v) => !v)}
          className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shadow-md transition-all ${
            launcherOpen
              ? 'bg-slate-800 text-white ring-2 ring-sky-400 scale-95'
              : 'bg-gradient-to-br from-sky-500 via-cyan-500 to-violet-500 text-white hover:scale-105 hover:shadow-lg ring-2 ring-white/60'
          }`}
          title={launcherOpen ? 'Đóng danh sách' : 'Tìm nhân viên & nhóm chat'}
        >
          <MessageCircle className="h-5 w-5" />
          {!launcherOpen && totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
        {windows.length > 0 && <div className="w-7 border-t border-slate-300/60 my-0.5" />}
        {windows.map((w) => {
          const n =
            w.chatType === 'messenger_group' && w.groupId
              ? unreadByGroupId[w.groupId] || 0
              : w.chatType === 'department' && w.deptId
                ? unreadByDeptId[w.deptId] || 0
                : w.leadId
                  ? unreadByLeadId[w.leadId] || 0
                  : 0;
          const peerId =
            w.peerUserId || (w.groupId ? groupPeerById.get(String(w.groupId)) : null);
          const showPeerDot = !!(w.isDirect || peerId) && w.chatType !== 'department';
          const isDept = w.chatType === 'department';
          const dockAvatar =
            w.avatar || (w.groupId ? groupAvatarById.get(String(w.groupId)) : null) || null;
          const deptBg = isDept && w.color
            ? `linear-gradient(135deg, ${w.color}, ${w.color}cc)`
            : null;
          return (
            <button
              key={w.windowKey}
              type="button"
              title={w.title}
              onClick={() => toggleMinimize(w.windowKey)}
              className={`relative transition-all ${
                w.minimized
                  ? 'opacity-50 hover:opacity-100 hover:scale-105'
                  : 'hover:scale-110 hover:shadow-md'
              }`}
            >
              {isDept ? (
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm ring-2 ring-white/60"
                  style={{ background: deptBg || bubbleGradientFor(w.title) }}
                >
                  <Building2 className="h-4 w-4" />
                </span>
              ) : (
                <DockAvatar
                  src={dockAvatar}
                  name={w.title || w.code}
                  size="dock"
                  ringClass={`ring-2 shadow-sm ${w.minimized ? 'ring-white/30' : 'ring-white/60'}`}
                  maxInitials={2}
                >
                  {showPeerDot ? (
                    <OnlineStatusDot
                      online={isUserOnline(presenceByUser, peerId)}
                      size="md"
                      className="absolute -bottom-0.5 -right-0.5"
                    />
                  ) : null}
                </DockAvatar>
              )}
              {isDept && showPeerDot ? (
                <OnlineStatusDot
                  online={isUserOnline(presenceByUser, peerId)}
                  size="md"
                  className="absolute -bottom-0.5 -right-0.5"
                />
              ) : null}
              {n > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-white text-[9px] font-bold flex items-center justify-center border border-white shadow">
                  {n > 99 ? '…' : n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );

  return createPortal(ui, document.body);
}
