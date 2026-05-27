import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import {
  ArrowLeft, CheckCircle2, Clock, AlertTriangle, Search, Filter,
  ChevronDown, LayoutDashboard
} from 'lucide-react';

const PRIORITY_MAP = {
  high: { label: 'Cao', color: 'bg-red-100 text-red-700', dot: '🔴' },
  medium: { label: 'TB', color: 'bg-yellow-100 text-yellow-700', dot: '🟡' },
  low: { label: 'Thấp', color: 'bg-green-100 text-green-700', dot: '🟢' },
};
const STATUS_MAP = {
  todo: { label: 'Chưa làm', color: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'Đang làm', color: 'bg-blue-100 text-blue-700' },
  done: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700' },
  review: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-700' },
};

export default function ProductionTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/production/tasks');
      setTasks(data.tasks || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const filtered = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (t.title || '').toLowerCase().includes(q) ||
        (t.project_name || '').toLowerCase().includes(q) ||
        (t.assignee_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 font-semibold">XƯỞNG / Nhiệm vụ sản xuất</p>
          <h1 className="text-2xl font-bold text-gray-900">Nhiệm vụ sản xuất</h1>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Tổng NV</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Chưa làm</p>
          <p className="text-2xl font-bold text-gray-500">{stats.todo}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Đang làm</p>
          <p className="text-2xl font-bold text-blue-600">{stats.in_progress}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Hoàn thành</p>
          <p className="text-2xl font-bold text-green-600">{stats.done}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Quá hạn</p>
          <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nhiệm vụ, dự án, nhân viên..."
            className="w-full h-10 pl-10 pr-4 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-lg text-sm">
          <option value="all">Tất cả trạng thái</option>
          <option value="todo">Chưa làm</option>
          <option value="in_progress">Đang làm</option>
          <option value="review">Chờ duyệt</option>
          <option value="done">Hoàn thành</option>
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-lg text-sm">
          <option value="all">Tất cả ưu tiên</option>
          <option value="high">Cao</option>
          <option value="medium">Trung bình</option>
          <option value="low">Thấp</option>
        </select>
      </div>

      {/* Task List */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nhiệm vụ</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Dự án</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Phụ trách</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ưu tiên</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Hạn chót</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Không có nhiệm vụ nào</td></tr>
            ) : filtered.map(t => {
              const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done';
              const pr = PRIORITY_MAP[t.priority] || PRIORITY_MAP.medium;
              const st = STATUS_MAP[t.status] || STATUS_MAP.todo;
              return (
                <tr key={t.id} className="hover:bg-orange-50/50 transition">
                  <td className="px-4 py-3">
                    <Link to={`/sx/projects/${t.project_id}`} className="font-medium text-gray-900 hover:text-orange-600">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <Link to={`/sx/projects/${t.project_id}`} className="hover:text-orange-600">{t.project_name || '—'}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.assignee_name || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pr.color}`}>{pr.dot} {pr.label}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                  </td>
                  <td className={`px-4 py-3 text-center text-xs ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                    {t.due_date ? formatDate(t.due_date) : '—'}
                    {isOverdue && <span className="ml-1">⚠️</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
