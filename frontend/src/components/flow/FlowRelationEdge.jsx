import { memo, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { GitFork, Plus, Puzzle, ShieldCheck } from 'lucide-react';
import { PALETTE_MIME } from '../../lib/flowGraphModel';

const EDGE_COLOR = '#296DFF';
const PARALLEL_COLOR = '#7c3aed';

/**
 * Cạnh của luồng module: nét đứt tím khi node nguồn chạy song song,
 * nhãn hiển thị quan hệ (1-1 / 1-N / N-1 / N-N) và số điều kiện gắn trên cạnh.
 * Dấu + trên nhãn (hoặc kéo module từ palette thả vào cạnh) sẽ chèn node vào giữa.
 */
const FlowRelationEdge = memo(function FlowRelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const branchMode = data?.branch_mode || 'sequential';
  const isParallel = branchMode === 'parallel';
  const isConditional = branchMode === 'conditional';
  const conditionCount = data?.condition_count || 0;
  const cardinality = data?.cardinality || '1-1';
  const color = isParallel ? PARALLEL_COLOR : EDGE_COLOR;

  const insertable = (data?.availableModules || []).filter((m) => m.key);
  const canInsert = Boolean(data?.onInsert) && insertable.length > 0;

  const pickInsert = (moduleKey) => {
    setMenuOpen(false);
    data.onInsert(id, moduleKey);
  };

  // Cả dải cạnh lẫn cụm nhãn đều nhận thả để người dùng không phải nhắm quá sát.
  const dropHandlers = data?.onInsert
    ? {
      onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropHover(true);
      },
      onDragLeave: () => setDropHover(false),
      onDrop: (e) => {
        const moduleKey = e.dataTransfer.getData(PALETTE_MIME);
        setDropHover(false);
        if (!moduleKey) return;
        // Chặn nổi bọt để canvas không tạo thêm một node rời ở chỗ thả.
        e.preventDefault();
        e.stopPropagation();
        data.onInsert(id, moduleKey);
      },
    }
    : {};

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: dropHover ? '#16a34a' : color,
          strokeWidth: dropHover ? 4 : selected ? 3 : 2,
          strokeDasharray: isParallel ? '7 5' : undefined,
          opacity: selected ? 1 : 0.9,
        }}
      />
      {/* Dải trong suốt rộng hơn để bắt thao tác kéo-thả module vào giữa cạnh. */}
      {data?.onInsert && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={26}
          style={{ pointerEvents: 'stroke' }}
          {...dropHandlers}
        />
      )}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex items-center gap-1"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          {...dropHandlers}
        >
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold tracking-tight shadow-sm ${
              selected ? 'ring-2 ring-offset-1' : ''
            }`}
            style={{
              borderColor: `${color}55`,
              background: '#fff',
              color,
              ...(selected ? { '--tw-ring-color': `${color}66` } : {}),
            }}
          >
            {cardinality}
          </span>
          {isParallel && (
            <span
              className="flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold shadow-sm"
              style={{ borderColor: `${PARALLEL_COLOR}44`, background: '#fff', color: PARALLEL_COLOR }}
              title="Node nguồn mở các nhánh sau cùng lúc"
            >
              <GitFork className="h-2.5 w-2.5" />
              Song song
            </span>
          )}
          {isConditional && !conditionCount && (
            <span
              className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 shadow-sm"
              title="Node nguồn rẽ theo điều kiện nhưng cạnh này chưa có điều kiện nào"
            >
              Thiếu điều kiện
            </span>
          )}
          {conditionCount > 0 && (
            <span
              className="flex items-center gap-0.5 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 shadow-sm"
              title={`${conditionCount} điều kiện phải thoả để đi cạnh này`}
            >
              <ShieldCheck className="h-2.5 w-2.5" />
              {conditionCount}
            </span>
          )}
          {data?.label && (
            <span className="max-w-[140px] truncate rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-600 shadow-sm">
              {data.label}
            </span>
          )}
          {canInsert && (
            <div className="relative">
              <button
                type="button"
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 border-white shadow-md transition-colors cursor-pointer ${
                  menuOpen ? 'bg-[#296DFF] text-white' : 'bg-white text-[#296DFF] hover:bg-[#296DFF] hover:text-white'
                }`}
                title="Chèn một module vào giữa hai node này"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
              >
                <Plus className="h-3 w-3" strokeWidth={2.6} />
              </button>
              {menuOpen && (
                <div
                  className="nowheel absolute left-1/2 top-7 z-50 max-h-56 w-48 -translate-x-1/2 overflow-y-auto rounded-xl bg-white p-1.5 shadow-[0_8px_28px_rgba(15,23,42,0.16)] ring-1 ring-slate-200/90"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-0.5 flex items-center justify-between px-2 py-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Chèn vào giữa</p>
                    <button
                      type="button"
                      className="cursor-pointer text-[10px] text-slate-400 hover:text-slate-600"
                      onClick={() => setMenuOpen(false)}
                    >
                      Ẩn
                    </button>
                  </div>
                  {insertable.map((m) => {
                    const MIcon = m.Icon || Puzzle;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => pickInsert(m.key)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] text-white"
                          style={{ background: m.color }}
                        >
                          {m.emoji ? <span>{m.emoji}</span> : <MIcon className="h-3 w-3" />}
                        </span>
                        <span className="truncate text-[12px] font-medium text-slate-700">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

export default FlowRelationEdge;
