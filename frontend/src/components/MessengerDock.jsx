import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import { LeadChatTab, MessengerGroupChatTab } from './LeadChatTabs';
import DepartmentChatBubble from './DepartmentChatBubble';
import { MessageCircle, X, Minus, Maximize2, Search, Users, Loader2, ChevronRight, Building2 } from 'lucide-react';
import api from '../lib/api';
import OnlineStatusDot, { isUserOnline } from './OnlineStatusDot';
import { useUserPresence } from '../hooks/useUserPresence';

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
  if (!av) return null;
  if (typeof av !== 'string') return null;
  if (av.startsWith('http://') || av.startsWith('https://') || av.startsWith('data:')) return av;
  if (av.startsWith('/')) return av;
  return `/uploads/avatars/${av}`;
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

  const presenceByUser = useUserPresence(presenceUserIds, { enabled: !!uid });

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
      {expanded.map((w, i) => (
        <div
          key={w.windowKey}
          className="fixed flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-2xl overflow-hidden ring-1 ring-black/5"
          style={{
            zIndex: Z_BUBBLE,
            width: BUBBLE_W,
            height: 460,
            right: DOCK_W + BUBBLE_GAP + i * (BUBBLE_W + BUBBLE_GAP),
            bottom: 16,
          }}
        >
          <div
            className="shrink-0 flex items-center gap-2 px-3 py-2.5 text-white"
            style={
              w.chatType === 'department' && w.color
                ? { background: `linear-gradient(135deg, ${w.color}, ${w.color}cc)` }
                : { background: 'linear-gradient(to right, #0ea5e9, #0891b2)' }
            }
          >
            <div className="relative w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">
              {w.chatType === 'department' ? (
                <Building2 className="h-4 w-4" />
              ) : (
                (w.code || w.title || '?').slice(0, 1)
              )}
              {w.chatType !== 'department' && (w.isDirect || w.peerUserId || (w.groupId && groupPeerById.has(String(w.groupId)))) ? (
                <OnlineStatusDot
                  online={isUserOnline(
                    presenceByUser,
                    w.peerUserId || groupPeerById.get(String(w.groupId)),
                  )}
                  size="md"
                  className="absolute -bottom-0.5 -right-0.5"
                />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{w.title}</p>
              {w.chatType === 'lead' && w.code ? <p className="text-[10px] text-sky-100 truncate">{w.code}</p> : null}
              {w.chatType === 'department' ? (
                <p className="text-[10px] text-white/80 truncate">Chat phòng ban</p>
              ) : null}
              {w.chatType === 'messenger_group' ? (
                <p className="text-[10px] text-sky-100 truncate flex items-center gap-1">
                  {w.isDirect || w.peerUserId || groupPeerById.has(String(w.groupId)) ? (
                    <>
                      <OnlineStatusDot
                        online={isUserOnline(
                          presenceByUser,
                          w.peerUserId || groupPeerById.get(String(w.groupId)),
                        )}
                      />
                      {isUserOnline(
                        presenceByUser,
                        w.peerUserId || groupPeerById.get(String(w.groupId)),
                      )
                        ? 'Đang online'
                        : 'Offline'}
                    </>
                  ) : (
                    'Nhóm chat nội bộ'
                  )}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => toggleMinimize(w.windowKey)}
              className="p-1.5 rounded-lg hover:bg-white/15"
              title="Thu nhỏ"
            >
              <Minus className="h-4 w-4" />
            </button>
            {w.chatType === 'lead' && w.leadId ? (
              <Link
                to={`/crm/leads/${w.leadId}?tab=chat`}
                className="p-1.5 rounded-lg hover:bg-white/15"
                title="Mở Lead / Deal (CRM)"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
            ) : w.chatType === 'department' && w.deptId ? (
              <Link
                to={`/departments/${w.deptId}/chat`}
                className="p-1.5 rounded-lg hover:bg-white/15"
                title="Mở trang Chat phòng ban"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                to="/crm/messenger"
                className="p-1.5 rounded-lg hover:bg-white/15"
                title="Mở trang Nhóm chat"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => closeWindow(w.windowKey)}
              className="p-1.5 rounded-lg hover:bg-white/15"
              title="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col bg-slate-50">
            {w.chatType === 'messenger_group' && w.groupId ? (
              <MessengerGroupChatTab groupId={w.groupId} socket={socket} fillParent />
            ) : w.chatType === 'department' && w.deptId ? (
              <DepartmentChatBubble deptId={w.deptId} socket={socket} fillParent />
            ) : w.leadId ? (
              <LeadChatTab leadId={w.leadId} socket={socket} fillParent />
            ) : null}
          </div>
        </div>
      ))}

      {launcherOpen ? (
        <div
          ref={launcherRef}
          className="fixed flex flex-col rounded-l-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
          style={{
            zIndex: Z_LAUNCHER,
            width: LAUNCHER_W,
            maxHeight: 'min(72vh, 560px)',
            right: DOCK_W,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          <div className="shrink-0 px-3 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-800">Chat nhanh</p>
              <p className="text-[10px] text-slate-500">Tìm NV hoặc chọn nhóm</p>
            </div>
            <div className="flex items-center gap-1">
              <Link
                to="/crm/messenger"
                className="text-[10px] font-semibold text-sky-600 hover:text-sky-800 px-2 py-1 rounded-md hover:bg-sky-50"
                onClick={() => setLauncherOpen(false)}
              >
                Trang đầy đủ
              </Link>
              <button
                type="button"
                className="p-1 rounded-lg text-slate-500 hover:bg-slate-200"
                title="Đóng"
                onClick={() => setLauncherOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                <Search className="h-3 w-3" /> Tìm nhân viên
              </label>
              <input
                type="search"
                value={staffQ}
                onChange={(e) => setStaffQ(e.target.value)}
                placeholder="Tên, email…"
                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-sky-400 focus:border-transparent"
              />
              {staffLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tìm…
                </div>
              ) : staffRows.length ? (
                <ul className="mt-1.5 space-y-0.5 border border-slate-100 rounded-lg divide-y divide-slate-50 max-h-40 overflow-y-auto">
                  {staffRows.map((u) => {
                    const online = isUserOnline(presenceByUser, u.id);
                    return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => void onPickStaff(u)}
                        disabled={String(u.id) === String(uid)}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-sky-50 disabled:opacity-40 flex items-center gap-2"
                      >
                        <span className="relative shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 text-white flex items-center justify-center text-[10px] font-bold">
                          {(u.full_name || u.email || '?')[0].toUpperCase()}
                          <OnlineStatusDot online={online} className="absolute bottom-0 right-0" />
                        </span>
                        <span className="truncate flex-1 min-w-0">
                          <span className="font-medium text-slate-800">{u.full_name || u.email}</span>
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
                <p className="text-[11px] text-slate-400 py-1">Không có kết quả</p>
              ) : null}
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                <Users className="h-3 w-3" /> Nhóm của tôi
              </label>
              <input
                type="search"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                placeholder="Lọc tên nhóm…"
                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-sky-400 focus:border-transparent mb-1.5"
              />
              {groupsLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải nhóm…
                </div>
              ) : filteredGroups.length ? (
                <ul className="space-y-0.5 border border-slate-100 rounded-lg divide-y divide-slate-50 max-h-48 overflow-y-auto">
                  {filteredGroups.map((g) => {
                    const n = unreadByGroupId[g.id] || 0;
                    const peerOnline = g.is_direct && g.peer_id ? isUserOnline(presenceByUser, g.peer_id) : false;
                    return (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => onPickGroup(g)}
                          className="w-full text-left px-2 py-1.5 text-xs hover:bg-cyan-50 flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-1.5 min-w-0 flex-1">
                            {g.is_direct && g.peer_id ? (
                              <OnlineStatusDot online={peerOnline} size="md" />
                            ) : null}
                            <span className="truncate font-medium text-slate-800">{g.name || 'Nhóm'}</span>
                          </span>
                          {n > 0 ? (
                            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                              {n > 99 ? '…' : n}
                            </span>
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-400 py-1">Chưa có nhóm hoặc không khớp lọc</p>
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
              className="pointer-events-auto group relative flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white shadow-xl hover:shadow-2xl hover:border-sky-300 cursor-pointer transition"
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
        className="fixed flex flex-col items-center gap-2 py-3 px-1.5 rounded-l-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm"
        style={{ zIndex: Z_DOCK, right: 0, top: '50%', transform: 'translateY(-50%)', width: DOCK_W }}
      >
        <button
          type="button"
          onClick={() => setLauncherOpen((v) => !v)}
          className={`relative w-10 h-10 rounded-full flex items-center justify-center shadow-md transition ${
            launcherOpen
              ? 'bg-slate-800 text-white ring-2 ring-sky-400'
              : 'bg-gradient-to-br from-sky-500 to-cyan-600 text-white hover:opacity-95'
          }`}
          title={launcherOpen ? 'Đóng danh sách' : 'Tìm nhân viên & nhóm chat'}
        >
          <MessageCircle className="h-5 w-5" />
          {!launcherOpen && totalUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
        <div className="w-8 border-t border-slate-200 my-0.5" />
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
          return (
            <button
              key={w.windowKey}
              type="button"
              title={w.title}
              onClick={() => toggleMinimize(w.windowKey)}
              className={`relative w-10 h-10 rounded-full border-2 flex items-center justify-center text-[11px] font-bold transition ${
                w.minimized
                  ? 'border-slate-200 bg-slate-100 text-slate-600'
                  : isDept
                    ? 'border-white text-white'
                    : 'border-cyan-500 bg-cyan-50 text-cyan-800'
              }`}
              style={isDept && !w.minimized && w.color ? { backgroundColor: w.color } : undefined}
            >
              {isDept ? (
                <Building2 className="h-4 w-4" />
              ) : (
                (w.code || w.title || '?').slice(0, 2)
              )}
              {showPeerDot ? (
                <OnlineStatusDot
                  online={isUserOnline(presenceByUser, peerId)}
                  size="md"
                  className="absolute -bottom-0.5 -right-0.5"
                />
              ) : null}
              {n > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border border-white">
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
