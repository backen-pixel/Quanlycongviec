import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Trash2, Search, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../lib/api';

function formatDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return String(d); }
}

/**
 * Trang Thùng rác — Dự án Sản xuất (entity_type='project').
 * - Admin xem được danh sách đã xóa giả, khôi phục hoặc xóa vĩnh viễn.
 * - Hệ thống tự xóa vĩnh viễn sau 30 ngày (purge_after).
 */
export default function ProductionTrashPage({ embedded = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async (search = '') => {
    setLoading(true);
    setError('');
    setForbidden(false);
    try {
      const params = { entity_type: 'project' };
      if (search) params.q = search;
      const { data } = await api.get('/trash', { params });
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      if (e?.response?.status === 403) setForbidden(true);
      else setError(e?.response?.data?.error || 'Không tải được thùng rác');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(''); }, [load]);

  const handleRestore = async (item) => {
    if (busyId) return;
    if (!window.confirm(`Khôi phục dự án "${item.entity_label || ''}" từ Thùng rác?`)) return;
    setBusyId(item.id);
    try {
      const { data } = await api.post(`/trash/${item.id}/restore`);
      const restoreErrors = Array.isArray(data?.errors) ? data.errors : [];
      setItems((arr) => arr.filter((x) => x.id !== item.id));
      if (restoreErrors.length) {
        console.warn('[trash] partial restore errors:', restoreErrors);
        const preview = restoreErrors.slice(0, 4)
          .map((e) => `• ${e.table}: ${e.message || e.code || 'lỗi không xác định'}`)
          .join('\n');
        const more = restoreErrors.length > 4 ? `\n…và ${restoreErrors.length - 4} lỗi khác` : '';
        alert(`Khôi phục dự án xong nhưng có ${restoreErrors.length} bảng phụ lỗi:\n${preview}${more}\n\nVui lòng kiểm tra Console (F12) để xem chi tiết.`);
      }
    } catch (e) {
      const resp = e?.response?.data || {};
      if (Array.isArray(resp.errors) && resp.errors.length) {
        console.error('[trash] restore errors:', resp.errors);
        const preview = resp.errors.slice(0, 4)
          .map((er) => `• ${er.table}: ${er.message || er.code || 'lỗi không xác định'}`)
          .join('\n');
        alert(`${resp.error || 'Lỗi khôi phục'}\n\n${preview}`);
      } else {
        alert(resp.error || 'Lỗi khôi phục');
      }
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
    <div className={`space-y-4 ${embedded ? '' : 'max-w-5xl'}`}>
      {!embedded && (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trash2 className="h-7 w-7 text-rose-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Thùng rác — Dự án sản xuất</h1>
            <p className="text-sm text-gray-500">
              Danh sách dự án đã xóa khỏi <strong>/sx/dashboard</strong>. Admin có thể khôi phục hoặc xóa vĩnh viễn. Mục để quá 30 ngày sẽ tự xóa.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(q)}
            disabled={loading}
            className="text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-white inline-flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </button>
          <Link
            to="/sx/dashboard"
            className="text-sm font-medium text-teal-700 hover:text-teal-900 border border-teal-200 rounded-lg px-3 py-2 bg-white"
          >
            ← Về dashboard xưởng
          </Link>
        </div>
      </div>
      )}

      {embedded && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => load(q)}
            disabled={loading}
            className="text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-white inline-flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </button>
        </div>
      )}

      {/* Search */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
        <form
          onSubmit={(e) => { e.preventDefault(); load(q); }}
          className="relative max-w-md"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm theo tên / mã dự án..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </form>
      </div>

      {/* List */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
          </div>
        ) : forbidden ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2 px-5 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <p className="text-sm font-medium">Chỉ Admin được phép xem Thùng rác.</p>
            <p className="text-xs text-gray-400">Vui lòng liên hệ quản trị viên để khôi phục dự án.</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-500 text-sm">{error}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Trash2 className="h-10 w-10 opacity-50" />
            <p className="text-sm">Thùng rác trống</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
              {items.length} dự án đang ở thùng rác
            </div>
            <ul className="divide-y divide-gray-100">
              {items.map((it) => (
                <li key={it.id} className="px-5 py-3 hover:bg-gray-50/70 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#000000' }} title={it.entity_label}>
                      {it.entity_label || `Dự án ${String(it.entity_id).slice(0, 8)}`}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                      Đã xóa: <span className="tabular-nums">{formatDateTime(it.deleted_at)}</span>
                      {it.deleter?.full_name && (
                        <span className="text-gray-400"> · bởi {it.deleter.full_name}</span>
                      )}
                      {it.purge_after && (
                        <span className="text-gray-400"> · tự xóa: <span className="tabular-nums">{formatDateTime(it.purge_after)}</span></span>
                      )}
                    </p>
                    {it.delete_reason && (
                      <p className="text-[11px] text-rose-600 mt-1 italic line-clamp-2" title={it.delete_reason}>
                        Lý do: {it.delete_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRestore(it)}
                      disabled={busyId === it.id}
                      className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer disabled:opacity-50"
                      title="Khôi phục dự án"
                    >
                      {busyId === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      Khôi phục
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePurge(it)}
                      disabled={busyId === it.id}
                      className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg cursor-pointer disabled:opacity-50"
                      title="Xóa vĩnh viễn"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
