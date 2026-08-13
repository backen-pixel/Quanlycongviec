import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import OnlineStatusDot, { getUserPresence } from './OnlineStatusDot';
import {
  formatChatHeaderPresenceLabel,
  formatLastActiveShort,
} from '../lib/userPresenceDisplay';

export const QUICK_CHAT_DOCK_W = 84;
export const QUICK_CHAT_DOCK_MINI_W = 56;
/** Chiều rộng thực tế trên màn hình (gồm padding badge) */
export const QUICK_CHAT_DOCK_VISUAL_W = QUICK_CHAT_DOCK_W + 12;
export const QUICK_CHAT_PANEL_W = 320;
export const QUICK_CHAT_DOCK_PANEL_W = QUICK_CHAT_PANEL_W;
/** Lùi vùng nút cuộn Kanban mé phải — tránh chồng thanh chat nhanh (fixed z-[120]). */
export const KANBAN_QUICK_CHAT_RIGHT_GAP_PX = 44;
export const KANBAN_EDGE_SCROLL_Z_INDEX = 135;
const MAX_COMPACT_AVATARS = 8;
const DOCK_SHADOW = '0 12px 40px rgba(15, 23, 42, 0.12)';
const DOCK_SHADOW_SUNK = '0 4px 16px rgba(15, 23, 42, 0.06)';
/** Viền / glow làm nổi bật thanh chat nhanh trên nền Kanban */
const DOCK_ACCENT_GLOW_ACTIVE =
  '0 0 0 3px rgba(37, 99, 235, 0.22), 0 0 14px rgba(34, 197, 94, 0.12), 0 12px 40px rgba(15, 23, 42, 0.14)';
const DOCK_ACCENT_GLOW_SUNK =
  '0 0 0 2px rgba(37, 99, 235, 0.28), 0 4px 18px rgba(37, 99, 235, 0.1)';
const DOCK_ACCENT_GLOW_UNREAD =
  '0 0 0 2px rgba(239, 68, 68, 0.35), 0 0 10px rgba(37, 99, 235, 0.12), 0 8px 28px rgba(239, 68, 68, 0.22)';
const DOCK_PINNED_KEY = 'messenger_quick_dock_pinned';
/** Class ẩn scrollbar nhưng vẫn cuộn được */
const DOCK_STRIP_SCROLL_CLS =
  'overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';
/** Khoảng cách mép phải viewport — sát mép màn hình */
const DOCK_VIEWPORT_RIGHT = 0;
/** Padding trong mỗi ô avatar (badge/status không bị cắt) */
const COMPACT_ITEM_PAD = 6;
/** Trễ trước khi hiện thẻ hover avatar (ms) — chỉ khi dock đã mở bằng click/ghim */
const HOVER_CARD_SHOW_MS = 480;
/** Trễ trước khi ẩn thẻ hover avatar (ms) */
const HOVER_CARD_HIDE_MS = 360;
/** Thời lượng trượt / mờ thanh dock (ms) */
const DOCK_MOTION_MS = 520;
const DOCK_MOTION_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';
const DOCK_MOTION_CLS =
  'motion-reduce:transition-none transition-[transform,opacity,box-shadow,border-color,background-color] duration-[520ms] ease-[cubic-bezier(0.33,1,0.68,1)] will-change-[transform,opacity]';

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

