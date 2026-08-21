import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, HelpCircle, X } from 'lucide-react';

const PANEL_W = 360;
const PANEL_MAX_H = 440;
const GAP = 10;
const MARGIN = 8;

const STEPS = [
  { n: '1', t: 'Bấm Thêm', d: 'Mở form «Giao việc mới».' },
  { n: '2', t: 'Tên việc *', d: 'Viết rõ việc cần làm.' },
  { n: '3', t: 'Việc này vì sao? *', d: 'Chọn loại (khách yêu cầu / NV làm sai…). Có thể tự gán người theo cài đặt.' },
  { n: '4', t: 'Giao cho bộ phận *', d: 'Bán hàng · Xưởng · Lắp đặt.' },
  { n: '5', t: 'Người nhận việc', d: 'Tick người + chọn vai trò (Người chính / Người làm / Theo dõi / Quản lý).' },
  { n: '6', t: 'Giao cho N người', d: 'Lưu — người được chọn nhận việc ngay.' },
];

function clampPanel(left, top, width, height) {
  const maxL = Math.max(MARGIN, window.innerWidth - width - MARGIN);
  const maxT = Math.max(MARGIN, window.innerHeight - height - MARGIN);
  return {
    left: Math.min(maxL, Math.max(MARGIN, left)),
    top: Math.min(maxT, Math.max(MARGIN, top)),
  };
}

/**
 * Nút ? + panel hướng dẫn nổi (gắn lên nút, kéo được).
 * Dùng chung trên CRM / SX / VC (LeadMemberAssignmentsPanel).
 */
