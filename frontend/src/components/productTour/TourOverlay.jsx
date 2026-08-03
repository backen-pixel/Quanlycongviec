import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Cao hơn AnchoredDropdownMenu (z-99990) và modal Lead (z-10050) */
const Z = 100050;

function adaptivePad(rect) {
  if (!rect) return 6;
  const minSide = Math.min(rect.width, rect.height);
  if (minSide < 28) return 10;
  if (minSide < 48) return 8;
  if (rect.width * rect.height > 120000) return 4;
  return 6;
}

/**
 * Overlay spotlight: 4 vùng tối quanh target để click xuyên lỗ vào nút thật.
 */
export default function TourOverlay({
  step,
  stepIndex,
  total,
  rect,
  missing,
  onNext,
  onSkip,
  isLast,
}) {
  const hole = useMemo(() => {
    if (!rect) return null;
    const pad = adaptivePad(rect);
    const top = Math.max(0, rect.top - pad);
    const left = Math.max(0, rect.left - pad);
    const width = Math.max(0, rect.width + pad * 2);
    const height = Math.max(0, rect.height + pad * 2);
    return { top, left, width, height, bottom: top + height, right: left + width };
  }, [rect]);

  const { tooltipStyle, arrow } = useMemo(() => {
    if (!hole) {
      return {
        tooltipStyle: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
        arrow: null,
      };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipW = 320;
    const tipH = 210;
    const gap = 14;
    const prefer = step?.placement; // 'left' | 'right' | 'top' | 'bottom'

    const hx = hole.left + hole.width / 2;
    const hy = hole.top + hole.height / 2;

    /** @type {'left'|'right'|'top'|'bottom'} */
    let side = prefer || (hx > vw * 0.55 ? 'left' : 'bottom');

    let left;
    let top;

    const tryPlace = (s) => {
      if (s === 'left') {
        left = hole.left - tipW - gap;
        top = Math.min(Math.max(12, hole.top), vh - tipH - 12);
        if (left < 12) return false;
      } else if (s === 'right') {
        left = hole.right + gap;
        top = Math.min(Math.max(12, hole.top), vh - tipH - 12);
        if (left + tipW > vw - 12) return false;
      } else if (s === 'top') {
        left = Math.min(Math.max(12, hx - tipW / 2), vw - tipW - 12);
        top = hole.top - tipH - gap;
        if (top < 12) return false;
      } else {
        left = Math.min(Math.max(12, hx - tipW / 2), vw - tipW - 12);
        top = hole.bottom + gap;
        if (top + tipH > vh - 12) return false;
      }
      return true;
    };

    const order = prefer
      ? [prefer, 'bottom', 'top', 'left', 'right']
      : (hx > vw * 0.55 ? ['left', 'bottom', 'top', 'right'] : ['bottom', 'top', 'right', 'left']);

    side = order.find((s) => tryPlace(s)) || 'bottom';
    if (!tryPlace(side)) {
      left = Math.min(Math.max(12, hole.left), vw - tipW - 12);
      top = Math.min(Math.max(12, hole.bottom + gap), vh - tipH - 12);
      side = 'bottom';
    }
    left = Math.min(Math.max(12, left), vw - tipW - 12);
    top = Math.min(Math.max(12, top), vh - tipH - 12);

    // Mũi tên hướng về tâm lỗ
    let arrowStyle = null;
    const ax = Math.min(Math.max(hx, left + 16), left + tipW - 16);
    const ay = Math.min(Math.max(hy, top + 16), top + tipH - 16);
    if (side === 'bottom') {
      arrowStyle = {
        top: -6,
        left: ax - left - 6,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderBottom: '6px solid #fff',
      };
    } else if (side === 'top') {
      arrowStyle = {
        bottom: -6,
        left: ax - left - 6,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: '6px solid #fff',
      };
    } else if (side === 'left') {
      arrowStyle = {
        right: -6,
        top: Math.min(Math.max(ay - top - 6, 12), tipH - 24),
        borderTop: '6px solid transparent',
        borderBottom: '6px solid transparent',
        borderLeft: '6px solid #fff',
      };
    } else if (side === 'right') {
      arrowStyle = {
        left: -6,
        top: Math.min(Math.max(ay - top - 6, 12), tipH - 24),
        borderTop: '6px solid transparent',
        borderBottom: '6px solid transparent',
        borderRight: '6px solid #fff',
      };
    }

    return {
      tooltipStyle: { top, left, width: tipW },
      arrow: arrowStyle,
    };
  }, [hole, step?.placement]);

  const dim = 'bg-slate-900/55';
  const advanceOnClick = step?.advanceOn === 'target-click' && !missing && hole;

  const overlay = (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: Z }}
      aria-modal="true"
      role="dialog"
      aria-label="Hướng dẫn từng bước"
      data-product-tour-overlay
    >
      {hole ? (
        <>
          <div className={`fixed ${dim} pointer-events-auto`} style={{ top: 0, left: 0, right: 0, height: hole.top, zIndex: Z }} />
          <div className={`fixed ${dim} pointer-events-auto`} style={{ top: hole.bottom, left: 0, right: 0, bottom: 0, zIndex: Z }} />
          <div className={`fixed ${dim} pointer-events-auto`} style={{ top: hole.top, left: 0, width: hole.left, height: hole.height, zIndex: Z }} />
          <div className={`fixed ${dim} pointer-events-auto`} style={{ top: hole.top, left: hole.right, right: 0, height: hole.height, zIndex: Z }} />
          <div
            className="fixed rounded-xl pointer-events-none product-tour-ring"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              zIndex: Z + 1,
              boxShadow: '0 0 0 3px rgba(56,189,248,0.95), 0 0 0 6px rgba(56,189,248,0.25), 0 0 28px rgba(56,189,248,0.4)',
            }}
          />
          <style>{`
            @keyframes product-tour-pulse {
              0%, 100% { box-shadow: 0 0 0 3px rgba(56,189,248,0.95), 0 0 0 6px rgba(56,189,248,0.22), 0 0 24px rgba(56,189,248,0.35); }
              50% { box-shadow: 0 0 0 4px rgba(14,165,233,1), 0 0 0 10px rgba(56,189,248,0.18), 0 0 32px rgba(14,165,233,0.45); }
            }
            .product-tour-ring { animation: product-tour-pulse 1.6s ease-in-out infinite; }
          `}</style>
        </>
      ) : (
        <div className={`fixed inset-0 ${dim} pointer-events-auto`} style={{ zIndex: Z }} />
      )}

      <div
        className="fixed rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 text-left pointer-events-auto"
        style={{ ...tooltipStyle, zIndex: Z + 2 }}
      >
        {arrow && (
          <span
            className="absolute w-0 h-0 pointer-events-none"
            style={arrow}
            aria-hidden
          />
        )}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">
              Bước {stepIndex + 1}/{total}
            </p>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5">{step?.title}</h3>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="Bỏ qua hướng dẫn"
            title="Bỏ qua (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed mb-3">{step?.body}</p>
        {missing && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-3">
            {step?.missingHint || 'Không tìm thấy vị trí trên màn hình. Bấm Tiếp để bỏ qua bước này.'}
          </p>
        )}
        {advanceOnClick && (
          <p className="text-xs text-sky-700 mb-3 font-medium">Bấm đúng vùng được khoanh sáng để tiếp tục.</p>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="h-9 px-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Bỏ qua
          </button>
          {(step?.advanceOn === 'next' || missing || isLast) && (
            <button
              type="button"
              onClick={onNext}
              className="h-9 px-3.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 cursor-pointer"
            >
              {isLast ? 'Xong' : 'Tiếp'}
            </button>
          )}
          {advanceOnClick && !isLast && (
            <button
              type="button"
              onClick={onNext}
              className="h-9 px-3 rounded-lg text-sm font-medium text-sky-700 hover:bg-sky-50 cursor-pointer"
            >
              Tiếp
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
}
