import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { Pin, X, ChevronRight, ChevronDown, ChevronUp, CheckCircle2, Clock, AlertTriangle, Minimize2, Maximize2 } from 'lucide-react';

const STORAGE_KEY = 'tubep_pinned_projects';

// Get/set pinned IDs from localStorage
function getPinnedIds() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function setPinnedIds(ids) { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); }

// Export for other components to use
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

  // Listen for pin changes from other components
  useEffect(() => {
    const handler = () => _setPinnedIds(getPinnedIds());
    window.addEventListener('pinned-changed', handler);
    window.addEventListener('storage', handler);
    return () => { window.removeEventListener('pinned-changed', handler); window.removeEventListener('storage', handler); };
  }, []);

  // Load project data when opening or pins change
  useEffect(() => {
    if (!open || !pinnedIds.length) { setProjects([]); return; }
    loadProjects();
  }, [open, pinnedIds]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        pinnedIds.map(id => api.get(`/projects/${id}`).then(r => r.data).catch(() => null))
      );
      setProjects(results.filter(Boolean));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const unpin = (id) => {
    const next = pinnedIds.filter(pid => pid !== id);
    setPinnedIds(next);
    _setPinnedIds(next);
    setProjects(prev => prev.filter(p => p.id !== id));
    window.dispatchEvent(new CustomEvent('pinned-changed'));
  };

  if (!pinnedIds.length && !open) return null;

  // Floating badge (collapsed)
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl flex items-center justify-center cursor-pointer transition-all hover:scale-110 group">
        <Pin className="h-5 w-5" />
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center">{pinnedIds.length}</span>
        <span className="absolute right-14 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">Dự án đã ghim</span>
      </button>
    );
  }

  // Floating panel (expanded)
  return (
    <div className={`fixed bottom-6 right-6 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 transition-all ${minimized ? 'w-72' : 'w-80'}`}
      style={{ maxHeight: minimized ? '48px' : '70vh' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-2xl cursor-pointer"
        onClick={() => setMinimized(!minimized)}>
        <div className="flex items-center gap-2">
          <Pin className="h-4 w-4 text-white" />
          <span className="text-sm font-bold text-white">Dự án ghim ({pinnedIds.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={e => { e.stopPropagation(); setMinimized(!minimized); }} className="p-1 hover:bg-white/20 rounded cursor-pointer">
            {minimized ? <Maximize2 className="h-3.5 w-3.5 text-white" /> : <Minimize2 className="h-3.5 w-3.5 text-white" />}
          </button>
          <button onClick={e => { e.stopPropagation(); setOpen(false); }} className="p-1 hover:bg-white/20 rounded cursor-pointer">
            <X className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!minimized && (
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 48px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8"><div className="animate-spin h-6 w-6 border-3 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 px-4"><Pin className="h-8 w-8 text-gray-200 mx-auto mb-2" /><p className="text-xs text-gray-400">Chưa ghim dự án nào</p><p className="text-[10px] text-gray-300 mt-1">Bấm 📌 trên dự án để ghim</p></div>
          ) : (
            <div className="p-2 space-y-1">
              {projects.map(p => (
                <PinnedProjectCard key={p.id} project={p} expanded={expandedId === p.id}
                  onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  onUnpin={() => unpin(p.id)} />
              ))}
            </div>
          )}
          {projects.length > 0 && (
            <div className="px-3 py-2 border-t">
              <button onClick={loadProjects} className="text-[10px] text-blue-600 hover:underline cursor-pointer">🔄 Làm mới</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PinnedProjectCard({ project: p, expanded, onToggle, onUnpin }) {
  const tasks = p.tasks || [];
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length;
  const pct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0;
  const stageName = p.current_stage?.name || p.stage?.name || '—';

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
      {/* Summary row */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100 transition-colors" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-blue-600 font-bold">{p.code}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${pct >= 100 ? 'bg-emerald-100 text-emerald-700' : overdueTasks ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {pct >= 100 ? '✅' : overdueTasks ? `⚠️${overdueTasks}` : `${pct}%`}
            </span>
          </div>
          <p className="text-xs font-medium text-gray-900 truncate">{p.name}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={e => { e.stopPropagation(); onUnpin(); }} className="p-1 hover:bg-red-50 rounded cursor-pointer" title="Bỏ ghim">
            <X className="h-3 w-3 text-gray-300 hover:text-red-500" />
          </button>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-3 pb-1.5">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : overdueTasks ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-gray-400">{stageName}</span>
          <span className="text-[9px] text-gray-400">{doneTasks}/{totalTasks}</span>
        </div>
      </div>

      {/* Expanded: Task list */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="text-[10px] text-gray-400 text-center py-2">Chưa có task</p>
            ) : (
              tasks.slice(0, 15).map(t => (
                <div key={t.id} className={`flex items-center gap-1.5 text-[11px] py-0.5 ${t.status === 'done' ? 'text-gray-400 line-through' : ''}`}>
                  {t.status === 'done' ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  ) : t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date() ? (
                    <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                  ) : (
                    <Clock className="h-3 w-3 text-gray-300 shrink-0" />
                  )}
                  <span className="truncate flex-1">{t.title}</span>
                  {t.due_date && <span className={`text-[9px] shrink-0 ${t.status !== 'done' && new Date(t.due_date) < new Date() ? 'text-red-600 font-bold' : 'text-gray-400'}`}>{new Date(t.due_date).toLocaleDateString('vi')}</span>}
                </div>
              ))
            )}
            {tasks.length > 15 && <p className="text-[9px] text-gray-400 text-center">+{tasks.length - 15} tasks nữa</p>}
          </div>
          <Link to={`/projects/${p.id}`} className="block mt-2 text-center text-[10px] text-blue-600 hover:underline font-medium">
            Xem chi tiết →
          </Link>
        </div>
      )}
    </div>
  );
}
