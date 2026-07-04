import {
  createContext,
  useContext,
  useState,
  useMemo,
  useRef,
  useLayoutEffect,
  useCallback,
  useEffect,
} from 'react';
import {
  Plus, ChevronDown, ChevronRight, Users, Network, Building2, Layers, GitBranch,
} from 'lucide-react';

const OrgChartContext = createContext(null);

const LEVEL_META = [
  { accent: '#4f46e5', label: 'Ban lãnh đạo', Icon: CrownIcon },
  { accent: '#7c3aed', label: 'Khối', Icon: Layers },
  { accent: '#059669', label: 'Công ty', Icon: Building2 },
  { accent: '#d97706', label: 'Phòng ban', Icon: Network },
  { accent: '#db2777', label: 'Đội nhóm', Icon: GitBranch },
];

function CrownIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M3 18h18M5 18V9l4 3 3-6 3 6 4-3v9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function collectBranchIds(nodes, out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const node of nodes) {
    if (node.children?.length) {
      out.push(node.id);
      collectBranchIds(node.children, out);
    }
  }
  return out;
}

function resolveMeta(node) {
  const depth = Math.max(0, node.level?.depth ?? 0);
  const base = LEVEL_META[Math.min(depth, LEVEL_META.length - 1)];
  const color = node.level?.color;
  if (color && /^#[0-9a-f]{3,8}$/i.test(color)) {
    return { ...base, accent: color };
  }
  return base;
}

/** Thẻ ngang — phong cách lane / flow chart. */
function OrgNodeCard({
  node,
  meta,
  isAdmin,
  onSelect,
  onAddChild,
  collapsed,
  onToggleCollapse,
  hasChildren,
  childCount,
  depthLimited = false,
}) {
  const depth = node.level?.depth ?? 0;
  const LevelIcon = meta.Icon;

  return (
    <div className="relative group/card">
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className="ecosystem-org-card flex items-stretch gap-0 min-w-[168px] max-w-[260px] rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200/90 text-left shadow-[0_2px_12px_rgba(15,23,42,0.06)] hover:shadow-[0_8px_28px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 overflow-hidden"
      >
        <div
          className="w-1 shrink-0"
          style={{ background: `linear-gradient(180deg, ${meta.accent}, ${meta.accent}88)` }}
        />
        <div className="flex-1 min-w-0 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <div
              className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${meta.accent}14`, color: meta.accent }}
            >
              {node.level?.icon ? (
                <span className="text-base leading-none">{node.level.icon}</span>
              ) : (
                <LevelIcon className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p
                className={`font-semibold text-slate-900 leading-snug truncate ${
                  depth === 0 ? 'text-sm' : 'text-[12px]'
                }`}
                title={node.name}
              >
                {node.name}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                {node.level?.name || meta.label}
                {node.code ? ` · ${node.code}` : ''}
              </p>
            </div>
          </div>

          {(node.member_count > 0 || node.company?.name || hasChildren) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
              {hasChildren && (
                depthLimited ? (
                  <span
                    className="inline-flex items-center gap-1 text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md"
                    title="Tăng số cấp hiển thị trên toolbar để xem nhánh này"
                  >
                    +{childCount} con (ẩn)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCollapse();
                    }}
                    className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md border transition-colors cursor-pointer ${
                      collapsed
                        ? 'text-indigo-700 bg-indigo-50 border-indigo-100 hover:bg-indigo-100'
                        : 'text-slate-600 bg-slate-50 border-slate-100 hover:bg-slate-100'
                    }`}
                    title={collapsed ? 'Mở nhánh con' : 'Thu nhánh con'}
                  >
                    {collapsed
                      ? <ChevronRight className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />}
                    {childCount} con
                  </button>
                )
              )}
              {node.member_count > 0 && (
                <span className="inline-flex items-center gap-1 text-[9px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded-md">
                  <Users className="w-3 h-3" />
                  {node.member_count}
                </span>
              )}
              {node.company?.name && (
                <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md truncate max-w-full">
                  {node.company.name}
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      <div className="absolute -top-2 -right-2 flex items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover/card:opacity-100 transition-opacity z-10">
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            className="w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 cursor-pointer"
            title={collapsed ? 'Mở nhánh' : 'Thu nhánh'}
          >
            {collapsed
              ? <ChevronRight className="w-3 h-3 text-slate-600" />
              : <ChevronDown className="w-3 h-3 text-slate-600" />}
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(node.id);
            }}
            className="w-6 h-6 rounded-full bg-indigo-600 text-white shadow-sm flex items-center justify-center hover:bg-indigo-700 cursor-pointer"
            title="Thêm đơn vị con"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Vẽ bus ngang nối các cột con (SVG đo theo DOM). */
