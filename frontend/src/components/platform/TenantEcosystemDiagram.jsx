import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../lib/api';
import {
  Network, Users, Building2, ChevronDown, ChevronUp, ChevronRight,
  ZoomIn, ZoomOut, Maximize2, Move, List, GitBranch,
} from 'lucide-react';

function ZoomableCanvas({ children, height = 480 }) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => clamp(z - e.deltaY * 0.002, 0.25, 1.5));
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const onMouseDown = (e) => {
    if (e.target.closest('button')) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    setPan({
      x: panStart.current.x + (e.clientX - dragStart.current.x),
      y: panStart.current.y + (e.clientY - dragStart.current.y),
    });
  };
  const onMouseUp = () => setDragging(false);

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-white/90 backdrop-blur rounded-xl border shadow-sm px-1.5 py-1">
        <button type="button" onClick={() => setZoom((z) => clamp(z - 0.15, 0.25, 1.5))} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer"><ZoomOut className="h-3.5 w-3.5 text-gray-600" /></button>
        <span className="text-[10px] font-mono text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => clamp(z + 0.15, 0.25, 1.5))} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer"><ZoomIn className="h-3.5 w-3.5 text-gray-600" /></button>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <button type="button" onClick={() => { setZoom(0.85); setPan({ x: 0, y: 0 }); }} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer"><Maximize2 className="h-3.5 w-3.5 text-gray-600" /></button>
      </div>
      <div className="absolute bottom-2 left-2 z-20 text-[9px] text-gray-400 bg-white/80 backdrop-blur rounded-lg px-2 py-1 flex items-center gap-1.5">
        <Move className="h-3 w-3" /> Kéo · Ctrl+Scroll zoom
      </div>
      <div
        ref={containerRef}
        className="overflow-hidden rounded-2xl border bg-gray-50/50 bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] bg-[size:20px_20px]"
        style={{ height, cursor: dragging ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'top center',
            transition: dragging ? 'none' : 'transform 0.15s ease',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function OrgChartNode({ node, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(false);
  const has = node.children?.length > 0;
  const c = node.level?.color || '#0d9488';

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative bg-white rounded-xl border-2 shadow-sm min-w-[160px] max-w-[210px]"
        style={{ borderColor: `${c}60` }}
      >
        <div className="h-1.5 rounded-t-[10px]" style={{ backgroundColor: c }} />
        <div className="p-3 text-center">
          <div className="text-xl mb-0.5">{node.level?.icon || '🌐'}</div>
          <h3 className="text-xs font-bold text-gray-900 truncate px-1">{node.name}</h3>
          <div
            className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full mt-1 font-medium"
            style={{ backgroundColor: `${c}15`, color: c }}
          >
            {node.level?.name || 'Đơn vị'}
          </div>
          {node.code && <div className="text-[9px] text-gray-400 font-mono mt-0.5">{node.code}</div>}
          {node.company && (
            <div className="text-[8px] text-green-600 mt-1 flex items-center justify-center gap-0.5">
              <Building2 className="h-3 w-3" /> {node.company.short_name || node.company.name}
            </div>
          )}
          {node.member_count > 0 && (
            <div className="flex items-center justify-center gap-1 mt-1 text-[10px] text-gray-500">
              <Users className="h-3 w-3" /> {node.member_count}
            </div>
          )}
        </div>
        {has && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -bottom-3 right-2 w-5 h-5 bg-gray-100 border rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-200 z-10"
          >
            {collapsed ? <ChevronDown className="h-2.5 w-2.5 text-gray-500" /> : <ChevronUp className="h-2.5 w-2.5 text-gray-500" />}
          </button>
        )}
      </div>
      {has && !collapsed && (
        <>
          <div className="w-px h-5 bg-gray-300" />
          {node.children.length > 1 && (
            <div className="h-px bg-gray-300" style={{ width: Math.max(40, (node.children.length - 1) * 180) }} />
          )}
          <div className="flex gap-3 flex-wrap justify-center">
            {node.children.map((ch) => (
              <div key={ch.id} className="flex flex-col items-center">
                <div className="w-px h-5 bg-gray-300" />
                <OrgChartNode node={ch} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
      {has && collapsed && (
        <div className="mt-2 text-[9px] text-gray-400">{node.children.length} đơn vị con</div>
      )}
    </div>
  );
}

function TreeListRow({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);
  const has = node.children?.length > 0;
  const c = node.level?.color || '#6b7280';

  return (
    <div>
      <button
        type="button"
        onClick={() => has && setOpen(!open)}
        className="w-full flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 text-left"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {has ? (
          open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        ) : <span className="w-3.5 shrink-0" />}
        <span className="text-base shrink-0">{node.level?.icon || '📋'}</span>
        <span className="flex-1 text-sm font-medium text-gray-900 truncate">{node.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0" style={{ backgroundColor: `${c}15`, color: c }}>
          {node.level?.name}
        </span>
        {node.member_count > 0 && (
          <span className="text-xs text-gray-400 shrink-0 flex items-center gap-0.5">
            <Users className="h-3 w-3" />{node.member_count}
          </span>
        )}
      </button>
      {has && open && node.children.map((ch) => (
        <TreeListRow key={ch.id} node={ch} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function TenantEcosystemDiagram({ tenantId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('diagram');

  useEffect(() => {
    if (!tenantId) return undefined;
    let cancelled = false;
    setLoading(true);
    api.get(`/platform/tenants/${tenantId}/ecosystem`)
      .then(({ data: d }) => { if (!cancelled) setData(d); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <div className="animate-spin h-8 w-8 border-3 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const tree = data?.tree || [];
  const orphanCompanies = data?.orphan_companies || [];
  const totalUnits = data?.units?.length || 0;
  const totalCompanies = data?.companies?.length || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Network className="h-4 w-4 text-teal-600" />
            Sơ đồ hệ sinh thái
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {totalUnits} đơn vị · {totalCompanies} công ty
          </p>
        </div>
        <div className="flex rounded-xl border p-0.5 bg-gray-50">
          <button
            type="button"
            onClick={() => setViewMode('diagram')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${viewMode === 'diagram' ? 'bg-white shadow-sm text-teal-700' : 'text-gray-500'}`}
          >
            <GitBranch className="h-3.5 w-3.5" /> Sơ đồ
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${viewMode === 'list' ? 'bg-white shadow-sm text-teal-700' : 'text-gray-500'}`}
          >
            <List className="h-3.5 w-3.5" /> Danh sách
          </button>
        </div>
      </div>

      {tree.length === 0 ? (
        <div className="bg-white border rounded-2xl py-16 text-center text-gray-400">
          <Network className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Chưa có cấu trúc đơn vị hệ sinh thái</p>
          {totalCompanies > 0 && (
            <p className="text-xs mt-1">{totalCompanies} công ty chưa gắn vào sơ đồ đơn vị</p>
          )}
        </div>
      ) : viewMode === 'diagram' ? (
        <ZoomableCanvas height={520}>
          <div className="min-w-fit flex flex-col items-center p-8 gap-8">
            {tree.map((root) => (
              <OrgChartNode key={root.id} node={root} />
            ))}
          </div>
        </ZoomableCanvas>
      ) : (
        <div className="bg-white border rounded-2xl p-2 divide-y">
          {tree.map((root) => (
            <TreeListRow key={root.id} node={root} />
          ))}
        </div>
      )}

      {orphanCompanies.length > 0 && (
        <div className="bg-white border rounded-2xl p-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gray-500" />
            Công ty chưa gắn đơn vị ({orphanCompanies.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {orphanCompanies.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border text-xs text-gray-700">
                <Building2 className="h-3 w-3 text-green-600" />
                {c.short_name || c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
