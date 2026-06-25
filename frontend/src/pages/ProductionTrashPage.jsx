import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Trash2, Search, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { resolveTrashCompanyLabel } from '../lib/trashCompanyLabel';
import api from '../lib/api';
import { TrashTablePagination, TrashScrollTableShell } from '../components/UnifiedTrashFilters';
import { paginateItems, fmtTrashDateTime } from '../lib/trashPageUtils';

/**
 * Trang Thùng rác — Dự án Sản xuất (entity_type='project').
 */
export default function ProductionTrashPage({ embedded = false, filters, showCompanyColumn = false, companies = [] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  const effectiveSearch = embedded && filters ? (filters.search || '') : q.trim();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setForbidden(false);
    try {
      const params = { entity_type: 'project' };
      if (effectiveSearch) params.q = effectiveSearch;
      if (filters?.companyId) params.company_id = filters.companyId;
      if (filters?.deletedBy) params.deleted_by = filters.deletedBy;
      const { data } = await api.get('/trash', { params });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setPage(1);
    } catch (e) {
      if (e?.response?.status === 403) setForbidden(true);
      else setError(e?.response?.data?.error || 'Không tải được thùng rác');
    }
    setLoading(false);
  }, [effectiveSearch, filters?.companyId, filters?.deletedBy]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [effectiveSearch, filters?.companyId, filters?.deletedBy]);

  const pagination = useMemo(() => paginateItems(items, page), [items, page]);
  const pagedItems = pagination.items;

  const handleRestore = async (item) => {
    if (busyId) return;
    if (!window.confirm(`Khôi phục dự án "${item.entity_label || ''}" từ Thùng rác?`)) return;
    setBusyId(item.id);
    try {
      const { data } = await api.post(`/trash/${item.id}/restore`);
      const restoreErrors = Array.isArray(data?.errors) ? data.errors : [];
      setItems((arr) => arr.filter((x) => x.id !== item.id));
      if (restoreErrors.length) {
        const preview = restoreErrors.slice(0, 4)
          .map((e) => `• ${e.table}: ${e.message || e.code || 'lỗi không xác định'}`)
          .join('\n');
        alert(`Khôi phục xong nhưng có ${restoreErrors.length} bảng phụ lỗi:\n${preview}`);
      }
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi khôi phục');
    }
    setBusyId(null);
  };

  const handlePurge = async (item) => {
    if (busyId) return;
    if (!window.confirm(`Xóa vĩnh viễn "${item.entity_label || ''}"?\nKhông thể hoàn tác.`)) return;
    setBusyId(item.id);
    try {
      await api.delete(`/trash/${item.id}`);
      setItems((arr) => arr.filter((x) => x.id !== item.id));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xóa vĩnh viễn');
    }
    setBusyId(null);
  };

  return (
    <div className={`flex flex-col min-h-0 h-full ${embedded ? 'gap-2' : 'max-w-5xl space-y-4'}`}>
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Trash2 className="h-7 w-7 text-rose-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Thùng rác — Dự án sản xuất</h1>
              <p className="text-sm text-gray-500">Dự án đã xóa khỏi dashboard xưởng.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => load()} disabled={loading} className="text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-white inline-flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50 cursor-pointer">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
            </button>
            <Link to="/sx/dashboard" className="text-sm font-medium text-teal-700 border border-teal-200 rounded-lg px-3 py-2 bg-white">← Về dashboard xưởng</Link>
          </div>
        </div>
      )}

      {embedded && (
        <div className="flex justify-end shrink-0">
          <button type="button" onClick={() => load()} disabled={loading} className="text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white inline-flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50 cursor-pointer">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </button>
        </div>
      )}

      {!embedded && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Tìm theo tên / mã dự án..." value={q} onChange={(e) => setQ(e.target.value)} className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </form>
        </div>
      )}

      <TrashScrollTableShell
        header={(
          <div className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
            {loading ? 'Đang tải…' : `${items.length} dự án trong thùng rác`}
          </div>
        )}
        footer={(
          <TrashTablePagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 gap-2 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
          </div>
        ) : forbidden ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2 px-5 text-center text-sm">
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <p className="font-medium">Chỉ Admin được phép xem Thùng rác.</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-red-500 text-sm">{error}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            <Trash2 className="h-10 w-10 opacity-50" />
            <p className="text-sm">Thùng rác trống</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 sticky top-0 z-10 shadow-[0_1px_0_0_rgb(229,231,235)]">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Dự án</th>
                {showCompanyColumn && <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Công ty</th>}
                <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Người xóa</th>
                <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Xóa lúc</th>
                <th className="text-right px-3 py-2 font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedItems.map((it) => (
                <tr key={it.id} className="hover:bg-gray-50/80">
                  <td className="px-3 py-2 min-w-0">
                    <p className="font-semibold text-gray-900 truncate" title={it.entity_label}>{it.entity_label || `Dự án ${String(it.entity_id).slice(0, 8)}`}</p>
                    {it.delete_reason && (
                      <p className="text-[11px] text-rose-600 mt-0.5 line-clamp-1" title={it.delete_reason}>Lý do: {it.delete_reason}</p>
                    )}
                  </td>
                  {showCompanyColumn && (
                    <td className="px-3 py-2 text-xs text-gray-600 hidden md:table-cell max-w-[8rem] truncate" title={resolveTrashCompanyLabel(it.company_id, companies)}>
                      {resolveTrashCompanyLabel(it.company_id, companies)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-xs text-gray-600 hidden sm:table-cell">{it.deleter?.full_name || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap tabular-nums">{fmtTrashDateTime(it.deleted_at)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <button type="button" onClick={() => handleRestore(it)} disabled={busyId === it.id} className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md cursor-pointer disabled:opacity-50">
                        {busyId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Khôi phục
                      </button>
                      <button type="button" onClick={() => handlePurge(it)} disabled={busyId === it.id} className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-md cursor-pointer disabled:opacity-50">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TrashScrollTableShell>
    </div>
  );
}