export default function SharedWorkspaceAssignHelp({ open, onOpenChange }) {
  const titleId = useId();
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [anchorSide, setAnchorSide] = useState('above'); // above | below
  const [anchorX, setAnchorX] = useState(0); // caret X relative to panel
  const [detached, setDetached] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, left: 0, top: 0, moved: false });

  const placeNearButton = useCallback(() => {
    const btn = btnRef.current;
    const panel = panelRef.current;
    if (!btn) return;
    const br = btn.getBoundingClientRect();
    const pw = panel?.offsetWidth || PANEL_W;
    const ph = panel?.offsetHeight || Math.min(PANEL_MAX_H, 360);
    const spaceAbove = br.top - MARGIN;
    const preferAbove = spaceAbove >= Math.min(ph + GAP, 220);
    let left = br.right - pw;
    let top;
    let side;
    if (preferAbove) {
      top = br.top - ph - GAP;
      side = 'above';
    } else {
      top = br.bottom + GAP;
      side = 'below';
    }
    const next = clampPanel(left, top, pw, ph);
    const caret = br.left + br.width / 2 - next.left;
    setPos(next);
    setAnchorSide(side);
    setAnchorX(Math.min(pw - 20, Math.max(20, caret)));
    setDetached(false);
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    placeNearButton();
    const raf = requestAnimationFrame(() => placeNearButton());
    const onResize = () => {
      if (!dragRef.current.moved) placeNearButton();
      else {
        const panel = panelRef.current;
        const pw = panel?.offsetWidth || PANEL_W;
        const ph = panel?.offsetHeight || PANEL_MAX_H;
        setPos((p) => clampPanel(p.left, p.top, pw, ph));
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [open, placeNearButton]);

  useEffect(() => {
    if (!open) {
      dragRef.current.moved = false;
      return undefined;
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - dragRef.current.x;
      const dy = clientY - dragRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.moved = true;
        setDetached(true);
      }
      const panel = panelRef.current;
      const pw = panel?.offsetWidth || PANEL_W;
      const ph = panel?.offsetHeight || PANEL_MAX_H;
      setPos(clampPanel(dragRef.current.left + dx, dragRef.current.top + dy, pw, ph));
    };
    const onEnd = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [dragging]);

  const onDragStart = (e) => {
    if (e.target.closest('button, a, [data-no-drag]')) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = {
      x: clientX,
      y: clientY,
      left: pos.left,
      top: pos.top,
      moved: dragRef.current.moved,
    };
    setDragging(true);
  };

  const panel = open ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={`fixed z-[90] w-[min(360px,calc(100vw-16px))] max-h-[min(440px,70dvh)] flex flex-col rounded-xl bg-white shadow-xl border border-violet-200 ${
        dragging ? 'cursor-grabbing select-none' : ''
      }`}
      style={{ left: pos.left, top: pos.top }}
    >
      {!detached && (
        <span
          aria-hidden
          className={`pointer-events-none absolute w-3 h-3 bg-white border-violet-200 rotate-45 ${
            anchorSide === 'above'
              ? 'bottom-[-7px] border-r border-b'
              : 'top-[-7px] border-l border-t'
          }`}
          style={{ left: anchorX - 6 }}
        />
      )}

      <div
        data-drag-handle
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        className={`shrink-0 flex items-start justify-between gap-2 px-3 py-2.5 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white rounded-t-xl ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        title="Kéo để di chuyển"
      >
        <div className="flex items-start gap-1.5 min-w-0">
          <GripVertical className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p id={titleId} className="text-xs font-bold text-violet-950 flex items-center gap-1">
              <HelpCircle className="h-3.5 w-3.5 shrink-0 text-violet-600" />
              Tạo việc ở Không gian chung
            </p>
            <p className="text-[10px] text-violet-700/75 mt-0.5">
              CRM · SX · VC/LĐ · kéo thanh này để di chuyển
            </p>
          </div>
        </div>
        <button
          type="button"
          data-no-drag
          onClick={() => onOpenChange(false)}
          className="h-7 w-7 rounded-md inline-flex items-center justify-center text-slate-500 hover:bg-violet-100 hover:text-violet-800 cursor-pointer shrink-0"
          aria-label="Đóng"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5 text-sm text-slate-700">
        <ol className="space-y-1.5 list-none">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-2">
              <span className="h-5 w-5 rounded-full bg-violet-600 text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0 mt-0.5">
                {s.n}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-900 leading-tight">{s.t}</p>
                <p className="text-[10px] text-slate-600 leading-snug">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 space-y-1">
          <p className="text-[10px] font-semibold text-slate-800">Tuỳ chọn</p>
          <ul className="text-[10px] text-slate-600 space-y-0.5 list-disc pl-3.5">
            <li>Ghi chú · Ảnh · Loại việc / hạn · Ưu tiên · Cột</li>
            <li>NV làm sai → «Lỗi xảy ra ở đâu?»</li>
            <li>Nhiều xưởng → «Xưởng nào làm?»</li>
          </ul>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2">
          <p className="text-[10px] font-semibold text-amber-900 mb-0.5">Lưu ý</p>
          <ul className="text-[10px] text-amber-900/90 space-y-0.5 list-disc pl-3.5">
            <li>Cần deal CRM gắn dự án.</li>
            <li>Chưa thấy người: thêm Thành viên / đúng loại việc · bộ phận · xưởng.</li>
          </ul>
        </div>

        <p className="text-[9px] text-slate-500 font-mono bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5 leading-relaxed">
          Không gian chung → Thêm → Tên → Vì sao → Bộ phận → Người → Giao
        </p>
      </div>

      <div className="shrink-0 px-3 py-2 border-t border-slate-100 bg-white rounded-b-xl flex justify-end">
        <button
          type="button"
          data-no-drag
          onClick={() => onOpenChange(false)}
          className="h-8 px-3 rounded-lg text-[11px] font-semibold bg-violet-600 text-white hover:bg-violet-700 cursor-pointer"
        >
          Đã hiểu
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`h-8 w-8 rounded-md inline-flex items-center justify-center cursor-pointer transition-colors ${
          open
            ? 'bg-violet-100 text-violet-700'
            : 'text-slate-400 hover:text-violet-700 hover:bg-violet-50'
        }`}
        title="Hướng dẫn tạo việc"
        aria-label="Hướng dẫn tạo việc"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {open && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </>
  );
}
