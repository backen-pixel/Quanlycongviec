/**
 * Preview dieline 2D: thông tin khổ/khuôn rõ · lăn chuột zoom · kéo pan.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { downloadSvg } from '../../lib/rigidBoxDieline';

function matLabel(m) {
  if (m === 'wrapping') return 'Giấy bọc';
  if (m === 'connection') return 'Connection';
  if (m === 'carton') return 'Carton';
  return 'Hardboard';
}

function sheetTypeLabel(type, material) {
  if (type === 'paper') return 'Giấy bồi';
  if (type === 'chipboard') return 'Chipboard';
  if (type === 'custom') return 'Khổ tùy chỉnh';
  return matLabel(material);
}

function shortPartName(label, id) {
  const s = String(label || id || '')
    .replace(/Hard board paper of /i, '')
    .replace(/\(.*?\)/g, '')
    .trim();
  if (/lid|nắp|nap/i.test(s)) return 'Nắp';
  if (/base|đáy|day/i.test(s)) return 'Đáy';
  return s || 'Blank';
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function UtilBar({ value, tone = 'sky' }) {
  const v = Math.min(100, Math.max(0, Number(value) || 0));
  const bar =
    tone === 'amber'
      ? 'bg-amber-500'
      : tone === 'violet'
        ? 'bg-violet-500'
        : tone === 'emerald'
          ? 'bg-emerald-500'
          : 'bg-sky-500';
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${bar}`} style={{ width: `${v}%` }} />
    </div>
  );
}

export default function RigidBoxDielineSvg({
  title,
  svg,
  filename,
  blank,
  areaCm2,
  sheet,
  nest,
  material,
  faces = [],
  large = false,
  copiesMode = 'auto',
  copiesPerSheet = null,
  copiesByPart = null,
  onCopiesModeChange,
  onCopiesPerSheetChange,
  onCopiesByPartChange,
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  viewRef.current = { zoom, pan };

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const bumpZoom = useCallback((delta) => {
    setZoom((z) => clamp(Math.round((z + delta) * 100) / 100, 0.25, 4));
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const { zoom: z0, pan: p0 } = viewRef.current;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const z1 = clamp(Math.round(z0 * factor * 100) / 100, 0.25, 4);
      if (z1 === z0) return;
      const scale = z1 / z0;
      setZoom(z1);
      setPan({
        x: mx - (mx - p0.x) * scale,
        y: my - (my - p0.y) * scale,
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({
      x: d.panX + (e.clientX - d.x),
      y: d.panY + (e.clientY - d.y),
    });
  };

  const onPointerUp = (e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  if (!svg) return null;

  const area = Number(areaCm2) || Number(blank?.w || 0) * Number(blank?.h || 0);
  const sheetInfo = sheet || nest?.sheet;
  const util = nest?.util;
  const maxCopies = nest?.maxCopies ?? nest?.partNests?.[0]?.maxCopies ?? 0;
  const copies = nest?.copies ?? nest?.partNests?.[0]?.copies ?? 0;
  const partLines = nest?.partNests || [];
  const sheetArea = sheetInfo?.areaCm2 || (sheetInfo ? sheetInfo.w * sheetInfo.h : 0);
  const typeName = sheetTypeLabel(sheetInfo?.type, material);
  const sheetName = sheetInfo?.label || sheetInfo?.id || typeName;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => bumpZoom(-0.15)}
                className="p-1.5 hover:bg-gray-50 text-gray-700"
                title="Thu nhỏ"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 py-1 text-[11px] tabular-nums text-gray-600 border-x border-gray-200 min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => bumpZoom(0.15)}
                className="p-1.5 hover:bg-gray-50 text-gray-700"
                title="Phóng to"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={resetView}
                className="p-1.5 hover:bg-gray-50 text-gray-500 border-l border-gray-200"
                title="Về 100% · giữa khung"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => downloadSvg(svg, filename)}
              className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded-md border border-gray-200 bg-white"
            >
              <Download className="h-3.5 w-3.5" />
              SVG
            </button>
          </div>
        </div>

        {/* Khổ giấy — banner dễ đọc */}
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white overflow-hidden">
          <div className="flex flex-wrap items-stretch gap-0 divide-y sm:divide-y-0 sm:divide-x divide-sky-100">
            <div className="flex-1 min-w-[160px] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600">Khổ giấy / khuôn</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 leading-tight">
                {sheetInfo ? (
                  <>
                    {sheetInfo.w}
                    <span className="text-sky-400 mx-0.5">×</span>
                    {sheetInfo.h}
                    <span className="text-sm font-semibold text-slate-500 ml-1">cm</span>
                  </>
                ) : (
                  '—'
                )}
              </p>
              <p className="mt-1 text-xs text-slate-600 truncate" title={sheetName}>
                <span className="inline-flex items-center rounded bg-sky-100 text-sky-800 px-1.5 py-0.5 text-[10px] font-semibold mr-1.5">
                  {typeName}
                </span>
                {sheetName}
              </p>
            </div>

            <div className="w-full sm:w-auto sm:min-w-[120px] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Diện tích khổ</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                {sheetArea ? Math.round(sheetArea) : '—'}
                <span className="text-xs font-semibold text-slate-500 ml-1">cm²</span>
              </p>
              <p className="text-[11px] tabular-nums text-slate-500">
                {sheetArea ? `${(sheetArea / 10000).toFixed(4)} m²` : ''}
              </p>
            </div>

            <div className="w-full sm:w-auto sm:min-w-[130px] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">Bản / khổ</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-violet-950">
                {copies}
                <span className="text-sm font-semibold text-violet-600"> / {maxCopies || '—'}</span>
              </p>
              <p className="text-[11px] text-violet-700">đang xếp / tối đa</p>
            </div>

            <div className="w-full sm:flex-1 sm:min-w-[140px] px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Chiếm khổ</p>
                <p className="text-lg font-bold tabular-nums text-amber-950">{util != null ? `${util}%` : '—'}</p>
              </div>
              <div className="mt-1.5">
                <UtilBar value={util} tone="amber" />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Blank {Math.round(area)} cm²
                {faces?.length ? ` · ${faces.join(' · ')}` : ''}
              </p>
            </div>
          </div>

          {partLines.length > 0 ? (
            <div className="border-t border-sky-100 bg-white/70 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Số lượng từng mặt / blank trên khổ
                </p>
                {onCopiesModeChange ? (
                  <div className="flex rounded-md border border-gray-200 overflow-hidden text-[11px]">
                    <button
                      type="button"
                      onClick={() => onCopiesModeChange('auto')}
                      className={`px-2 py-1 ${
                        copiesMode === 'auto' ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Đầy khổ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onCopiesModeChange('manual');
                        if (onCopiesByPartChange) {
                          const next = { ...(copiesByPart || {}) };
                          for (const p of partLines) {
                            if (next[p.id] == null) next[p.id] = p.copies || p.maxCopies || 1;
                          }
                          onCopiesByPartChange(next);
                        } else if (onCopiesPerSheetChange && (copiesPerSheet == null || copiesPerSheet <= 0)) {
                          onCopiesPerSheetChange(copies || maxCopies || 1);
                        }
                      }}
                      className={`px-2 py-1 border-l border-gray-200 ${
                        copiesMode === 'manual' ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Tùy chỉnh
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {partLines.map((p) => {
                  const name = shortPartName(p.label, p.id);
                  const bw = p.blank?.w;
                  const bh = p.blank?.h;
                  const editable = copiesMode === 'manual' && !!onCopiesByPartChange;
                  const qty = editable
                    ? copiesByPart?.[p.id] ?? p.copies ?? 1
                    : p.copies;
                  const setQty = (raw) => {
                    if (!onCopiesByPartChange) return;
                    const v = Math.max(1, Math.min(p.maxCopies || 1, Math.floor(Number(raw) || 1)));
                    onCopiesByPartChange({ ...(copiesByPart || {}), [p.id]: v });
                    onCopiesModeChange?.('manual');
                  };
                  return (
                    <div
                      key={p.id || name}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800 truncate">{name}</span>
                        {editable ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              className="w-7 h-7 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-bold"
                              onClick={() => setQty((qty || 1) - 1)}
                              disabled={(qty || 1) <= 1}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={Math.max(p.maxCopies || 1, 1)}
                              value={qty}
                              onChange={(e) => setQty(e.target.value)}
                              className="w-12 h-7 rounded-md border border-violet-300 text-center text-sm font-bold tabular-nums text-violet-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                            />
                            <button
                              type="button"
                              className="w-7 h-7 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-bold"
                              onClick={() => setQty((qty || 1) + 1)}
                              disabled={(qty || 1) >= (p.maxCopies || 1)}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-bold tabular-nums text-violet-800 shrink-0">
                            {p.copies}/{p.maxCopies} bản
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] tabular-nums text-slate-500 mt-1">
                        Blank {bw && bh ? `${bw}×${bh} cm` : '—'}
                        {p.cols && p.rows ? ` · lưới ${p.cols}×${p.rows}` : ''}
                        {' · '}
                        max {p.maxCopies} bản
                        {p.util != null ? ` · ${p.util}%` : ''}
                      </p>
                      <div className="mt-1">
                        <UtilBar value={p.util} tone="violet" />
                      </div>
                    </div>
                  );
                })}
              </div>
              {copiesMode === 'auto' ? (
                <p className="text-[11px] text-slate-500 mt-1.5">Đang xếp đầy khổ · bấm Tùy chỉnh để nhập số bản từng mặt</p>
              ) : (
                <p className="text-[11px] text-violet-700 mt-1.5">Đang dùng số bản tùy chỉnh cho từng mặt (không vượt max)</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`relative overflow-hidden select-none touch-none ${
          large ? 'min-h-[420px] h-[560px] max-h-[720px] bg-[#e8ecf1]' : 'h-72 bg-[#f4f6f8]'
        } ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Lăn chuột: phóng to/thu nhỏ · Kéo thả: di chuyển"
      >
        {/* Overlay khổ trên canvas */}
        {sheetInfo ? (
          <div className="absolute top-2 left-2 z-10 pointer-events-none max-w-[min(100%-1rem,280px)]">
            <div className="rounded-lg border border-slate-700/20 bg-slate-900/85 text-white shadow-md px-2.5 py-1.5 backdrop-blur-sm">
              <p className="text-[10px] font-medium text-sky-200 uppercase tracking-wide">Khổ đang xem</p>
              <p className="text-sm font-bold tabular-nums leading-tight">
                {sheetInfo.w} × {sheetInfo.h} cm
              </p>
              <p className="text-[10px] text-slate-300 truncate">
                {typeName} · {copies}/{maxCopies} bản · {util != null ? `${util}%` : '—'}
              </p>
            </div>
          </div>
        ) : null}

        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          <div
            className="bg-white border border-gray-200 shadow-sm rounded-md p-3 [&_svg]:w-full [&_svg]:h-auto pointer-events-none"
            style={{ width: large ? 720 : 420 }}
            dangerouslySetInnerHTML={{ __html: svg.replace(/^<\?xml[^>]*>\s*/i, '') }}
          />
        </div>
        <p className="absolute bottom-2 right-2 text-[10px] text-gray-500 bg-white/90 border border-gray-200 rounded px-1.5 py-0.5 pointer-events-none">
          Lăn chuột · kéo di chuyển
        </p>
      </div>
    </div>
  );
}
