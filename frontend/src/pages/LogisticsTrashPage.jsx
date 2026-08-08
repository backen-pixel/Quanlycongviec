import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, RotateCcw, AlertTriangle, Loader2, Truck } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatDate } from '../lib/utils';
import { TrashTablePagination, TrashScrollTableShell } from '../components/UnifiedTrashFilters';
import { paginateItems } from '../lib/trashPageUtils';

export default function LogisticsTrashPage({ embedded = false, filters, showCompanyColumn = false }) {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters?.search) params.search = filters.search;
      if (filters?.companyId) params.company_id = filters.companyId;
      if (filters?.deletedBy) params.deleted_by = filters.deletedBy;
      const { data } = await api.get('/logistics/trash', { params });
      setItems(data?.items || []);
      setMigrationRequired(!!data?.migration_required);
      setPage(1);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filters?.search, filters?.companyId, filters?.deletedBy]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filters?.search, filters?.companyId, filters?.deletedBy]);

  const pagination = useMemo(() => paginateItems(items, page), [items, page]);
  const pagedItems = pagination.items;

  const restore = async (id) => {
    if (busyId) return;
    if (!confirm('Khôi phục dự án này về Kanban Lắp đặt?')) return;
    setBusyId(id);
    try {
      await api.post(`/logistics/trash/${id}/restore`);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi khôi phục');
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (id, label) => {
    if (busyId) return;
    if (!isAdmin) return alert('Chỉ admin được xóa vĩnh viễn');
    if (!confirm(`Xóa VĨNH VIỄN "${label}"?\nThao tác này không thể hoàn tác.`)) return;
    setBusyId(id);
    try {
      await api.delete(`/logistics/trash/${id}`);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa vĩnh viễn');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={`flex flex-col min-h-0 h-full ${embedded ? 'gap-2' : 'max-w-5xl space-y-4'}`}>
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Trash2 className="h-7 w-7 text-rose-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Thùng rác Lắp đặt</h1>
              <p className="text-sm text-gray-500">Các dự án đã xóa khỏi Kanban VC.</p>
            </div>
          </div>
          <Link to="/vc/dashboard" className="text-sm font-medium text-orange-700 border border-orange-200 rounded-lg px-3 py-2 bg-white">← Về dashboard VC</Link>
        </div>
      )}

      {migrationRequired && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900 flex items-start gap-2 shrink-0">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <strong>Cần chạy migration trước.</strong> Chạy file{' '}
            <code className="text-xs bg-white/80 px-1 rounded">database/242_vc_soft_delete.sql</code> trên Supabase.
          </div>
        </div>
      )}

      <TrashScrollTableShell
        header={(
          <div className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
            {loading ? 'Đang tải…' : `${items.length} dự án VC trong thùng rác`}
          </div>
        )}
        footer={(
          <TrashTablePagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <Trash2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Thùng rác trống.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 sticky top-0 z-10 shadow-[0_1px_0_0_rgb(229,231,235)]">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Dự án</th>
                <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Khách hàng</th>
                {(showCompanyColumn || !embedded) && <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">Công ty VC</th>}
                <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Người xóa</th>
                <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Xóa lúc</th>
                <th className="text-right px-3 py-2 font-semibold">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((it) => (
                <tr key={it.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Truck className="h-4 w-4 text-orange-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{it.name || it.code || 'Không tên'}</p>
                        {it.code && <p className="text-[11px] text-gray-400">{it.code}</p>}
                        {it.vc_delete_reason && (
                          <p className="text-[11px] text-orange-700 line-clamp-1 mt-0.5" title={it.vc_delete_reason}>{it.vc_delete_reason}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700 text-xs hidden md:table-cell max-w-[8rem] truncate">{it.customer?.full_name || '—'}</td>
                  {(showCompanyColumn || !embedded) && (
                    <td className="px-3 py-2 text-gray-700 text-xs hidden lg:table-cell max-w-[8rem] truncate">
                      {it.logistics_company?.short_name || it.logistics_company?.name || it.company?.short_name || it.company?.name || '—'}
                    </td>
                  )}
                  <td className="px-3 py-2 text-gray-500 text-xs hidden sm:table-cell">{it.deleted_user?.full_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{formatDate(it.vc_deleted_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end whitespace-nowrap">
                      <button type="button" onClick={() => restore(it.id)} disabled={busyId === it.id} className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer disabled:opacity-50">
                        <RotateCcw className="h-3 w-3" /> Khôi phục
                      </button>
                      {isAdmin && (
                        <button type="button" onClick={() => purge(it.id, it.name || it.code || it.id)} disabled={busyId === it.id} className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer disabled:opacity-50">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
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
