import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft } from 'lucide-react';

function isAllowedTarget(stage, blockVirtualTargets) {
  if (!stage) return false;
  if (!blockVirtualTargets) return true;
  return !stage.__virtual;
}

/**
 * Một nút icon chuyển cột — menu danh sách cột render qua portal (không bị clip bởi card).
 */
export default function KanbanCardQuickMove({
  stages = [],
  currentStageId,
  onMove,
  disabled = false,
  disabledTitle,
  theme = 'crm',
  blockVirtualTargets = true,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [menuPositioned, setMenuPositioned] = useState(false);
  const [hoveredStageId, setHoveredStageId] = useState(null);
  const [btnTipOpen, setBtnTipOpen] = useState(false);
  const [btnTipPos, setBtnTipPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const tipTimerRef = useRef(null);

  const allStages = (stages || []).filter(Boolean);
  const canRender = allStages.length > 1 && typeof onMove === 'function';

  const movableStages = blockVirtualTargets
    ? allStages.filter((s) => isAllowedTarget(s, blockVirtualTargets))
    : allStages;

  const currentStage = allStages.find((s) => String(s.id) === String(currentStageId));

  const updateMenuPosition = () => {
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const rect = btn.getBoundingClientRect();
    const menuW = menu.offsetWidth || 200;
    const menuH = menu.offsetHeight || 180;
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
    setBtnTipPos({
      top: rect.top - 6,
      left: rect.left + rect.width / 2,
    });
  };

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPositioned(false);
      return;
    }
    updateMenuPosition();
    setMenuPositioned(true);
  }, [menuOpen, movableStages.length]);

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

  const handleMove = (target, e) => {
    e?.stopPropagation?.();
    if (disabled || !target) return;
    if (String(target.id) === String(currentStageId)) return;
    setMenuOpen(false);
    setHoveredStageId(null);
    onMove(target);
  };

  const isSx = theme === 'sx';
  const sizeClass = isSx ? 'h-5 w-5' : 'h-6 w-6';
  const iconClass = isSx ? 'h-3 w-3' : 'h-3.5 w-3.5';

  const btnTipLabel = disabled
    ? (disabledTitle || 'Không thể chuyển cột')
    : 'Chuyển cột nhanh — bấm để chọn giai đoạn đích';

  const btnClass = disabled
    ? `${sizeClass} shrink-0 inline-flex items-center justify-center rounded-full text-slate-300 opacity-40 pointer-events-none`
    : [
      sizeClass,
      'shrink-0 inline-flex items-center justify-center rounded-full transition-colors cursor-pointer',
      menuOpen
        ? (isSx ? 'text-teal-600 bg-teal-50 ring-1 ring-teal-200' : 'text-violet-600 bg-violet-50 ring-1 ring-violet-200')
        : (isSx
          ? 'text-teal-500 hover:text-teal-700 hover:bg-teal-50'
          : 'text-violet-500 hover:text-violet-700 hover:bg-violet-50'),
    ].join(' ');

  const itemHoverClass = isSx
    ? 'bg-teal-100 text-teal-900 font-medium ring-1 ring-inset ring-teal-300'
    : 'bg-violet-100 text-violet-900 font-medium ring-1 ring-inset ring-violet-300';

  const itemCurrentClass = isSx
    ? 'bg-teal-50/90 text-teal-700 font-semibold ring-1 ring-inset ring-teal-200 cursor-default'
    : 'bg-violet-50/90 text-violet-700 font-semibold ring-1 ring-inset ring-violet-200 cursor-default';

  const itemIdleClass = isSx
    ? 'text-slate-700 hover:bg-teal-50 hover:text-teal-800 hover:ring-1 hover:ring-inset hover:ring-teal-200'
    : 'text-slate-700 hover:bg-violet-50 hover:text-violet-800 hover:ring-1 hover:ring-inset hover:ring-violet-200';

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
        <div className={`max-w-[11rem] rounded-md px-2 py-1 text-center text-[10px] font-medium leading-snug text-white shadow-lg ${
          isSx ? 'bg-teal-800' : 'bg-violet-800'
        }`}
        >
          {btnTipLabel}
        </div>
        <div
          className={`mx-auto h-0 w-0 border-x-[5px] border-x-transparent border-t-[5px] ${
            isSx ? 'border-t-teal-800' : 'border-t-violet-800'
          }`}
          aria-hidden
        />
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
          onMouseDown={(e) => {
            e.stopPropagation();
            setMenuOpen(false);
            setHoveredStageId(null);
          }}
        />
        <div
          ref={menuRef}
          className={`fixed min-w-[10rem] max-w-[14rem] rounded-lg border bg-white py-1 shadow-xl ${
            isSx ? 'border-teal-200' : 'border-violet-200'
          }`}
          style={{
            zIndex: 99999,
            top: menuPos.top,
            left: menuPos.left,
            visibility: menuPositioned ? 'visible' : 'hidden',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setHoveredStageId(null)}
        >
          <p className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${
            isSx ? 'text-teal-600' : 'text-violet-600'
          }`}
          >
            Chuyển sang cột
          </p>
          {currentStage?.name && (
            <p className="px-2.5 pb-1 text-[10px] text-slate-500 truncate" title={currentStage.name}>
              Đang ở: <span className="font-medium text-slate-700">{currentStage.icon ? `${currentStage.icon} ` : ''}{currentStage.name}</span>
            </p>
          )}
          <ul className="max-h-52 overflow-y-auto [scrollbar-width:thin]">
            {movableStages.map((s) => {
              const isCurrent = String(s.id) === String(currentStageId);
              const isHovered = !isCurrent && String(hoveredStageId) === String(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={isCurrent}
                    className={`w-full text-left px-2.5 py-1.5 text-[11px] truncate transition-all duration-100 ${
                      isCurrent ? itemCurrentClass : (isHovered ? itemHoverClass : itemIdleClass)
                    }`}
                    title={isCurrent ? 'Cột hiện tại' : `Chuyển sang: ${s.name}`}
                    onMouseEnter={() => setHoveredStageId(s.id)}
                    onMouseLeave={() => setHoveredStageId(null)}
                    onClick={(e) => handleMove(s, e)}
                  >
                    <span className="inline-flex items-center gap-1 min-w-0">
                      {s.icon ? <span className="shrink-0">{s.icon}</span> : null}
                      <span className="truncate">{s.name}</span>
                      {isCurrent && (
                        <span className={`shrink-0 text-[9px] font-bold uppercase ${isSx ? 'text-teal-600' : 'text-violet-600'}`}>
                          · hiện tại
                        </span>
                      )}
                      {isHovered && (
                        <span className={`shrink-0 text-[9px] font-bold uppercase ${isSx ? 'text-teal-700' : 'text-violet-700'}`}>
                          →
                        </span>
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
        disabled={disabled || movableStages.length === 0}
        className={btnClass}
        data-kanban-quick-move
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
        <ArrowRightLeft className={iconClass} strokeWidth={2.4} />
      </button>
      {btnTipPortal}
      {menuPortal}
    </>
  );
}
