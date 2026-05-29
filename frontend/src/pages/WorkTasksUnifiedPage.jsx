import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import UnifiedTaskRow from '../components/UnifiedTaskRow';
import UnifiedTaskHistoryTimeline from '../components/UnifiedTaskHistoryTimeline';
import {
  Layers, List, History, Search, FolderKanban, Filter, RefreshCw, Plus,
} from 'lucide-react';

const TABS = [
  { id: 'project', label: 'Theo dự án', icon: FolderKanban },
  { id: 'all', label: 'Tất cả NV', icon: List },
  { id: 'history', label: 'Lịch sử ghi nhận', icon: History },
];

const TASK_KIND_OPTIONS = [
  { value: '', label: 'Mọi loại' },
  { value: 'CRM-Deal', label: 'CRM Deal' },
  { value: 'CRM-Lead', label: 'CRM Lead' },
  { value: 'SX', label: 'Sản xuất' },
  { value: 'VC', label: 'Vận chuyển' },
  { value: 'Giao việc', label: 'Giao việc CRM' },
  { value: 'Cá nhân', label: 'Cá nhân' },
];

const GROUP_LABELS = {
  crm_deal: 'NV CRM (Deal/Lead)',
  production: 'NV Sản xuất',
  logistics: 'NV Vận chuyển / Lắp đặt',
  assignment: 'Giao việc CRM gắn dự án',
  other: 'Khác',
};

export default function WorkTasksUnifiedPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('project');
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectData, setProjectData] = useState(null);
  const [allTasks, setAllTasks] = useState([]);
  const [history, setHistory] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [filterKind, setFilterKind] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [historyProjectId, setHistoryProjectId] = useState('');

  const isAdmin = ['admin', 'manager', 'sales_admin'].includes(user?.role);

  useEffect(() => {
    api.get('/projects', { params: { limit: 500 } })
      .then(({ data }) => setProjects(data.projects || data || []))
      .catch(() => setProjects([]));
  }, []);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects.slice(0, 20);
    return projects.filter((p) =>
      (p.code || '').toLowerCase().includes(q) ||
      (p.name || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [projects, projectSearch]);

  const loadByProject = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/work-tasks/by-project/${selectedProjectId}`);
      setProjectData(data);
    } catch {
      setProjectData(null);
    }
    setLoading(false);
  }, [selectedProjectId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page_size: 200 };
      if (searchQ) params.q = searchQ;
      if (filterKind) params.task_kind = filterKind;
      if (filterStatus) params.status = filterStatus;
      const { data } = await api.get('/work-tasks', { params });
      setAllTasks(data.tasks || []);
    } catch {
      setAllTasks([]);
    }
    setLoading(false);
  }, [searchQ, filterKind, filterStatus]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (historyProjectId) params.project_id = historyProjectId;
      else if (selectedProjectId) params.project_id = selectedProjectId;
      else {
        setHistory([]);
        setLoading(false);
        return;
      }
      const { data } = await api.get('/work-tasks/history', { params });
      setHistory(data.history || []);
    } catch {
      setHistory([]);
    }
    setLoading(false);
  }, [historyProjectId, selectedProjectId]);

  useEffect(() => {
    if (tab === 'project' && selectedProjectId) loadByProject();
  }, [tab, selectedProjectId, loadByProject]);

  useEffect(() => {
    if (tab === 'all') loadAll();
  }, [tab, loadAll]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  const handleStatusChange = async (task, status) => {
    try {
      await api.patch(`/work-tasks/${task.source}/${task.source_id}`, { status });
      if (tab === 'project') loadByProject();
      else loadAll();
    } catch { /* ignore */ }
  };

  const progress = projectData?.progress;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            Tổng hợp nhiệm vụ
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gom CRM, Sản xuất, Vận chuyển và Giao việc — CRUD trực tiếp từ module Công việc
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 cursor-pointer"
            onClick={() => {/* modal tạo NV — phase 2 */}}
          >
            <Plus className="h-4 w-4" />
            Tạo nhiệm vụ
          </button>
        )}
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              tab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'project' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <label className="text-sm font-medium text-gray-700">Chọn dự án</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Tìm mã hoặc tên dự án..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {filteredProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setSelectedProjectId(p.id); setProjectSearch(`${p.code} — ${p.name}`); }}
                  className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                    selectedProjectId === p.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {p.code}
                </button>
              ))}
            </div>
          </div>

          {progress && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">Tiến độ tổng hợp</span>
              <span className="text-lg font-bold text-blue-700">
                {progress.completed}/{progress.total} hoàn thành
              </span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : projectData?.groups ? (
            Object.entries(projectData.groups).map(([key, tasks]) => {
              if (!tasks?.length) return null;
              return (
                <div key={key} className="space-y-2">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                    {GROUP_LABELS[key] || key} ({tasks.length})
                  </h3>
                  <div className="space-y-2">
                    {tasks.map((t) => (
                      <UnifiedTaskRow key={t.unified_id} task={t} onStatusChange={handleStatusChange} />
                    ))}
                  </div>
                </div>
              );
            })
          ) : selectedProjectId ? (
            <p className="text-center text-gray-500 py-8">Không có nhiệm vụ cho dự án này.</p>
          ) : (
            <p className="text-center text-gray-500 py-8">Chọn dự án để xem nhóm nhiệm vụ.</p>
          )}
        </div>
      )}

      {tab === 'all' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 bg-white p-4 rounded-xl border border-gray-200">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadAll()}
                placeholder="Tìm tiêu đề..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              {TASK_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              placeholder="Trạng thái"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-32"
            />
            <button
              type="button"
              onClick={loadAll}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm cursor-pointer"
            >
              <Filter className="h-4 w-4" />
              Lọc
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-2">
              {allTasks.map((t) => (
                <UnifiedTaskRow key={t.unified_id} task={t} onStatusChange={handleStatusChange} />
              ))}
              {!allTasks.length && (
                <p className="text-center text-gray-500 py-8">Không có nhiệm vụ phù hợp bộ lọc.</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="text-sm font-medium text-gray-700 block mb-2">Lịch sử theo dự án</label>
            <select
              value={historyProjectId || selectedProjectId}
              onChange={(e) => setHistoryProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">— Chọn dự án —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <UnifiedTaskHistoryTimeline items={history} loading={loading} />
          </div>
        </div>
      )}
    </div>
  );
}
