import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { Loader2, RefreshCw, ArrowDownCircle, ArrowUpCircle, FileText, Receipt, ShoppingCart, Landmark } from 'lucide-react';

const FLOW_LABEL = {
  reference: 'Tham chiếu',
  payable: 'Phải thu (HĐ)',
  in: 'Thu tiền',
  out: 'Chi',
};

const KIND_LABEL = {
  quotation: 'Báo giá',
  quotation_deposit: 'Cọc (BG)',
  order: 'Đơn hàng',
  invoice: 'Hóa đơn',
  payment_in: 'Thanh toán',
  expense_out: 'Chi phí',
};

function kindIcon(kind) {
  if (kind === 'quotation' || kind === 'quotation_deposit') return FileText;
  if (kind === 'order') return ShoppingCart;
  if (kind === 'invoice' || kind === 'payment_in') return Receipt;
  if (kind === 'expense_out') return ArrowUpCircle;
  return Landmark;
}

export default function ProjectCashflowTab({ projectId }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [exForm, setExForm] = useState({ amount: '', expense_date: new Date().toISOString().slice(0, 10), category: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const { data: d } = await api.get(`/projects/${projectId}/cashflow`);
      setData(d);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi tải');
      setData(null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const addExpense = async (e) => {
    e.preventDefault();
    const raw = String(exForm.amount).replace(/[^\d]/g, '');
    const amount = parseInt(raw, 10);
    if (!amount || amount <= 0) {
      alert('Nhập số tiền chi hợp lệ');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/expenses`, {
        amount,
        expense_date: exForm.expense_date || null,
        category: exForm.category || null,
        description: exForm.description || null,
      });
      setExForm((f) => ({ ...f, amount: '', description: '' }));
      await load();
    } catch (e2) {
      alert(e2.response?.data?.error || e2.message || 'Lỗi lưu');
    }
    setSaving(false);
  };

  const s = data?.summary;
  const basisText =
    s?.remaining_basis === 'invoice'
      ? 'Theo tổng còn nợ trên hóa đơn'
      : s?.remaining_basis === 'order'
        ? 'Theo tổng còn nợ trên đơn hàng (chưa có HĐ hoặc HĐ ngoài dự án)'
        : s?.remaining_basis === 'quotation'
          ? 'Ước tính từ báo giá (chưa có đơn/HĐ) — trừ tổng cọc ghi trên BG'
          : '—';

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Đang tải thu chi…
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {err}
        <button type="button" onClick={load} className="ml-3 text-red-600 underline">Thử lại</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Thu chi & còn lại theo dự án</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Gộp báo giá, đơn hàng, hóa đơn và từng lần thu (payment). Chi phí ghi nhận thủ công ở dưới.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="h-9 px-3 border rounded-lg text-sm flex items-center gap-1.5 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" /> Làm mới
        </button>
      </div>

      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-[11px] font-medium text-gray-500 uppercase">Báo giá</div>
            <div className="text-lg font-bold text-gray-900 mt-1">{formatVND(s.quotations?.total_sum || 0)}</div>
            <div className="text-xs text-gray-500 mt-1">Cọc (trên BG): {formatVND(s.quotations?.deposits_sum || 0)}</div>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="text-[11px] font-medium text-indigo-800 uppercase">Đơn hàng</div>
            <div className="text-lg font-bold text-indigo-950 mt-1">{formatVND(s.orders?.total_sum || 0)}</div>
            <div className="text-xs text-indigo-800/80 mt-1">Đã thu (trên ĐH): {formatVND(s.orders?.paid_sum || 0)}</div>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
            <div className="text-[11px] font-medium text-violet-800 uppercase">Hóa đơn</div>
            <div className="text-lg font-bold text-violet-950 mt-1">{formatVND(s.invoices?.total_sum || 0)}</div>
            <div className="text-xs text-violet-800/80 mt-1">Đã thu: {formatVND(s.invoices?.paid_sum || 0)}</div>
          </div>
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
            <div className="text-[11px] font-medium text-emerald-900 uppercase">Còn phải thu (ước)</div>
            <div className="text-xl font-bold text-emerald-900 mt-1">{formatVND(s.remaining_to_collect || 0)}</div>
            <div className="text-[10px] text-emerald-800/90 mt-1 leading-snug">{basisText}</div>
          </div>
        </div>
      )}

      {s && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm">
            <span className="text-emerald-900 font-medium">Tổng đã thu (theo lịch sử TT)</span>
            <div className="text-lg font-bold text-emerald-900">{formatVND(s.payments_recorded_sum || 0)}</div>
          </div>
          <div className="rounded-lg border border-rose-100 bg-rose-50/60 px-4 py-3 text-sm">
            <span className="text-rose-900 font-medium">Tổng chi (ghi nhận)</span>
            <div className="text-lg font-bold text-rose-900">{formatVND(s.expenses_sum || 0)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-700 font-medium">Thu − chi (tham khảo)</span>
            <div className="text-lg font-bold text-slate-900">{formatVND(s.net_cash_vs_expenses || 0)}</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2 border-b bg-gray-50">
          <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">Lịch sử (mới → cũ)</h4>
        </div>
        <div className="overflow-x-auto max-h-[min(520px,55vh)] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white shadow-sm z-10">
              <tr className="text-left text-[11px] text-gray-500 uppercase">
                <th className="py-2 px-3">Loại</th>
                <th className="py-2 px-3">Diễn giải</th>
                <th className="py-2 px-3 text-right">Số tiền</th>
                <th className="py-2 px-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {(data?.timeline || []).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-gray-400 text-sm">Chưa có dữ liệu thu chi.</td>
                </tr>
              )}
              {(data?.timeline || []).map((row) => {
                const Icon = kindIcon(row.kind);
                const isOut = row.flow === 'out';
                const isIn = row.flow === 'in';
                return (
                  <tr key={`${row.kind}-${row.id}`} className="border-t border-gray-100 hover:bg-gray-50/80">
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="font-medium text-gray-800">{KIND_LABEL[row.kind] || row.kind}</span>
                      </span>
                      <div className="text-[10px] text-gray-400 mt-0.5">{FLOW_LABEL[row.flow] || row.flow}</div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-medium text-gray-900">{row.title}</div>
                      {row.subtitle && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{row.subtitle}</div>}
                      {row.paid_snapshot != null && row.kind !== 'payment_in' && (
                        <div className="text-[11px] text-emerald-700 mt-1">Đã thu (ghi trên chứng từ): {formatVND(row.paid_snapshot)}</div>
                      )}
                    </td>
                    <td className={`py-2 px-3 text-right font-semibold tabular-nums ${isOut ? 'text-rose-700' : isIn ? 'text-emerald-700' : 'text-gray-900'}`}>
                      {isOut ? '−' : ''}{formatVND(row.amount || 0)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {row.href && (
                        <button
                          type="button"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => navigate(row.href)}
                        >
                          Mở
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
        <h4 className="text-sm font-bold text-amber-950 mb-2 flex items-center gap-2">
          <ArrowDownCircle className="h-4 w-4" /> Ghi nhận chi phí dự án
        </h4>
        <p className="text-xs text-amber-900/80 mb-3">
          Dùng cho chi phí phát sinh (vật tư bổ sung, ngoài chứng từ…). Thu tiền khách hàng vẫn ghi qua <strong>Hóa đơn → Thu tiền</strong> trong CRM.
        </p>
        <form onSubmit={addExpense} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Ngày</label>
            <input
              type="date"
              value={exForm.expense_date}
              onChange={(e) => setExForm((f) => ({ ...f, expense_date: e.target.value }))}
              className="w-full h-10 px-3 border rounded-lg text-sm mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Số tiền (VNĐ)</label>
            <input
              value={exForm.amount}
              onChange={(e) => setExForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="vd: 1500000"
              className="w-full h-10 px-3 border rounded-lg text-sm mt-1"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs text-gray-600">Danh mục</label>
            <input
              value={exForm.category}
              onChange={(e) => setExForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Vật tư / Giao nhận…"
              className="w-full h-10 px-3 border rounded-lg text-sm mt-1"
            />
          </div>
          <div className="md:col-span-4">
            <label className="text-xs text-gray-600">Mô tả</label>
            <input
              value={exForm.description}
              onChange={(e) => setExForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full h-10 px-3 border rounded-lg text-sm mt-1"
            />
          </div>
          <div className="md:col-span-1">
            <button
              type="submit"
              disabled={saving}
              className="w-full h-10 px-3 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? '…' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
