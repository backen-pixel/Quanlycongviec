import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  MessageCircle,
  X,
  Search,
  Users,
  Loader2,
  ChevronRight,
  Building2,
  User,
  UserPlus,
  Pin,
  Filter,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import OnlineStatusDot, { getUserPresence } from './OnlineStatusDot';
import {
  formatChatHeaderPresenceLabel,
  formatLastActiveShort,
} from '../lib/userPresenceDisplay';

export const QUICK_CHAT_DOCK_W = 72;
export const QUICK_CHAT_DOCK_MINI_W = 52;
export const QUICK_CHAT_PANEL_W = 320;
const MAX_COMPACT_AVATARS = 8;
const DOCK_SHADOW = '0 12px 40px rgba(15, 23, 42, 0.12)';
const DOCK_SHADOW_SUNK = '0 4px 16px rgba(15, 23, 42, 0.06)';
const DOCK_COLLAPSED_KEY = 'messenger_quick_dock_collapsed';
/** Phần lộ ra mép phải khi thanh đang chìm */
const SUNK_PEEK_PX = 16;

function avatarUrl(publicFileUrl, av) {
  if (!av || typeof av !== 'string') return null;
  return publicFileUrl(av.trim()) || null;
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #2563EB, #7C3AED)',
  'linear-gradient(135deg, #7C3AED, #6366F1)',
  'linear-gradient(135deg, #2563EB, #0891B2)',
  'linear-gradient(135deg, #22C55E, #16A34A)',
  'linear-gradient(135deg, #F59E0B, #EA580C)',
];