function OrgChildrenRow({ nodes, renderChild, compact }) {
  const rowRef = useRef(null);
  const [bus, setBus] = useState(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || nodes.length < 2) {
      setBus(null);
      return undefined;
    }

    const measure = () => {
      const anchors = row.querySelectorAll('[data-org-junction]');
      if (anchors.length < 2) return;
      const rowRect = row.getBoundingClientRect();
      const first = anchors[0].getBoundingClientRect();
      const last = anchors[anchors.length - 1].getBoundingClientRect();
      setBus({
        w: rowRect.width,
        x1: first.left + first.width / 2 - rowRect.left,
        x2: last.left + last.width / 2 - rowRect.left,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [nodes.length, compact]);

  const stemH = compact ? 24 : 32;
  const dropH = compact ? 18 : 24;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-px bg-gradient-to-b from-slate-300 to-slate-200" style={{ height: stemH }} />

      <div
        ref={rowRef}
        className={`relative flex items-start justify-center px-3 ${compact ? 'gap-3' : 'gap-6'}`}
      >
        {bus && (
          <svg
            className="absolute left-0 top-0 pointer-events-none overflow-visible"
            width={bus.w}
            height={dropH}
            aria-hidden
          >
            <line
              x1={bus.x1}
              y1={1}
              x2={bus.x2}
              y2={1}
              stroke="#cbd5e1"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        )}

        {nodes.map((child) => {
          const accent = resolveMeta(child).accent;
          return (
            <div key={child.id} className="flex flex-col items-center">
              <div
                data-org-junction
                className="flex flex-col items-center"
                style={{ height: dropH }}
              >
                <div className="w-px flex-1 bg-gradient-to-b from-slate-300 to-slate-200" />
                <div
                  className="w-2 h-2 rounded-full border-2 border-white shadow-sm shrink-0"
                  style={{ backgroundColor: accent }}
                />
              </div>
              {renderChild(child)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrgBranch({ node, onSelect, onAddChild, isAdmin, depth = 0 }) {
  const ctx = useContext(OrgChartContext);
  const meta = useMemo(() => resolveMeta(node), [node]);
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const collapsed = ctx?.collapsedIds?.has(node.id) ?? false;
  const maxDepth = ctx?.maxDepth ?? null;
  const compact = ctx?.compact ?? false;
  const depthLimited = maxDepth != null && depth >= maxDepth - 1;
  const showChildren = hasChildren && !collapsed && !depthLimited;

  const onToggleCollapse = () => ctx?.toggleCollapse?.(node.id);

  return (
    <div className="flex flex-col items-center">
      <OrgNodeCard
        node={node}
        meta={meta}
        isAdmin={isAdmin}
        onSelect={onSelect}
        onAddChild={onAddChild}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        hasChildren={hasChildren}
        childCount={children.length}
        depthLimited={depthLimited}
      />

      {showChildren && (
        children.length === 1 ? (
          <div className="flex flex-col items-center">
            <div className={`w-px bg-gradient-to-b from-slate-300 to-slate-200 ${compact ? 'h-5' : 'h-7'}`} />
            <div
              className="w-2 h-2 rounded-full border-2 border-white shadow-sm mb-1"
              style={{ backgroundColor: resolveMeta(children[0]).accent }}
            />
            <OrgBranch
              node={children[0]}
              onSelect={onSelect}
              onAddChild={onAddChild}
              isAdmin={isAdmin}
              depth={depth + 1}
            />
          </div>
        ) : (
          <OrgChildrenRow
            nodes={children}
            compact={compact}
            renderChild={(child) => (
              <OrgBranch
                node={child}
                onSelect={onSelect}
                onAddChild={onAddChild}
                isAdmin={isAdmin}
                depth={depth + 1}
              />
            )}
          />
        )
      )}
    </div>
  );
}

function OrgChartLegend() {
  return (
    <div className="ecosystem-org-legend">
      {LEVEL_META.map((item) => (
        <span key={item.label} className="ecosystem-org-legend__item">
          <span className="ecosystem-org-legend__dot" style={{ backgroundColor: item.accent }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Sơ đồ cấu trúc công ty — flex tree + SVG bus connectors + thẻ ngang.
 * @param {number|null} maxDepth — số cấp hiển thị từ gốc (null = tất cả)
 * @param {boolean} compact — khoảng cách nhánh gọn hơn
 * @param {number} expandAllSignal — tăng để mở tất cả nhánh
 * @param {number} collapseAllSignal — tăng để thu tất cả nhánh
 */
export default function EcosystemOrgChart({
  tree,
  onSelect,
  onAddChild,
  isAdmin,
  maxDepth = null,
  compact = false,
  expandAllSignal = 0,
  collapseAllSignal = 0,
}) {
  const branchIds = useMemo(() => collectBranchIds(tree), [tree]);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());

  useEffect(() => {
    setCollapsedIds(new Set());
  }, [tree]);

  useEffect(() => {
    if (expandAllSignal > 0) setCollapsedIds(new Set());
  }, [expandAllSignal]);

  useEffect(() => {
    if (collapseAllSignal > 0) setCollapsedIds(new Set(branchIds));
  }, [collapseAllSignal, branchIds]);

  const toggleCollapse = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const ctx = useMemo(
    () => ({ collapsedIds, toggleCollapse, maxDepth, compact }),
    [collapsedIds, toggleCollapse, maxDepth, compact],
  );

  if (!tree?.length) return null;

  return (
    <OrgChartContext.Provider value={ctx}>
      <div className={`ecosystem-org-flow ${compact ? 'ecosystem-org-flow--compact' : ''}`}>
        <div className="ecosystem-org-flow__canvas">
          {tree.map((root) => (
            <OrgBranch
              key={root.id}
              node={root}
              onSelect={onSelect}
              onAddChild={onAddChild}
              isAdmin={isAdmin}
              depth={0}
            />
          ))}
        </div>
        <OrgChartLegend />
      </div>
    </OrgChartContext.Provider>
  );
}

export { OrgChartLegend };
