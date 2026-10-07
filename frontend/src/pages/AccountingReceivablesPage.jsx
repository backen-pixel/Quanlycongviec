import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, RefreshCw, Search, X, Users, ListOrdered } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND, formatDate } from '../lib/utils';
import { isAccountingUser } from '../lib/crossWorkshopProduction';

const BUCKET_TONE = {
  d0_30: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  d31_60: 'border-amber-200 bg-amber-50 text-amber-800',
  d61_90: 'border-orange-200 bg-orange-50 text-orange-800',
  d90_plus: 'border-red-200 bg-red-50 text-red-800',
  unknown: 'border-gray-200 bg-gray-50 text-gray-700',
};

function agingTone(days) {
  if (days == null) return 'text-gray-400';
  if (days > 90) return 'text-red-600 font-bold';
  if (days > 60) return 'text-orange-600 font-semibold';
  if (days > 30) return 'text-amber-600 font-semibold';
  return 'text-emerald-700';
}

export default function AccountingReceivablesPage() {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('deals');
  const [bucket, setBucket] = useState('');
  const [search, setSearch] = useState('');

  const params = useMemo(() => {
    if (!isAccountingUser(user) && user?.company_id) return { client_company_id: user.company_id };
    return {};
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/accounting/receivables', { params });
      setReport(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tải được công nợ');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const q = search.trim().toLowerCase();
  const items = useMemo(() => (report?.items || []).filter((i) => {
    if (bucket && i.aging_bucket !== bucket) return false;
    if (!q) return true;
    return [i.code, i.title, i.customer_name, i.customer_phone, i.project_code]
      .some((v) => String(v || '').toLowerCase().includes(q));
  }), [report, bucket, q]);

  const customers = useMemo(() => (report?.customers || []).filter((c) => {
    if (!q) return true;
    return [c.customer_name, c.customer_phone].some((v) => String(v || '').toLowerCase().includes(q));
  }), [report, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-teal-700 mb-1">
            <Wallet className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Kế toán · {report?.client_company?.short_name || report?.client_company?.name || 'Công ty'}</span>
          </div>
          <h1 className="text-xl font-extrabold text-gray-900">Công nợ phải thu</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            Tiền khách còn nợ, tính từ ngày bàn giao sản xuất (chưa có thì lấy ngày đơn hàng). Nợ càng lâu càng cần nhắc thu.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <button
          type="button"
          onClick={() => setBucket('')}
          className={`rounded-xl border px-3.5 py-2.5 text-left shadow-sm cursor-pointer ${!bucket ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-200' : 'border-gray-200 bg-white'}`}
        >
          <p className="text-[11px] font-semibold uppercase text-gray-500">Tổng còn thu</p>
          <p className="text-lg font-extrabold text-gray-900 tabular-nums">{loading ? '…' : formatVND(report?.total_outstanding || 0)}</p>
          <p className="text-xs text-gray-500">{report?.deal_count ?? 0} deal</p>
        </button>
        {(report?.buckets || []).filter((b) => b.key !== 'unknown' || b.count > 0).map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setBucket((cur) => (cur === b.key ? '' : b.key))}
            className={`rounded-xl border px-3.5 py-2.5 text-left shadow-sm cursor-pointer ${BUCKET_TONE[b.key]} ${bucket === b.key ? 'ring-2 ring-offset-1 ring-teal-400' : ''}`}
          >
            <p className="text-[11px] font-semibold uppercase opacity-80">{b.label}</p>
            <p className="text-lg font-extrabold tabular-nums">{formatVND(b.amount)}</p>
            <p className="text-xs opacity-80">{b.count} deal</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {[
            { id: 'deals', label: 'Theo deal', icon: ListOrdered },
            { id: 'customers', label: 'Theo khách', icon: Users },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={`h-8 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${view === t.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500'}`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[14rem] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm khách, mã deal, mã dự án..."
            className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="py-16 text-center text-sm text-gray-400">Đang tải...</p>
        ) : view === 'deals' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <th className="py-2.5 px-3">Deal / Khách</th>
                <th className="py-2.5 px-3">Dự án xưởng</th>
                <th className="py-2.5 px-3">VC/LĐ</th>
                <th className="py-2.5 px-3 text-right">Đơn hàng</th>
                <th className="py-2.5 px-3 text-right">Đã thu</th>
                <th className="py-2.5 px-3 text-right">Còn thu</th>
                <th className="py-2.5 px-3 text-right">Số ngày nợ</th>
                <th className="py-2.5 px-3">Hóa đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && (
                <tr><td colSpan={8} className="py-12 text-center text-gray-400">Không có khoản nợ nào.</td></tr>
              )}
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-teal-50/30">
                  <td className="py-2.5 px-3">
                    <Link to={`/ketoan/deals/${i.id}`} className="font-semibold text-teal-800 hover:underline">{i.code || 'Deal'}</Link>
                    <p className="text-gray-800 truncate max-w-[18rem]" title={i.title}>{i.title}</p>
                    <p className="text-xs text-gray-500">{[i.customer_name, i.customer_phone].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-gray-600">
                    <p className="font-medium text-gray-800">{i.project_code || '—'}</p>
                    <p>{i.workshop_name || ''}{i.sx_production_done ? ' · SX xong' : ''}</p>
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    {i.vc_phase && i.vc_phase !== 'none' ? (
                      <>
                        <p className={`font-semibold ${i.vc_done ? 'text-emerald-700' : 'text-sky-700'}`}>{i.vc_phase_label}</p>
                        <p className="text-gray-500">{i.vc_company_name || ''}</p>
                      </>
                    ) : <span className="text-gray-400">Chưa bàn giao</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{i.order_total != null ? formatVND(i.order_total) : '—'}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700">{formatVND(i.payments_received || 0)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-bold text-amber-700">{formatVND(i.outstanding_amount)}</td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${agingTone(i.aging_days)}`}>
                    {i.aging_days != null ? `${i.aging_days} ngày` : 'Chưa rõ'}
                    {i.aging_base && <p className="text-[10px] text-gray-400 font-normal">từ {formatDate(i.aging_base)}</p>}
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    {i.invoice_id
                      ? <span className="text-purple-700 font-semibold">Đã xuất</span>
                      : <Link to={`/ketoan/deals/${i.id}`} className="text-purple-600 hover:underline">Chưa xuất</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <th className="py-2.5 px-3">Khách hàng</th>
                <th className="py-2.5 px-3 text-right">Số deal nợ</th>
                <th className="py-2.5 px-3 text-right">Còn thu</th>
                <th className="py-2.5 px-3 text-right">Nợ lâu nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.length === 0 && (
                <tr><td colSpan={4} className="py-12 text-center text-gray-400">Không có khách nợ.</td></tr>
              )}
              {customers.map((c) => (
                <tr key={c.key} className="hover:bg-teal-50/30 cursor-pointer" onClick={() => { setSearch(c.customer_phone || c.customer_name); setView('deals'); }}>
                  <td className="py-2.5 px-3">
                    <p className="font-semibold text-gray-900">{c.customer_name}</p>
                    <p className="text-xs text-gray-500">{c.customer_phone || ''}</p>
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{c.deal_count}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-bold text-amber-700">{formatVND(c.amount)}</td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${agingTone(c.oldest_days)}`}>
                    {c.oldest_days != null ? `${c.oldest_days} ngày` : 'Chưa rõ'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
