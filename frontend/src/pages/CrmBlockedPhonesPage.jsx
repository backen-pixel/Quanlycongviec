import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { Ban, Plus, Search, Trash2, Loader2, ShieldOff, X } from 'lucide-react';

const PAGE_SIZE = 50;

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function displayPhone(item) {
  if (item.phone_display) return item.phone_display;
  if (item.phone_last9) return `0${item.phone_last9}`;
  return '—';
}

export default function CrmBlockedPhonesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState('');
  const [addNote, setAddNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const load = useCallback(async (nextOffset = 0, nextQ = q) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(nextOffset));
      if (nextQ) params.set('q', nextQ);
      const { data } = await api.get(`/crm/auto-lead-blocked-phones?${params.toString()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setOffset(nextOffset);
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi tải danh sách chặn');
    }
    setLoading(false);
  }, [q]);

  useEffect(() => { void load(0, ''); }, [load]);

  const onSubmitSearch = (e) => {
    e?.preventDefault?.();
    setQ(searchInput.trim());
    void load(0, searchInput.trim());
  };

  const onClearSearch = () => {
    setSearchInput('');
    setQ('');
    void load(0, '');
  };

  const handleAdd = async () => {
    setAddError('');
    if (!addPhone.trim()) {
      setAddError('Vui lòng nhập số điện thoại');
      return;
    }
    setAdding(true);
    try {
      await api.post('/crm/auto-lead-blocked-phones', {
        phone: addPhone.trim(),
        note: addNote.trim() || null,
      });
      setAddPhone('');
      setAddNote('');
      setAddOpen(false);
      void load(0, q);
    } catch (e) {
      setAddError(e?.response?.data?.error || 'Lỗi thêm SĐT chặn');
    }
    setAdding(false);
  };

  const handleDelete = async (item) => {
    if (!confirm(`Bỏ chặn số ${displayPhone(item)}?`)) return;
    try {
      await api.delete(`/crm/auto-lead-blocked-phones/${item.id}`);
      void load(offset, q);
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi bỏ chặn');
    }
  };

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + items.length, total);

  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-rose-600" /> Danh sách chặn khách hàng
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Các số điện thoại trong danh sách sẽ KHÔNG được tự động tạo lead từ Facebook hoặc khi quét SĐT.
            Khớp theo 9 số cuối (chuẩn thuê bao Việt Nam).
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setAddPhone(''); setAddNote(''); setAddError(''); setAddOpen(true); }}
          className="inline-flex items-center gap-1.5 h-9 px-3 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg shadow-sm cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Thêm SĐT chặn
        </button>
      </div>

      <form onSubmit={onSubmitSearch} className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo số điện thoại hoặc ghi chú…"
            className="w-full h-9 pl-9 pr-9 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-400 outline-none"
          />
          {searchInput && (
            <button
              type="button"
              onClick={onClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
              title="Xóa tìm kiếm"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button type="submit" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer">
          Tìm
        </button>
        <div className="text-xs text-gray-500 ml-auto">
          {total > 0 ? `${pageStart}–${pageEnd} / ${total}` : '0 số bị chặn'}
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-left text-xs text-white uppercase tracking-wide">
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Số điện thoại</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">9 số cuối</th>
                <th className="px-3 py-2.5 font-semibold">Ghi chú</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Người tạo</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Ngày chặn</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap text-center">Bỏ chặn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400 text-sm">
                    <Ban className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    {q ? 'Không có kết quả phù hợp' : 'Chưa có số nào trong danh sách chặn'}
                  </td>
                </tr>
              )}
              {!loading && items.map((it) => (
                <tr key={it.id} className="hover:bg-rose-50/40">
                  <td className="px-3 py-2 font-mono text-sm text-gray-900 whitespace-nowrap">{displayPhone(it)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{it.phone_last9}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">{it.note || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{it.creator?.full_name || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(it.created_at)}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleDelete(it)}
                      title="Bỏ chặn"
                      className="inline-flex items-center justify-center p-1.5 rounded text-rose-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-2 px-3 py-2 border-t bg-gray-50">
            <button
              type="button"
              disabled={!canPrev || loading}
              onClick={() => void load(Math.max(0, offset - PAGE_SIZE), q)}
              className="h-8 px-3 text-xs border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              ‹ Trước
            </button>
            <span className="text-xs text-gray-500">
              {pageStart}–{pageEnd} / {total}
            </span>
            <button
              type="button"
              disabled={!canNext || loading}
              onClick={() => void load(offset + PAGE_SIZE, q)}
              className="h-8 px-3 text-xs border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Sau ›
            </button>
          </div>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !adding && setAddOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ShieldOff className="h-4 w-4 text-rose-600" /> Thêm SĐT vào danh sách chặn
            </h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-gray-700">Số điện thoại</label>
                <input
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  autoFocus
                  placeholder="0xxx xxx xxx hoặc +84xxx…"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-400 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Ghi chú (tùy chọn)</label>
                <textarea
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  rows={3}
                  placeholder="Vd: spam, khách báo không quan tâm…"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-400 outline-none"
                />
              </div>
              {addError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{addError}</div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={adding}
                onClick={() => setAddOpen(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={adding || !addPhone.trim()}
                onClick={() => void handleAdd()}
                className="px-3 py-1.5 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Chặn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
