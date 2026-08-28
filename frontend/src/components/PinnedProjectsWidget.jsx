import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Pin, X, ChevronDown, ChevronUp, CheckCircle2, Clock, AlertTriangle, Minimize2, Maximize2, GripVertical, Square, CheckSquare } from 'lucide-react';
import useDraggable from '../hooks/useDraggable';

const STORAGE_KEY = 'tubep_pinned_projects';

function getPinnedIds() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function setPinnedIds(ids) { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); }

export function togglePin(projectId) {
  const ids = getPinnedIds();
  const next = ids.includes(projectId) ? ids.filter(id => id !== projectId) : [...ids, projectId];
  setPinnedIds(next);
  window.dispatchEvent(new CustomEvent('pinned-changed'));
  return next.includes(projectId);
}
export function isPinned(projectId) { return getPinnedIds().includes(projectId); }

export default function PinnedProjectsWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [pinnedIds, _setPinnedIds] = useState(getPinnedIds);
  const [projects, setProjects] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const { pos, dragging, onDragStart, didDrag } = useDraggable('pinned', { right: 24, bottom: 24 });

  useEffect(() => {
    const handler = () => _setPinnedIds(getPinnedIds());
    window.addEventListener('pinned-changed', handler);
    window.addEventListener('storage', handler);
    return () => { window.removeEventListener('pinned-changed', handler); window.removeEventListener('storage', handler); };
  }, []);

  useEffect(() => {
    if (!open || !pinnedIds.length) { setProjects([]); return; }
    setLoading(true);
    Promise.all(pinnedIds.map(id => api.get(`/projects/${id}`).then(r => r.data?.project || r.data).catch(() => null)))
      .then(r => setProjects(r.filter(Boolean)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, pinnedIds]);

  const unpin = (id) => {
    const next = pinnedIds.filter(pid => pid !== id);
    setPinnedIds(next);
    _setPinnedIds(next);
    setProjects(prev => prev.filter(p => p.id !== id));
    window.dispatchEvent(new CustomEvent('pinned-changed'));
  };

  if (!pinnedIds.length && !open) return null;

  if (!open) {
    return (
      <div style={{ position: 'fixed', right: pos.right, bottom: pos.bottom, zIndex: 50 }}
        className={`w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl flex items-center justify-center cursor-grab transition-all hover:scale-110 group ${dragging ? 'cursor-grabbing opacity-80' : ''}`}
        onMouseDown={onDragStart} onTouchStart={onDragStart} onClick={() => !didDrag() && setOpen(true)}>
        <Pin className="h-5 w-5 pointer-events-none" />
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center pointer-events-none">{pinnedIds.length}</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', right: pos.right, bottom: pos.bottom, zIndex: 50, maxHeight: minimized ? 48 : '70vh' }}
      className={`bg-white rounded-2xl shadow-2xl border border-gray-200 transition-all ${minimized ? 'w-72' : 'w-96'} ${dragging ? 'opacity-90' : ''}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-2xl cursor-grab select-none"
        onMouseDown={onDragStart} onTouchStart={onDragStart}>
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-blue-200" />
          <Pin className="h-4 w-4 text-white" />
          <span className="text-sm font-bold text-white">Dự án ghim ({pinnedIds.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized(!minimized)} className="p-1 hover:bg-white/20 rounded cursor-pointer">
            {minimized ? <Maximize2 className="h-3.5 w-3.5 text-white" /> : <Minimize2 className="h-3.5 w-3.5 text-white" />}
          </button>
          <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded cursor-pointer">
            <X className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
      </div>
      {!minimized && (
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 48px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8"><div className="animate-spin h-6 w-6 border-3 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 px-4"><Pin className="h-8 w-8 text-gray-200 mx-auto mb-2" /><p className="text-xs text-gray-400">Chưa ghim dự án nào</p></div>
          ) : (
            <div className="p-2 space-y-1">
              {projects.map(p => (
                <PinnedCard key={p.id} project={p} expanded={expandedId === p.id}
                  onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  onUnpin={() => unpin(p.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PinnedCard({ project: p, expanded, onToggle, onUnpin }) {
  const tasks = p.tasks || [];
  const done = tasks.filter(t => t.status === 'done').length;
  const overdue = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length;
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const stageName = p.current_stage?.name || '—';
  const [openStages, setOpenStages] = useState({});

  // Group tasks by stage
  const stageGroups = {};
  const stageOrder = [];
  tasks.forEach(t => {
    const sName = t.stage?.name || 'Không có quy trình';
    const sSlug = t.stage?.slug || '_none';
    if (!stageGroups[sSlug]) {
      stageGroups[sSlug] = { name: sName, color: t.stage?.color || '#6b7280', icon: t.stage?.icon || '📋', slug: sSlug, order: t.stage?.order_index ?? 999, tasks: [] };
      stageOrder.push(sSlug);
    }
    stageGroups[sSlug].tasks.push(t);
  });
  stageOrder.sort((a, b) => (stageGroups[a].order - stageGroups[b].order));

  const toggleStage = (slug) => {
    setOpenStages(prev => ({ ...prev, [slug]: !prev[slug] }));
  };

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100" onClick={onToggle} data-no-drag>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-blue-600 font-bold">{p.code}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${pct >= 100 ? 'bg-emerald-100 text-emerald-700' : overdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {pct >= 100 ? '✅' : overdue ? `⚠️${overdue}` : `${pct}%`}
            </span>
          </div>
          <p className="text-xs font-medium text-gray-900 truncate">{p.name}</p>
        </div>
        <button onClick={e => { e.stopPropagation(); onUnpin(); }} className="p-1 hover:bg-red-50 rounded cursor-pointer"><X className="h-3 w-3 text-gray-300 hover:text-red-500" /></button>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
      </div>
      <div className="px-3 pb-1.5">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : overdue ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-gray-400">{stageName}</span>
          <span className="text-[9px] text-gray-400">{done}/{tasks.length}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
            {!tasks.length ? <p className="text-[10px] text-gray-400 text-center py-2">Chưa có task</p> :
              stageOrder.map(slug => {
                const group = stageGroups[slug];
                const isOpen = openStages[slug] !== false; // default open
                const groupDone = group.tasks.filter(t => t.status === 'done').length;
                return (
                  <div key={slug} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Stage header — collapsible */}
                    <button onClick={() => toggleStage(slug)}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold hover:bg-gray-100 cursor-pointer"
                      style={{ borderLeft: `3px solid ${group.color}` }}>
                      <span>{group.icon}</span>
                      <span className="flex-1 text-left truncate">{group.name}</span>
                      <span className="text-[9px] font-normal text-gray-400">{groupDone}/{group.tasks.length}</span>
                      {isOpen ? <ChevronUp className="h-3 w-3 text-gray-400 shrink-0" /> : <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />}
                    </button>
                    {/* Tasks inside stage */}
                    {isOpen && (
                      <div className="px-2 pb-1.5 space-y-0.5">
                        {group.tasks.map(t => (
                          <div key={t.id}>
                            <div className={`flex items-center gap-1.5 text-[11px] py-0.5 ${t.status === 'done' ? 'text-gray-400 line-through' : ''}`}>
                              {t.status === 'done' ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" /> :
                                t.due_date && new Date(t.due_date) < new Date() ? <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" /> :
                                <Clock className="h-3 w-3 text-gray-300 shrink-0" />}
                              <span className="truncate flex-1">{t.title}</span>
                            </div>
                            {/* Checklists */}
                            {t.checklists && t.checklists.length > 0 && (
                              <div className="ml-4 space-y-0.5 mt-0.5">
                                {t.checklists.map(c => (
                                  <div key={c.id} className={`flex items-center gap-1 text-[10px] ${c.is_completed ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                                    {c.is_completed
                                      ? <CheckSquare className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                                      : <Square className="h-2.5 w-2.5 text-gray-300 shrink-0" />}
                                    <span className="truncate">{c.title}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
          <Link to={`/management/work-unified/${p.id}`} className="block mt-2 text-center text-[10px] text-blue-600 hover:underline font-medium" data-no-drag>Xem chi tiết →</Link>
        </div>
      )}
    </div>
  );
}
