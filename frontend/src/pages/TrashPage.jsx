import { useEffect, useState, useCallback, useMemo } from 'react';
import { RotateCcw, Trash2, AlertTriangle, Search, RefreshCw, FileText, Target, Paperclip } from 'lucide-react';
import api from '../lib/api';

const ENTITY_META = {
  crm_lead: { label: 'Lead / Deal', icon: Target, color: 'bg-blue-100 text-blue-700' },
  lead_document: { label: 'File ghi chú', icon: FileText, color: 'bg-amber-100 text-amber-700' },
  crm_task_attachment: { label: 'Đính kèm task', icon: Paperclip, color: 'bg-purple-100 text-purple-700' },
};

const FILTER_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'crm_lead', label: 'Lead / Deal' },
  { id: 'lead_document', label: 'File ghi chú' },
  { id: 'crm_task_attachment', label: 'Đính kèm task' },
];

function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return s; }
}

export default function TrashPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (filter !== 'all') params.entity_type = filter;
      if (search.trim()) params.q = search.trim();
      const { data } = await api.get('/trash', { params });
      setItems(data.items || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.post(`/trash/${id}/restore`);
      setItems((arr) => arr.filter((x) => x.id !== id));
    } catch (e) {
      alert('Phục hồi thất bại: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (id, label) => {
    if (busyId) return;
    if (!window.confirm(`Xóa vĩnh viễn "${label || 'mục này'}"? Không thể hoàn tác.`)) return;
    setBusyId(id);
    try {
      await api.delete(`/trash/${id}`);
      setItems((arr) => arr.filter((x) => x.id !== id));
    } catch (e) {
      alert('Xóa vĩnh viễn thất bại: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyId(null);
    }
  };

  const handleEmpty = async () => {
    setBusyId('all');
    try {
      await api.post('/trash/empty');
      setItems([]);
      setConfirmEmpty(false);
    } catch (e) {
      alert('Dọn sạch thất bại: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { all: items.length, crm_lead: 0, lead_document: 0, crm_task_attachment: 0 };
    items.forEach((x) => { c[x.entity_type] = (c[x.entity_type] || 0) + 1; });
    return c;
  }, [items]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-red-600" />
            Thùng rác
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Lead/Deal và file ghi chú đã xóa giữ tại đây 30 ngày. Bấm "Phục hồi" để khôi phục.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Tải lại
          </button>
          <button
            onClick={() => setConfirmEmpty(true)}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-sm disabled:opacity-50"
          >
            <AlertTriangle className="h-4 w-4" /> Dọn sạch
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTER_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === t.id
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label} <span className="opacity-70">({counts[t.id] ?? 0})</span>
          </button>
        ))}
        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên…"
            className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-64"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Đang tải…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <Trash2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Thùng rác trống</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Loại</th>
                <th className="text-left px-4 py-3">Tên</th>
                <th className="text-left px-4 py-3">Lý do xóa</th>
                <th className="text-left px-4 py-3">Người xóa</th>
                <th className="text-left px-4 py-3">Xóa lúc</th>
                <th className="text-left px-4 py-3">Tự động dọn</th>
                <th className="text-right px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it) => {
                const meta = ENTITY_META[it.entity_type] || { label: it.entity_type, icon: FileText, color: 'bg-gray-100 text-gray-700' };
                const Icon = meta.icon;
                return (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${meta.color}`}>
                        <Icon className="h-3.5 w-3.5" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate" title={it.entity_label}>
                      {it.entity_label || '—'}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {it.delete_reason ? (
                        <span className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-0.5 inline-block truncate max-w-full" title={it.delete_reason}>
                          {it.delete_reason}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{it.deleter?.full_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(it.deleted_at)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(it.purge_after)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => handleRestore(it.id)}
                          disabled={busyId === it.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Phục hồi
                        </button>
                        <button
                          onClick={() => handlePurge(it.id, it.entity_label)}
                          disabled={busyId === it.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {confirmEmpty && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <h2 className="text-lg font-semibold">Dọn sạch thùng rác?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Tất cả mục trong thùng rác sẽ bị xóa <strong>vĩnh viễn</strong>, không thể phục hồi.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmEmpty(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
              >
                Hủy
              </button>
              <button
                onClick={handleEmpty}
                disabled={busyId === 'all'}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
              >
                Dọn sạch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