function gradientFor(name) {
  const s = String(name || '?');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function DockAvatar({
  src,
  name,
  size = 'md',
  active = false,
  ringClass = '',
  children,
  publicFileUrl,
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = avatarUrl(publicFileUrl, src);
  const showImg = !!(url && !imgFailed);
  const label = name || '?';
  const sizeCls =
    size === 'lg'
      ? 'w-11 h-11 text-sm rounded-2xl'
      : size === 'sm'
        ? 'w-8 h-8 text-[10px] rounded-xl'
        : 'w-10 h-10 text-[11px] rounded-2xl';

  return (
    <span
      className={`relative shrink-0 flex items-center justify-center font-semibold text-white overflow-hidden transition-all duration-200 ${sizeCls} ${
        active
          ? 'ring-2 ring-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.2)]'
          : ringClass || 'ring-2 ring-white'
      }`}
      style={!showImg ? { background: gradientFor(label) } : undefined}
    >
      {showImg ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        initialsOf(label).slice(0, 2)
      )}
      {children}
    </span>
  );
}

function UserHoverCard({ item, presence, anchorRect, publicFileUrl }) {
  if (!item || !anchorRect) return null;
  const cardW = 248;
  const top = Math.max(12, Math.min(anchorRect.top + anchorRect.height / 2 - 60, window.innerHeight - 140));
  const left = anchorRect.left - cardW - 12;

  const statusLabel = presence?.online
    ? 'Online'
    : formatChatHeaderPresenceLabel(presence)?.replace('Hoạt động ', '') || 'Offline';
  const statusColor = presence?.online ? 'text-[#22C55E]' : 'text-slate-500';

  return createPortal(
    <div
      className="fixed z-[130] pointer-events-none transition-opacity duration-150 opacity-100"
      style={{ top, left: Math.max(12, left), width: cardW }}
    >
      <div
        className="rounded-2xl border border-[#E5E7EB] bg-white/95 backdrop-blur-xl p-3.5"
        style={{ boxShadow: DOCK_SHADOW }}
      >
        <div className="flex items-start gap-3">
          <DockAvatar
            src={item.avatar}
            name={item.title}
            size="lg"
            publicFileUrl={publicFileUrl}
          >
            {item.peerId ? (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full ${
                    presence?.online ? 'bg-[#22C55E] animate-ping opacity-40' : 'hidden'
                  }`}
                />
                <OnlineStatusDot presence={presence} size="md" className="relative" />
              </span>
            ) : null}
          </DockAvatar>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {item.department || (item.kind === 'group' ? 'Nhóm chat nội bộ' : '—')}
            </p>
            <p className={`text-xs font-medium mt-1.5 ${statusColor}`}>{statusLabel}</p>
            {!presence?.online && item.peerId ? (
              <p className="text-[11px] text-slate-400 mt-0.5">
                {formatLastActiveShort(presence?.last_ping_at)}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function UnreadBadge({ count, className = '' }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm animate-pulse ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function MessengerQuickChatDock({
  publicFileUrl,
  expanded,
  onToggleExpanded,
  onClose,
  items,
  groupsLoading,
  presenceByUser,
  activeKeys,
  totalUnread,
  panelSearch,
  onPanelSearchChange,
  onlineOnly,
  onOnlineOnlyChange,
  staffRows,
  staffLoading,
  recentConversations,
  groupConversations,
  onItemClick,
  onTogglePin,
  onPickStaff,
  uid,
  panelRef,
  dockRef,
}) {
  const [raised, setRaised] = useState(false);
  const [avatarsCollapsed, setAvatarsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DOCK_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [hoverItem, setHoverItem] = useState(null);
  const [hoverRect, setHoverRect] = useState(null);
  const hoverTimer = useRef(null);
  const leaveTimer = useRef(null);

  const dockActive = raised || expanded;
  const compactWidth = avatarsCollapsed ? QUICK_CHAT_DOCK_MINI_W : QUICK_CHAT_DOCK_W;
  const sunkOffset = Math.max(0, compactWidth - SUNK_PEEK_PX);

  const compactItems = items.slice(0, MAX_COMPACT_AVATARS);
  const overflowCount = Math.max(0, items.length - MAX_COMPACT_AVATARS);

  const handleDockEnter = useCallback(() => {
    clearTimeout(leaveTimer.current);
    setRaised(true);
  }, []);

  const handleDockLeave = useCallback(() => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      if (!expanded) setRaised(false);
    }, 120);
  }, [expanded]);

  const toggleAvatarsCollapsed = useCallback(() => {
    setAvatarsCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(DOCK_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const showHover = useCallback((item, el) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      if (el) setHoverRect(el.getBoundingClientRect());
      setHoverItem(item);
    }, 280);
  }, []);

  const hideHover = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setHoverItem(null);
    setHoverRect(null);
  }, []);

  useEffect(() => {
    if (expanded) setRaised(true);
  }, [expanded]);

  useEffect(
    () => () => {
      clearTimeout(leaveTimer.current);
      clearTimeout(hoverTimer.current);
    },
    [],
  );

  const renderCompactButton = (item) => {
    const presence = item.peerId ? getUserPresence(presenceByUser, item.peerId) : null;
    const isActive = activeKeys.has(item.key);
    const isGroup = item.kind === 'group' || item.kind === 'window';

    return (
      <div key={item.key} className="relative shrink-0">
        <button
          type="button"
          onClick={() => onItemClick(item)}
          onContextMenu={item.pinned != null ? (e) => onTogglePin?.(item, e) : undefined}
          onMouseEnter={(e) => showHover(item, e.currentTarget)}
          onMouseLeave={hideHover}
          className="block transition-transform duration-200 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-2xl"
          title={item.title}
        >
          {item.kind === 'department' ? (
            <span
              className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm ring-2 ring-white ${
                isActive ? 'ring-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.2)]' : ''
              }`}
              style={{ background: item.color ? `linear-gradient(135deg, ${item.color}, ${item.color}cc)` : gradientFor(item.title) }}
            >
              <Building2 className="h-4 w-4" />
            </span>
          ) : isGroup && !item.avatar && item.kind === 'group' ? (
            <span
              className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm ring-2 ring-white ${
                isActive ? 'ring-[#2563EB]' : ''
              }`}
              style={{ background: gradientFor(item.title) }}
            >
              <Users className="h-4 w-4" />
            </span>
          ) : (
            <DockAvatar
              src={item.avatar}
              name={item.title}
              active={isActive}
              publicFileUrl={publicFileUrl}
            >
              {item.peerId ? (
                <span className="absolute -bottom-0.5 -right-0.5">
                  {presence?.online ? (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-50 animate-ping" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22C55E] border border-white" />
                    </span>
                  ) : (
                    <OnlineStatusDot presence={presence} size="md" />
                  )}
                </span>
              ) : null}
            </DockAvatar>
          )}
          {item.pinned ? (
            <span className="absolute -top-0.5 -left-0.5 h-3.5 w-3.5 rounded-full bg-[#F59E0B] flex items-center justify-center ring-1 ring-white shadow">
              <Pin className="h-2 w-2 text-white fill-white" />
            </span>
          ) : null}
          <UnreadBadge count={item.unread} />
        </button>
      </div>
    );
  };

  const hoverPresence = hoverItem?.peerId ? getUserPresence(presenceByUser, hoverItem.peerId) : null;

  return (
    <>
      {hoverItem && dockActive ? (
        <UserHoverCard
          item={hoverItem}
          presence={hoverPresence}
          anchorRect={hoverRect}
          publicFileUrl={publicFileUrl}
        />
      ) : null}

      <div
        ref={dockRef}
        className="fixed top-1/2 -translate-y-1/2 z-[120] flex flex-row-reverse items-stretch gap-3 font-[Inter,system-ui,sans-serif]"
        style={{ right: 12 }}
        onMouseEnter={handleDockEnter}
        onMouseLeave={handleDockLeave}
      >
        {/* Expanded panel — luôn hiển thị đầy đủ khi mở */}
        {expanded ? (
          <div
            ref={panelRef}
            className="w-[320px] shrink-0 flex flex-col rounded-[24px] border border-[#E5E7EB] bg-white overflow-hidden max-h-[min(72vh,640px)]"
            style={{ boxShadow: DOCK_SHADOW }}
          >
            <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[#E5E7EB] bg-gradient-to-br from-[#2563EB]/5 via-white to-[#7C3AED]/5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Chat nhanh</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Nhân viên & hội thoại gần đây</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                  title="Đóng"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={panelSearch}
                  onChange={(e) => onPanelSearchChange(e.target.value)}
                  placeholder="Tìm nhân viên, nhóm…"
                  className="w-full text-sm border border-[#E5E7EB] rounded-2xl pl-9 pr-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition placeholder:text-slate-400"
                />
              </div>

              <button
                type="button"
                onClick={() => onOnlineOnlyChange(!onlineOnly)}
                className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl border transition ${
                  onlineOnly
                    ? 'border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]'
                    : 'border-[#E5E7EB] text-slate-600 hover:border-slate-300'
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                Chỉ người online
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4 [scrollbar-width:thin]">
              {panelSearch.trim() && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                    <User className="h-3 w-3" /> Nhân viên
                  </h3>
                  {staffLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tìm…
                    </div>
                  ) : staffRows.length ? (
                    <ul className="space-y-1">
                      {staffRows.map((u) => {
                        const pres = getUserPresence(presenceByUser, u.id);
                        if (onlineOnly && !pres?.online) return null;
                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => onPickStaff(u)}
                              disabled={String(u.id) === String(uid)}
                              className="w-full text-left px-2.5 py-2 rounded-2xl hover:bg-[#2563EB]/5 disabled:opacity-40 flex items-center gap-2.5 transition group"
                            >
                              <DockAvatar src={u.avatar} name={u.full_name || u.email} size="sm" publicFileUrl={publicFileUrl}>
                                <OnlineStatusDot presence={pres} size="md" className="absolute -bottom-0.5 -right-0.5" />
                              </DockAvatar>
                              <span className="min-w-0 flex-1">
                                <span className="text-sm font-medium text-slate-800 block truncate">
                                  {u.full_name || u.email}
                                </span>
                                <span className="text-[11px] text-slate-500 block truncate">
                                  {u.department?.name || u.position || u.email}
                                </span>
                              </span>
                              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#2563EB] shrink-0" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400 py-2 text-center">Không có kết quả</p>
                  )}
                </section>
              )}

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <MessageCircle className="h-3 w-3" /> Hội thoại gần đây
                </h3>
                {groupsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải…
                  </div>
                ) : recentConversations.length ? (
                  <ul className="space-y-1">
                    {recentConversations.map((item) => {
                      const pres = item.peerId ? getUserPresence(presenceByUser, item.peerId) : null;
                      if (onlineOnly && item.peerId && !pres?.online) return null;
                      const isActive = activeKeys.has(item.key);
                      return (
                        <li key={item.key}>
                          <button
                            type="button"
                            onClick={() => onItemClick(item)}
                            className={`w-full text-left px-2.5 py-2 rounded-2xl flex items-center gap-2.5 transition group ${
                              isActive
                                ? 'bg-gradient-to-r from-[#2563EB]/10 to-[#7C3AED]/10 ring-1 ring-[#2563EB]/20'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <DockAvatar
                              src={item.avatar}
                              name={item.title}
                              size="sm"
                              active={isActive}
                              publicFileUrl={publicFileUrl}
                            >
                              {item.peerId ? (
                                <OnlineStatusDot presence={pres} size="md" className="absolute -bottom-0.5 -right-0.5" />
                              ) : null}
                            </DockAvatar>
                            <span className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-slate-800 block truncate flex items-center gap-1">
                                {item.pinned ? <Pin className="h-3 w-3 text-[#F59E0B] fill-[#F59E0B] shrink-0" /> : null}
                                {item.title}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {pres?.online ? 'Đang hoạt động' : item.kind === 'group' ? 'Nhóm chat' : formatLastActiveShort(pres?.last_ping_at)}
                              </span>
                            </span>
                            {item.unread > 0 ? (
                              <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center">
                                {item.unread > 99 ? '99+' : item.unread}
                              </span>
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#2563EB] shrink-0" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 py-2 text-center">Chưa có hội thoại</p>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Nhóm chat
                  </h3>
                  <Link
                    to="/crm/messenger"
                    onClick={onClose}
                    className="text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] inline-flex items-center gap-0.5"
                  >
                    <UserPlus className="h-3 w-3" /> Tạo nhóm
                  </Link>
                </div>
                {groupConversations.length ? (
                  <ul className="space-y-1">
                    {groupConversations.map((item) => {
                      const isActive = activeKeys.has(item.key);
                      return (
                        <li key={item.key}>
                          <button
                            type="button"
                            onClick={() => onItemClick(item)}
                            className={`w-full text-left px-2.5 py-2 rounded-2xl flex items-center gap-2.5 transition group ${
                              isActive ? 'bg-gradient-to-r from-[#2563EB]/10 to-[#7C3AED]/10' : 'hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0"
                              style={{ background: gradientFor(item.title) }}
                            >
                              <Users className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1 text-sm font-medium text-slate-800 truncate">{item.title}</span>
                            {item.unread > 0 ? (
                              <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center">
                                {item.unread > 99 ? '99+' : item.unread}
                              </span>
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#2563EB] shrink-0" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 py-2 text-center">Chưa có nhóm</p>
                )}
              </section>

              <Link
                to="/crm/messenger"
                onClick={onClose}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl border border-[#E5E7EB] text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-[#2563EB]/30 hover:text-[#2563EB] transition"
              >
                <MessageCircle className="h-4 w-4" />
                Mở trang chat đầy đủ
              </Link>
            </div>
          </div>
        ) : null}

        {/* Compact dock — chìm khi không hover; thu gọn được */}
        <div
          className={`relative shrink-0 flex flex-col items-center rounded-[24px] border py-3 px-2 gap-2 transition-all duration-300 ease-out ${
            dockActive
              ? 'opacity-100 border-[#E5E7EB] bg-white'
              : 'opacity-[0.42] border-transparent bg-white/75 backdrop-blur-sm'
          } ${!dockActive && totalUnread > 0 ? 'opacity-55' : ''}`}
          style={{
            width: compactWidth,
            boxShadow: dockActive ? DOCK_SHADOW : DOCK_SHADOW_SUNK,
            transform: dockActive ? 'translateX(0)' : `translateX(${sunkOffset}px)`,
          }}
        >
          <button
            type="button"
            onClick={onToggleExpanded}
            className={`relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 shrink-0 ${
              expanded
                ? 'bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-white shadow-md scale-95'
                : dockActive
                  ? 'bg-slate-50 text-[#2563EB] hover:bg-gradient-to-br hover:from-[#2563EB] hover:to-[#7C3AED] hover:text-white hover:shadow-md'
                  : 'bg-white/90 text-[#2563EB]/80 shadow-sm'
            }`}
            title={expanded ? 'Thu gọn danh sách' : 'Mở danh sách chat'}
          >
            <MessageCircle className="h-5 w-5" />
            {!expanded && totalUnread > 0 ? (
              <UnreadBadge count={totalUnread} className={dockActive ? 'animate-bounce' : ''} />
            ) : null}
          </button>

          <button
            type="button"
            onClick={toggleAvatarsCollapsed}
            className={`w-8 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#2563EB] hover:bg-[#2563EB]/5 transition shrink-0 ${
              dockActive ? 'opacity-100' : 'opacity-70'
            }`}
            title={avatarsCollapsed ? 'Mở rộng thanh avatar' : 'Thu gọn — chỉ giữ nút chat'}
          >
            {avatarsCollapsed ? (
              <PanelRightOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelRightClose className="h-3.5 w-3.5" />
            )}
          </button>

          {!avatarsCollapsed ? (
            <>
              <div className={`w-8 border-t shrink-0 transition-colors ${dockActive ? 'border-[#E5E7EB]' : 'border-slate-200/60'}`} />

              <div
                className={`flex flex-col items-center gap-2 w-full min-h-0 transition-all duration-300 ${
                  dockActive ? 'opacity-100 max-h-[min(420px,50vh)]' : 'opacity-80 max-h-[min(320px,40vh)]'
                } overflow-hidden`}
              >
                {groupsLoading && items.length === 0 ? (
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400 my-2" />
                ) : null}

                {compactItems.map(renderCompactButton)}

                {overflowCount > 0 ? (
                  <button
                    type="button"
                    onClick={onToggleExpanded}
                    className="w-10 h-10 rounded-2xl bg-slate-100 border border-[#E5E7EB] text-xs font-bold text-slate-600 hover:bg-gradient-to-br hover:from-[#2563EB]/10 hover:to-[#7C3AED]/10 hover:text-[#2563EB] transition-all duration-200 shrink-0"
                    title={`Xem thêm ${overflowCount} hội thoại`}
                  >
                    +{overflowCount}
                  </button>
                ) : null}

                {!groupsLoading && items.length === 0 ? (
                  <p className="text-[9px] text-slate-400 text-center leading-tight px-1 py-1">Chưa có chat</p>
                ) : null}
              </div>
            </>
          ) : null}

          {!dockActive && !expanded ? (
            <span
              className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-[#2563EB]/30"
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
