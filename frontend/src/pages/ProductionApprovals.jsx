import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import {
  ClipboardCheck, Send, CheckCircle2, XCircle, Clock, Search, Filter
} from 'lucide-react';

const STATUS_LABELS = {
  pending: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-700', icon: '⏳' },
  approved: { label: 'Đã duyệt', color: 'bg-green-100 text-green-700', icon: '✅' },
  rejected: { label: 'Từ chối', color: 'bg-red-100 text-red-700', icon: '❌' },
  revision: { label: 'Yêu cầu sửa', color: 'bg-purple-100 text-purple-700', icon: '🔄' },
};
const TYPE_LABELS = {
  drawing: 'Bản vẽ',
  material: 'Vật tư',
  'change-request': 'Yêu cầu chỉnh sửa',
  handoff: 'Hồ sơ bàn giao',
};

export default function ProductionApprovals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/production/approvals');
      setItems(data.approvals || []);
    } catch (e) {
      console.error(e);
      // Endpoint chưa có → hiện empty state
    }
    setLoading(false);
  };

  const filtered = items.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (i.title || '').toLowerCase().includes(q) ||
        (i.project_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: items.length,
    pending: items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 space-y-6">
      <div>
        <p className="text-xs text-gray-500 font-semibold">XƯỞNG / Duyệt hồ sơ</p>
        <h1 className="text-2xl font-bold text-gray-900">Duyệt hồ sơ sản xuất</h1>
        <p className="text-sm text-gray-500 mt-1">Quản lý yêu cầu gửi duyệt giữa CRM ↔ Xưởng theo từng deal</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Tổng yêu cầu</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center border-amber-200 bg-amber-50">
          <p className="text-xs text-amber-600 mb-1">Chờ duyệt</p>
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xs text-green-600 mb-1">Đã duyệt</p>
          <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xs text-red-600 mb-1">Từ chối</p>
          <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề, dự án..."
            className="w-full h-10 pl-10 pr-4 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-lg text-sm">
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
          <option value="revision">Yêu cầu sửa</option>
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-12 text-center">
          <ClipboardCheck className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Chưa có yêu cầu duyệt nào</p>
          <p className="text-sm text-gray-400 mt-1">Vào chi tiết deal → tab "Gửi duyệt deal" để gửi yêu cầu đầu tiên</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const st = STATUS_LABELS[item.status] || STATUS_LABELS.pending;
            return (
              <div key={item.id} className="bg-white rounded-xl border shadow-sm p-5 hover:border-orange-200 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.icon} {st.label}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900">{item.title}</h3>
                    {item.note && <p className="text-sm text-gray-500 mt-1">{item.note}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>Dự án: {item.project_name || '—'}</span>
                      <span>Gửi: {item.created_at ? formatDate(item.created_at) : '—'}</span>
                      <span>Bởi: {item.created_by_name || '—'}</span>
                    </div>
                  </div>
                  <Link to={`/sx/projects/${item.project_id}`}
                    className="text-xs font-medium text-orange-600 hover:underline whitespace-nowrap">
                    Xem deal →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