function UserHoverCard({ item, presence, anchorRect, publicFileUrl, onTogglePin, onPreviewEnter, onPreviewLeave }) {
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
      data-messenger-hover-card=""
      className="fixed z-[130] pointer-events-auto pr-3"
      style={{ top, left: Math.max(12, left), width: cardW + 12 }}
      onMouseEnter={onPreviewEnter}
      onMouseLeave={onPreviewLeave}
    >
      <div
        className="rounded-2xl border border-[#E5E7EB] bg-white/95 backdrop-blur-xl p-3.5"
        style={{ boxShadow: DOCK_SHADOW, width: cardW }}
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
            {item.lastPreview ? (
              <PreviewLine text={item.lastPreview} unread={item.unread} className="mt-2 !text-[10px]" />
            ) : null}
            {!presence?.online && item.peerId ? (
              <p className="text-[11px] text-slate-400 mt-0.5">
                {formatLastActiveShort(presence?.last_ping_at)}
              </p>
            ) : null}
            {item.groupId && onTogglePin ? (
              <button
                type="button"
                onClick={(e) => onTogglePin(item, e)}
                className={`mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition ${
                  item.pinned
                    ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#B45309]'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-[#F59E0B] hover:text-[#B45309]'
                }`}
              >
                <Pin className={`h-3 w-3 ${item.pinned ? 'fill-current' : ''}`} />
                {item.pinned ? 'Bỏ ghim thanh chat' : 'Ghim lên thanh chat'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function UnreadBadge({ count, className = '', prominent = false, pulseRing = false }) {
  if (!count || count <= 0) return null;
  const label = count > 99 ? '99+' : count;
  if (prominent) {
    return (
      <span className={`absolute top-0 right-0 z-10 flex items-center justify-center ${className}`}>
        {pulseRing ? (
          <span className="absolute inline-flex h-[24px] w-[24px] rounded-full bg-[#EF4444] opacity-40 animate-ping" />
        ) : null}
        <span className="relative min-w-[20px] h-[20px] px-1 rounded-full bg-gradient-to-br from-[#EF4444] to-[#DC2626] text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-white shadow-[0_2px_8px_rgba(239,68,68,0.5)]">
          {label}
        </span>
      </span>
    );
  }
  return (
    <span
      className={`absolute top-0.5 right-0.5 z-10 min-w-[16px] h-[16px] px-0.5 rounded-full bg-[#EF4444] text-white text-[9px] font-bold flex items-center justify-center border-2 border-white shadow-sm ${className}`}
    >
      {label}
    </span>
  );
}

function PreviewLine({ text, unread = 0, className = '' }) {
  const preview = String(text || '').trim();
  if (!preview) return null;
  return (
    <span
      className={`block truncate mt-0.5 px-2 py-0.5 rounded-md border text-[11px] leading-snug ${
        unread > 0
          ? 'font-semibold text-[#991B1B] bg-[#FEE2E2] border-[#FECACA]'
          : 'font-medium text-slate-600 bg-slate-50 border-slate-100'
      } ${className}`}
      title={preview}
    >
      {preview}
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
  // Ghim cố định thanh + thu gọn avatar đã bỏ UI — clear flag cũ trong localStorage.
  useEffect(() => {
    try {
      localStorage.removeItem(DOCK_PINNED_KEY);
      localStorage.removeItem('messenger_quick_dock_collapsed');
    } catch { /* ignore */ }
  }, []);
  const dockPinned = false;
  const [hoverItem, setHoverItem] = useState(null);
  const [hoverRect, setHoverRect] = useState(null);
  const [previewEngaged, setPreviewEngaged] = useState(false);
  const hoverTimer = useRef(null);
  const hideHoverTimer = useRef(null);
  const stripScrollRef = useRef(null);
  const [stripScrollFade, setStripScrollFade] = useState({ top: false, bottom: false });

  const updateStripScrollFade = useCallback(() => {
    const el = stripScrollRef.current;
    if (!el) {
      setStripScrollFade({ top: false, bottom: false });
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    setStripScrollFade({
      top: scrollTop > 6,
      bottom: scrollTop + clientHeight < scrollHeight - 6,
    });
  }, []);

  const dockActive = raised || expanded || dockPinned;

  /** Mở/đóng thanh compact bằng click — không dùng hover (tránh che thanh cuộn trang). */
  const ignoreOutsideUntilRef = useRef(0);
  const openDock = useCallback(() => {
    // Tránh cùng nhịp click bị listener "click ngoài" thu lại ngay.
    ignoreOutsideUntilRef.current = Date.now() + 450;
    setRaised(true);
  }, []);

  const sinkDock = useCallback(() => {
    if (dockPinned || expanded) return;
    setRaised(false);
    setHoverItem(null);
    setHoverRect(null);
    setPreviewEngaged(false);
  }, [dockPinned, expanded]);

  const handleChatButtonClick = useCallback((e) => {
    e?.stopPropagation?.();
    if (!dockActive) {
      openDock();
      return;
    }
    onToggleExpanded();
  }, [dockActive, openDock, onToggleExpanded]);

  const compactWidth = QUICK_CHAT_DOCK_W;
  const compactOuterWidth = compactWidth + COMPACT_ITEM_PAD * 2;

  /** Hội thoại ghim — luôn nổi ngoài thanh chìm */
  const pinnedStripItems = useMemo(
    () => items.filter((i) => i.pinned && i.groupId),
    [items],
  );

  /** Avatar thường trong thanh cuộn (tối đa 8, không gồm mục đã ghim) */
  const regularStripItems = useMemo(() => {
    const rest = items.filter((i) => !i.pinned || !i.groupId);
    return rest.slice(0, MAX_COMPACT_AVATARS);
  }, [items]);

  const overflowCount = useMemo(() => {
    const rest = items.filter((i) => !i.pinned || !i.groupId);
    return Math.max(0, rest.length - MAX_COMPACT_AVATARS);
  }, [items]);

  const showHover = useCallback((item, el, { pinnedStrip = false } = {}) => {
    // Thẻ preview chỉ khi dock đã mở (click/ghim) — hover khi chìm không kéo dock ra.
    if (!raised && !dockPinned && !expanded && !pinnedStrip) return;
    clearTimeout(hideHoverTimer.current);
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      if (el) setHoverRect(el.getBoundingClientRect());
      setHoverItem(item);
      setPreviewEngaged(true);
    }, HOVER_CARD_SHOW_MS);
  }, [raised, dockPinned, expanded]);

  const hideHover = useCallback(() => {
    clearTimeout(hoverTimer.current);
    clearTimeout(hideHoverTimer.current);
    hideHoverTimer.current = setTimeout(() => {
      setHoverItem(null);
      setHoverRect(null);
      setPreviewEngaged(false);
    }, HOVER_CARD_HIDE_MS);
  }, []);

  const keepPreviewOpen = useCallback(() => {
    clearTimeout(hideHoverTimer.current);
    setPreviewEngaged(true);
  }, []);

  useEffect(() => {
    if (expanded) setRaised(true);
  }, [expanded]);

  // Click ra ngoài → chìm (trừ khi ghim / đang mở panel)
  useEffect(() => {
    if (!raised || dockPinned || expanded) return undefined;
    const onPointerDown = (e) => {
      if (Date.now() < ignoreOutsideUntilRef.current) return;
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (dockRef.current?.contains(t)) return;
      if (typeof Element !== 'undefined' && t instanceof Element) {
        if (t.closest('[data-messenger-hover-card]')) return;
      }
      sinkDock();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [raised, dockPinned, expanded, sinkDock, dockRef]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const fire = () => {
      window.dispatchEvent(
        new CustomEvent('messenger-quick-dock-layout', {
          detail: { dockActive, dockPinned, expanded, raised },
        }),
      );
    };
    fire();
    const raf = requestAnimationFrame(fire);
    const t = window.setTimeout(fire, DOCK_MOTION_MS + 48);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [dockActive, dockPinned, expanded, raised]);

  useEffect(() => {
    if (!hoverItem?.key) return;
    const fresh = items.find((i) => i.key === hoverItem.key);
    if (fresh && fresh.pinned !== hoverItem.pinned) setHoverItem(fresh);
  }, [items, hoverItem]);

  useEffect(() => {
    updateStripScrollFade();
  }, [regularStripItems.length, dockActive, updateStripScrollFade]);

  useEffect(
    () => () => {
      clearTimeout(hoverTimer.current);
      clearTimeout(hideHoverTimer.current);
    },
    [],
  );

  const renderCompactButton = (item, { pinnedStrip = false } = {}) => {
    const presence = item.peerId ? getUserPresence(presenceByUser, item.peerId) : null;
    const isActive = activeKeys.has(item.key);
    const isGroup = item.kind === 'group' || item.kind === 'window';
    const canPinConversation = !!item.groupId && !!onTogglePin;
    const pinnedIconRing =
      item.pinned && !isActive
        ? 'ring-2 ring-[#F59E0B] ring-offset-1 ring-offset-white shadow-[0_0_0_1px_rgba(245,158,11,0.25)]'
        : 'ring-2 ring-white';

    const handleClick = () => {
      if (!dockActive) openDock();
      hideHover();
      onItemClick(item);
    };

    return (
      <div
        key={item.key}
        className="relative shrink-0 overflow-visible group/dock-item"
        style={{ padding: COMPACT_ITEM_PAD }}
      >
        <button
          type="button"
          onClick={handleClick}
          onContextMenu={
            canPinConversation
              ? (e) => {
                  e.preventDefault();
                  onTogglePin(item, e);
                }
              : undefined
          }
          onMouseEnter={(e) => showHover(item, e.currentTarget, { pinnedStrip })}
          onMouseLeave={hideHover}
          className="relative block transition-transform duration-300 ease-out hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-2xl overflow-visible"
          title={
            item.lastPreview
              ? `${item.title}${item.pinned ? ' (đã ghim)' : ''} — ${item.lastPreview}`
              : item.pinned
                ? `${item.title} (đã ghim trên thanh chat)`
                : item.title
          }
        >
          {item.kind === 'department' ? (
            <span
              className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm ${
                isActive
                  ? 'ring-2 ring-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.2)]'
                  : pinnedIconRing
              }`}
              style={{ background: item.color ? `linear-gradient(135deg, ${item.color}, ${item.color}cc)` : gradientFor(item.title) }}
            >
              <Building2 className="h-4 w-4" />
            </span>
          ) : isGroup && !item.avatar && item.kind === 'group' ? (
            <span
              className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm ${
                isActive ? 'ring-2 ring-[#2563EB]' : pinnedIconRing
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
              ringClass={item.pinned && !isActive ? pinnedIconRing : ''}
              publicFileUrl={publicFileUrl}
            >
              {item.peerId ? (
                <span className="absolute bottom-0 right-0 z-10">
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
          <UnreadBadge count={item.unread} prominent={item.unread > 0} pulseRing={item.unread > 0} />
        </button>
        {canPinConversation && !item.pinned ? (
          <button
            type="button"
            onClick={(e) => onTogglePin(item, e)}
            className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 z-20 h-[18px] w-[18px] rounded-full border border-slate-200 bg-white text-slate-400 flex items-center justify-center shadow-sm transition-all opacity-0 scale-90 group-hover/dock-item:opacity-100 group-hover/dock-item:scale-100 hover:border-[#F59E0B] hover:text-[#F59E0B]"
            title="Ghim người này lên thanh chat nhanh"
          >
            <Pin className="h-2.5 w-2.5" />
          </button>
        ) : canPinConversation && item.pinned ? (
          <button
            type="button"
            onClick={(e) => onTogglePin(item, e)}
            className="absolute -top-0.5 -left-0.5 z-20 h-3.5 w-3.5 rounded-full bg-[#F59E0B] flex items-center justify-center ring-1 ring-white shadow-sm hover:bg-[#D97706] transition-colors"
            title="Bỏ ghim khỏi thanh chat nhanh"
          >
            <Pin className="h-2 w-2 text-white fill-white" />
          </button>
        ) : null}
      </div>
    );
  };

  const hoverPresence = hoverItem?.peerId ? getUserPresence(presenceByUser, hoverItem.peerId) : null;

  return (
    <>
      {hoverItem ? (
        <UserHoverCard
          item={hoverItem}
          presence={hoverPresence}
          anchorRect={hoverRect}
          publicFileUrl={publicFileUrl}
          onTogglePin={onTogglePin}
          onPreviewEnter={keepPreviewOpen}
          onPreviewLeave={hideHover}
        />
      ) : null}

      <div
        ref={dockRef}
        data-messenger-quick-chat-dock=""
        className="fixed top-1/2 -translate-y-1/2 z-[120] flex flex-row-reverse items-stretch gap-3 font-[Inter,system-ui,sans-serif] overflow-visible pointer-events-none"
        style={{ right: DOCK_VIEWPORT_RIGHT }}
      >
        {/* Expanded panel — luôn hiển thị đầy đủ khi mở */}
        {expanded ? (
          <div
            ref={panelRef}
            data-messenger-quick-chat-dock-region="panel"
            className="pointer-events-auto w-[320px] shrink-0 flex flex-col rounded-[24px] border-2 border-[#2563EB] bg-white overflow-hidden max-h-[min(72vh,640px)] shadow-[0_0_0_4px_rgba(37,99,235,0.14)]"
            style={{ boxShadow: DOCK_ACCENT_GLOW_ACTIVE }}
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

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                              {item.lastPreview ? (
                                <PreviewLine text={item.lastPreview} unread={item.unread} />
                              ) : (
                                <span className="text-[11px] text-slate-500">
                                  {pres?.online ? 'Đang hoạt động' : item.kind === 'group' ? 'Nhóm chat' : formatLastActiveShort(pres?.last_ping_at)}
                                </span>
                              )}
                            </span>
                            {item.unread > 0 ? (
                              <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-gradient-to-br from-[#EF4444] to-[#DC2626] text-white text-[11px] font-extrabold flex items-center justify-center shadow-[0_2px_8px_rgba(239,68,68,0.45)] animate-pulse">
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
                            <span className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-slate-800 block truncate">{item.title}</span>
                              {item.lastPreview ? (
                                <PreviewLine text={item.lastPreview} unread={item.unread} />
                              ) : (
                                <span className="text-[11px] text-slate-500">Nhóm chat</span>
                              )}
                            </span>
                            {item.unread > 0 ? (
                              <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-gradient-to-br from-[#EF4444] to-[#DC2626] text-white text-[11px] font-extrabold flex items-center justify-center shadow-[0_2px_8px_rgba(239,68,68,0.45)] animate-pulse">
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

        {/* Khi chìm: chỉ hiện nút mở (+ avatar ghim) — luôn trong viewport, dễ bấm, ít che scrollbar */}
        {!dockActive ? (
          <div
            data-messenger-quick-chat-dock-region="compact"
            className="pointer-events-auto flex flex-col items-center gap-1.5 shrink-0 mr-1.5"
          >
            {pinnedStripItems.length > 0 ? (
              <div className="flex flex-col items-center gap-1 shrink-0 py-0.5" aria-label="Chat đã ghim">
                {pinnedStripItems.map((item) => renderCompactButton(item, { pinnedStrip: true }))}
              </div>
            ) : null}
            <button
              type="button"
              data-dock-open-hit=""
              onClick={handleChatButtonClick}
              className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 overflow-visible border-2 shadow-md ${DOCK_MOTION_CLS} ${
                totalUnread > 0
                  ? 'border-[#EF4444]/75 bg-gradient-to-br from-[#EF4444]/90 to-[#DC2626]/90 text-white ring-1 ring-[#FCA5A5]/60'
                  : 'border-[#2563EB]/55 bg-white text-[#2563EB]'
              }`}
              style={{
                boxShadow: totalUnread > 0 ? DOCK_ACCENT_GLOW_UNREAD : DOCK_ACCENT_GLOW_SUNK,
              }}
              title={totalUnread > 0 ? `${totalUnread} tin nhắn mới — nhấn để mở` : 'Nhấn để mở thanh chat nhanh'}
            >
              <MessageCircle className="h-5 w-5" />
              {totalUnread > 0 ? (
                <UnreadBadge count={totalUnread} prominent pulseRing />
              ) : null}
            </button>
          </div>
        ) : (
        <div
          data-messenger-quick-chat-dock-region="compact"
          className={`flex flex-col items-center gap-1.5 shrink-0 overflow-visible pointer-events-auto ${DOCK_MOTION_CLS}`}
        >
          {pinnedStripItems.length > 0 ? (
            <div
              className="flex flex-col items-center gap-1 shrink-0 py-0.5 pointer-events-auto"
              aria-label="Chat đã ghim"
            >
              {pinnedStripItems.map((item) => renderCompactButton(item, { pinnedStrip: true }))}
            </div>
          ) : null}

          <div
            className={`relative shrink-0 flex flex-col items-center rounded-[24px] border-2 py-3 gap-2 overflow-visible pointer-events-auto ${DOCK_MOTION_CLS} border-[#2563EB] bg-white px-2.5`}
            style={{
              width: compactOuterWidth,
              opacity: 1,
              boxShadow: DOCK_ACCENT_GLOW_ACTIVE,
            }}
          >
          {(dockActive || dockPinned || expanded) ? (
            <span
              className={`pointer-events-none absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full ${DOCK_MOTION_CLS}`}
              style={{
                background: 'linear-gradient(180deg, #22C55E 0%, #2563EB 55%, #3B82F6 100%)',
                boxShadow: '0 0 8px rgba(34, 197, 94, 0.45)',
              }}
              aria-hidden
            />
          ) : null}
          <button
            type="button"
            data-dock-open-hit=""
            onClick={handleChatButtonClick}
            className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 overflow-visible pointer-events-auto ${DOCK_MOTION_CLS} ${
              expanded
                ? 'bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-white shadow-md scale-95'
                : 'bg-slate-50 text-[#2563EB] hover:bg-gradient-to-br hover:from-[#2563EB] hover:to-[#7C3AED] hover:text-white hover:shadow-md'
            }`}
            title={
              expanded
                ? 'Thu gọn danh sách'
                : (totalUnread > 0 ? `${totalUnread} tin nhắn mới` : 'Mở danh sách chat')
            }
          >
            <MessageCircle className="h-5 w-5" />
            {!expanded && totalUnread > 0 ? (
              <UnreadBadge count={totalUnread} prominent />
            ) : null}
          </button>

          {!expanded ? (
            <button
              type="button"
              onClick={sinkDock}
              className={`w-8 h-7 rounded-lg flex items-center justify-center pointer-events-auto text-slate-400 hover:text-slate-700 hover:bg-slate-100 ${DOCK_MOTION_CLS}`}
              title="Thu thanh chat nhanh"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}

          <>
              <div className={`w-8 border-t shrink-0 ${DOCK_MOTION_CLS} border-[#E5E7EB]`} />

              <div className="relative w-full min-h-0 flex-1 max-h-[min(340px,42vh)]">
                <div
                  ref={stripScrollRef}
                  onScroll={updateStripScrollFade}
                  className={`flex flex-col items-center gap-1 w-full h-full py-1 ${DOCK_STRIP_SCROLL_CLS}`}
                >
                  {groupsLoading && items.length === 0 ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400 my-2 shrink-0" />
                  ) : null}

                  {regularStripItems.map(renderCompactButton)}

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
                    <p className="text-[9px] text-slate-400 text-center leading-tight px-1 py-1 shrink-0">Chưa có chat</p>
                  ) : null}
                </div>
                {stripScrollFade.top ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-white to-transparent rounded-t-xl"
                    aria-hidden
                  />
                ) : null}
                {stripScrollFade.bottom ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-white to-transparent rounded-b-xl"
                    aria-hidden
                  />
                ) : null}
              </div>
          </>
          </div>
        </div>
        )}
      </div>
    </>
  );
}
