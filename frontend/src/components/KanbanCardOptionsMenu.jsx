import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Clock, Pin, CheckCircle2 } from 'lucide-react';

/**
 * Menu tùy chọn thẻ Kanban: deadline, ghim, đã tương tác (CRM).
 */
export default function KanbanCardOptionsMenu({
  item,
  theme = 'crm',
  hideDeadlineOption = false,
  deadlineAt = null,
  onOpenDeadline,
  onTogglePin,
  onToggleInteracted,
  pinEnabled = true,
  disabled = false,
  disabledTitle,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [menuPositioned, setMenuPositioned] = useState(false);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [btnTipOpen, setBtnTipOpen] = useState(false);
  const [btnTipPos, setBtnTipPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const tipTimerRef = useRef(null);

  const showDeadline = !hideDeadlineOption && typeof onOpenDeadline === 'function';
  const showPin = pinEnabled && typeof onTogglePin === 'function';
  const showInteracted = typeof onToggleInteracted === 'function';
  const canRender = showDeadline || showPin || showInteracted;

  const isSx = theme === 'sx';
  const sizeClass = isSx ? 'h-5 w-5' : 'h-6 w-6';
  const iconClass = isSx ? 'h-3 w-3' : 'h-3.5 w-3.5';

  const hasDeadline = !!deadlineAt;
  const isPinned = !!item?.is_pinned;
  const isInteracted = !!item?.is_interacted;
  const hasActiveOption = hasDeadline || isPinned || isInteracted;

  const updateMenuPosition = () => {
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const rect = btn.getBoundingClientRect();
    const menuW = menu.offsetWidth || 220;
    const menuH = menu.offsetHeight || 160;
    const gap = 6;

    let top = rect.top - menuH - gap;
    let left = rect.right - menuW;

    if (top < 8) top = rect.bottom + gap;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - menuH - 8));

    setMenuPos({ top, left });
  };

  const updateBtnTipPosition = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setBtnTipPos({ top: rect.top - 6, left: rect.left + rect.width / 2 });
  };

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPositioned(false);
      return;
    }
    updateMenuPosition();
    setMenuPositioned(true);
  }, [menuOpen, showDeadline, showPin, showInteracted]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onReflow = () => updateMenuPosition();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [menuOpen]);

  useEffect(() => () => {
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
  }, []);

  if (!canRender) return null;

  const closeMenu = () => {
    setMenuOpen(false);
    setHoveredKey(null);
  };

  const btnTipLabel = disabled
    ? (disabledTitle || 'Không thể mở tùy chọn')
    : 'Tùy chọn thẻ — deadline, ghim, đã tương tác';

  const accent = isSx
    ? {
      ring: 'ring-teal-200',
      open: 'text-teal-600 bg-teal-50 ring-teal-200',
      hover: 'hover:text-teal-700 hover:bg-teal-50',
      menu: 'border-teal-200 bg-white',
      head: 'text-teal-700',
      tipBg: 'bg-teal-800',
      tipArrow: 'border-t-teal-800',
    }
    : {
      ring: 'ring-indigo-200',
      open: 'text-indigo-600 bg-indigo-50 ring-indigo-200',
      hover: 'hover:text-indigo-600 hover:bg-indigo-50',
      menu: 'border-indigo-200 bg-white',
      head: 'text-indigo-700',
      tipBg: 'bg-indigo-800',
      tipArrow: 'border-t-indigo-800',
    };

  const btnClass = disabled
    ? `${sizeClass} shrink-0 inline-flex items-center justify-center rounded-full text-slate-300 opacity-40 pointer-events-none`
    : [
      sizeClass,
      'relative shrink-0 inline-flex items-center justify-center rounded-full transition-colors cursor-pointer',
      menuOpen ? `${accent.open} ring-1` : (hasActiveOption ? `${isSx ? 'text-teal-600' : 'text-indigo-600'} ring-1 ${accent.ring}` : `${isSx ? 'text-teal-500' : 'text-indigo-400'} ${accent.hover}`),
    ].join(' ');

  const menuItems = [
    showDeadline && {
      key: 'deadline',
      label: hasDeadline ? 'Sửa deadline thẻ' : 'Đặt deadline thẻ',
      active: hasDeadline,
      Icon: Clock,
      tone: {
        iconBg: 'bg-rose-100',
        iconText: 'text-rose-600',
        idle: 'hover:bg-rose-50/90',
        hover: 'bg-rose-100 text-rose-950 ring-1 ring-inset ring-rose-300',
        active: 'bg-rose-50',
        badge: 'bg-rose-100 text-rose-700',
        arrow: 'text-rose-500',
      },
      onClick: (e) => {
        e.stopPropagation();
        closeMenu();
        onOpenDeadline(item);
      },
    },
    showPin && {
      key: 'pin',
      label: isPinned ? 'Bỏ ghim thẻ' : 'Ghim thẻ lên đầu',
      active: isPinned,
      Icon: Pin,
      iconClass: isPinned ? 'rotate-45 fill-amber-500 text-amber-600' : '',
      tone: {
        iconBg: 'bg-amber-100',
        iconText: 'text-amber-600',
        idle: 'hover:bg-amber-50/90',
        hover: 'bg-amber-100 text-amber-950 ring-1 ring-inset ring-amber-300',
        active: 'bg-amber-50',
        badge: 'bg-amber-100 text-amber-800',
        arrow: 'text-amber-600',
      },
      onClick: (e) => {
        e.stopPropagation();
        closeMenu();
        onTogglePin(item, !isPinned);
      },
    },
    showInteracted && {
      key: 'interacted',
      label: isInteracted ? 'Bỏ «đã tương tác»' : 'Đã tương tác (ẩn deadline)',
      hint: 'Ẩn deadline cột trên thẻ',
      active: isInteracted,
      Icon: CheckCircle2,
      iconClass: isInteracted ? 'fill-blue-500 text-white' : '',
      tone: {
        iconBg: 'bg-blue-100',
        iconText: 'text-blue-600',
        idle: 'hover:bg-blue-50/90',
        hover: 'bg-blue-100 text-blue-950 ring-1 ring-inset ring-blue-300',
        active: 'bg-blue-50',
        badge: 'bg-blue-100 text-blue-700',
        arrow: 'text-blue-500',
      },
      onClick: (e) => {
        e.stopPropagation();
        closeMenu();
        onToggleInteracted(item, !isInteracted);
      },
    },
  ].filter(Boolean);

  const showBtnTip = () => {
    if (disabled || menuOpen) return;
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    tipTimerRef.current = window.setTimeout(() => {
      updateBtnTipPosition();
      setBtnTipOpen(true);
    }, 350);
  };

  const hideBtnTip = () => {
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    setBtnTipOpen(false);
  };

  const btnTipPortal = btnTipOpen && !menuOpen && !disabled && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="pointer-events-none fixed z-[99997] -translate-x-1/2 -translate-y-full"
        style={{ top: btnTipPos.top, left: btnTipPos.left }}
        role="tooltip"
      >
        <div className={`max-w-[12rem] rounded-md px-2 py-1 text-center text-[10px] font-medium leading-snug text-white shadow-lg ${accent.tipBg}`}>
          {btnTipLabel}
        </div>
        <div className={`mx-auto h-0 w-0 border-x-[5px] border-x-transparent border-t-[5px] ${accent.tipArrow}`} aria-hidden />
      </div>,
      document.body,
    )
    : null;

  const menuPortal = menuOpen && !disabled && typeof document !== 'undefined'
    ? createPortal(
      <>
        <div
          className="fixed inset-0"
          style={{ zIndex: 99998 }}
          onMouseDown={(e) => { e.stopPropagation(); closeMenu(); }}
        />
        <div
          ref={menuRef}
          className={`fixed min-w-[11.5rem] max-w-[15rem] rounded-lg border py-1 shadow-xl ${accent.menu}`}
          style={{
            zIndex: 99999,
            top: menuPos.top,
            left: menuPos.left,
            visibility: menuPositioned ? 'visible' : 'hidden',
          }}
          data-kanban-options-menu
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setHoveredKey(null)}
        >
          <p className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${accent.head}`}>
            Tùy chọn thẻ
          </p>
          <ul className="px-1 pb-1">
            {menuItems.map((row) => {
              const RowIcon = row.Icon;
              const isHovered = hoveredKey === row.key;
              const { tone } = row;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    className={`w-full text-left rounded-md px-1.5 py-1.5 transition-all duration-100 ${
                      isHovered
                        ? tone.hover
                        : row.active
                          ? tone.active
                          : tone.idle
                    }`}
                    title={row.hint ? `${row.label} — ${row.hint}` : row.label}
                    onMouseEnter={() => setHoveredKey(row.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onClick={row.onClick}
                  >
                    <span className="flex items-start gap-2 min-w-0">
                      <span className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-md ${tone.iconBg}`}>
                        <RowIcon
                          className={`h-3.5 w-3.5 ${tone.iconText} ${row.iconClass || ''}`}
                          strokeWidth={2.2}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[11px] leading-snug ${row.active ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
                          {row.label}
                        </span>
                        {row.hint && (
                          <span className="block text-[9px] text-slate-500 mt-0.5 leading-snug">{row.hint}</span>
                        )}
                      </span>
                      {row.active && (
                        <span className={`shrink-0 mt-0.5 rounded px-1 py-px text-[8px] font-bold uppercase ${tone.badge}`}>
                          Bật
                        </span>
                      )}
                      {isHovered && (
                        <span className={`shrink-0 text-[10px] font-bold mt-0.5 ${tone.arrow}`}>→</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </>,
      document.body,
    )
    : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        className={btnClass}
        data-kanban-options-menu
        data-kanban-flag-btn
        data-sx-quick-btn
        title={btnTipLabel}
        aria-label={btnTipLabel}
        onMouseEnter={showBtnTip}
        onMouseLeave={hideBtnTip}
        onFocus={showBtnTip}
        onBlur={hideBtnTip}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          hideBtnTip();
          if (disabled) return;
          setMenuOpen((v) => !v);
        }}
      >
        <MoreHorizontal className={iconClass} strokeWidth={2.4} />
        {hasActiveOption && !menuOpen && (
          <span
            className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ${
              hasDeadline ? 'bg-rose-500' : isPinned ? 'bg-amber-500' : 'bg-blue-500'
            }`}
            aria-hidden
          />
        )}
      </button>
      {btnTipPortal}
      {menuPortal}
    </>
  );
}
