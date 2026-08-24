import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { formatDate } from '../lib/utils';
import {
  RefreshCw, Building2, ChevronLeft, ChevronRight,
} from 'lucide-react';

const PAGE_SIZE = 20;

const BUCKET_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'on_track', label: 'Đúng tiến độ' },
  { key: 'waiting_material', label: 'Chờ vật tư' },
  { key: 'late', label: 'Trễ hạn' },
  { key: 'done', label: 'Hoàn tất' },
];

const BUCKET_BADGE_CLS = {
  on_track: 'bg-emerald-50 text-emerald-700',
  waiting_material: 'bg-amber-50 text-amber-700',
  late: 'bg-red-50 text-red-700',
  done: 'bg-gray-100 text-gray-600',
};

const BUCKET_LABEL = {
  on_track: 'Đúng tiến độ',
  waiting_material: 'Chờ vật tư',
  late: 'Trễ hạn',
  done: 'Hoàn tất',
};

export default function ProductionOverviewPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const canPickCompany = isAdmin && !isCompanyScoped;

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [bucketTab, setBucketTab] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'production' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
      if (list.length > 0) setCompanyId((prev) => prev || list[0].id);
    }).catch(() => setCompanies([]));
  }, []);

  useEffect(() => { setPage(1); }, [stageFilter, bucketTab, companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (canPickCompany && companyId) params.company_id = companyId;
      const res = await api.get('/management/production-overview', { params });
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || 'Không tải được dữ liệu sản xuất');
    } finally {
      setLoading(false);
    }
  }, [canPickCompany, companyId]);

  useEffect(() => { load(); }, [load]);

  const companyName = useMemo(() => {
    if (canPickCompany) {
      if (!companyId) return 'công ty';
      return companies.find((c) => String(c.id) === String(companyId))?.name || 'công ty đã chọn';
    }
    return companies.find((c) => String(c.id) === String(user?.company_id))?.name || companies[0]?.name || 'công ty bạn';
  }, [canPickCompany, companyId, companies, user?.company_id]);

  const stages = data?.stages || [];
  const stats = data?.stats || { active: 0, waiting_material: 0, late: 0, done_this_week: 0 };
  const allItems = data?.items || [];

  const filteredItems = useMemo(() => {
    let list = allItems;
    if (stageFilter) list = list.filter((it) => it.current_stage_label === stageFilter);
    if (bucketTab !== 'all') list = list.filter((it) => it.bucket === bucketTab);
    return list;
  }, [allItems, stageFilter, bucketTab]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(pageStart, pageStart + PAGE_SIZE);

  const bucketCounts = useMemo(() => {
    const c = { all: allItems.length, on_track: 0, waiting_material: 0, late: 0, done: 0 };
    allItems.forEach((it) => { c[it.bucket] = (c[it.bucket] || 0) + 1; });
    return c;
  }, [allItems]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#111827' }}>Sản xuất</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Danh sách các dự án đang trong công đoạn sản xuất của {companyName}, theo cùng phong cách với Work Unified
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canPickCompany && companies.length > 0 && (
            <div className="relative">
              <Building2 className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <Link
            to="/sx/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Mở bảng Kanban xưởng
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">
          {stages.length} công đoạn xưởng
        </p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setStageFilter('')}
            className={`shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
              !stageFilter ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Tất cả
          </button>
          {stages.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setStageFilter(s.label)}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                stageFilter === s.label ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stageFilter === s.label ? 'bg-white' : 'bg-blue-400'}`} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Dự án đang sản xuất</p>
          <p className="text-2xl font-bold mt-1.5 text-gray-900">{loading ? '…' : stats.active}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Dự án chờ vật tư</p>
          <p className="text-2xl font-bold mt-1.5 text-amber-600">{loading ? '…' : stats.waiting_material}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Dự án trễ hạn</p>
          <p className="text-2xl font-bold mt-1.5 text-red-600">{loading ? '…' : stats.late}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Hoàn tất tuần này</p>
          <p className="text-2xl font-bold mt-1.5 text-emerald-600">{loading ? '…' : stats.done_this_week}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-1 p-2 border-b border-gray-100 overflow-x-auto">
          {BUCKET_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setBucketTab(t.key)}
              className={`shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                bucketTab === t.key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label} · {bucketCounts[t.key] || 0}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm table-fixed">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[22%]" />
              <col className="w-[10%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2.5 font-semibold">Dự án</th>
                <th className="px-4 py-2.5 font-semibold">Công đoạn hiện tại</th>
                <th className="px-4 py-2.5 font-semibold">Tiến độ</th>
                <th className="px-4 py-2.5 font-semibold">Người phụ trách</th>
                <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
                <th className="px-4 py-2.5 font-semibold">Dự kiến xong</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Không có dự án phù hợp bộ lọc.</td></tr>
              ) : (
                pageItems.map((it) => (
                  <tr key={it.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 align-top">
                      <Link to={`/management/production-overview/${it.id}`} className="text-sm font-semibold text-blue-700 hover:underline truncate block" title={it.name}>
                        {it.code}
                      </Link>
                      <p className="text-xs text-gray-500 truncate mt-0.5" title={it.name}>{it.name}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="h-1.5 w-full max-w-[140px] rounded-full bg-gray-200 overflow-hidden mb-1">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${Math.max(0, Math.min(100, it.progress_pct ?? 0))}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600 truncate" title={it.current_stage_label}>
                        {it.current_stage_label}
                        {it.current_stage_idx != null && (
                          <span className="text-gray-400"> · {it.current_stage_idx + 1}/{it.total_stages}</span>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700 font-medium">{it.progress_pct != null ? `${it.progress_pct}%` : '—'}</td>
                    <td className="px-4 py-3 align-top text-gray-600 truncate">{it.assignee_name || '—'}</td>
                    <td className="px-4 py-3 align-top">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${BUCKET_BADGE_CLS[it.bucket]}`}>
                        {BUCKET_LABEL[it.bucket]}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-600 whitespace-nowrap">{it.deadline ? formatDate(it.deadline) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredItems.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Hiển thị <span className="font-medium text-gray-700">{pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filteredItems.length)}</span> trong tổng số{' '}
              <span className="font-medium text-gray-700">{filteredItems.length}</span> dự án
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Trang trước"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-600 flex items-center justify-center disabled:opacity-40 cursor-pointer hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600 px-1">
                Trang <span className="font-medium text-gray-800">{page}</span> / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Trang sau"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-600 flex items-center justify-center disabled:opacity-40 cursor-pointer hover:bg-gray-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        Lưu ý: app hiện chưa có khái niệm "Lệnh sản xuất" (MO) hay "Tổ" đội thi công riêng — mỗi dòng ở đây là 1 dự án
        đang/đã qua công đoạn sản xuất, công đoạn hiện tại lấy theo pipeline xưởng thật của công ty.
      </p>
    </div>
  );
}
