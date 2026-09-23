import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calculator, ChevronDown, ChevronRight, Download, Plus, RefreshCw, Search, Settings, Trash2,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND, formatDate } from '../lib/utils';
import { isAccountingUser } from '../lib/crossWorkshopProduction';

const SOURCE_LABEL = {
  'sx.production_value': 'Chi phí xưởng',
  'sx.project_expense': 'Phát sinh SX',
  'purchasing.po': 'Mua hàng',
  'vc.shipping': 'Phí VC / lắp',
  'crm.product_cogs': 'Giá vốn CRM',
  'crm.manual': 'Nhập tay CRM',
  'ketoan.manual': 'Nhập tay Kế toán',
};

function Kpi({ label, value, sub, tone = 'default' }) {
  const tones = {
    default: 'border-gray-200 bg-white',
    cost: 'border-orange-200 bg-orange-50/50',
    profit: 'border-emerald-200 bg-emerald-50/50',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${tones[tone] || tones.default}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-extrabold text-gray-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AccountingCostHubPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [company, setCompany] = useState(null);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entryLoading, setEntryLoading] = useState(false);
  const [manual, setManual] = useState({ amount: '', note: '', source_key: 'ketoan.manual' });
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const limit = 50;

  const adminParams = useMemo(() => {
    if (!isAccountingUser(user) && user?.company_id) return { client_company_id: user.company_id };
    return {};
  }, [user]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [searchDebounced]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const { data } = await api.get('/cost-hub/projects', {
        params: { ...adminParams, page, limit, search: searchDebounced || undefined },
      });
      setRows(data.projects || []);
      setTotal(data.total || 0);
      setCompany(data.client_company || null);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tải được sổ chi phí');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [adminParams, page, searchDebounced]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const kpis = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const cost = rows.reduce((s, r) => s + (Number(r.gia_von) || 0), 0);
    const profit = rows.reduce((s, r) => s + (Number(r.loi_nhuan_gop) || 0), 0);
    return { revenue, cost, profit };
  }, [rows]);

  const openBreakdown = async (projectId) => {
    if (openId === projectId) { setOpenId(null); return; }
    setOpenId(projectId);
    setEntryLoading(true);
    try {
      const { data } = await api.get('/cost-hub/entries', { params: { ...adminParams, project_id: projectId } });
      setEntries(data.entries || []);
    } catch (e) {
      setEntries([]);
      alert(e.response?.data?.error || e.message);
    } finally {
      setEntryLoading(false);
    }
  };

  const addManual = async (projectId) => {
    const amount = Number(manual.amount);
    if (!(amount > 0)) return alert('Nhập số tiền > 0');
    setSaving(true);
    try {
      await api.post('/cost-hub/entries', {
        project_id: projectId,
        amount,
        note: manual.note || null,
        source_key: manual.source_key,
      }, { params: adminParams });
      setManual({ amount: '', note: '', source_key: 'ketoan.manual' });
      await openBreakdown(projectId);
      setOpenId(projectId);
      await load(true);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const voidEntry = async (id, projectId) => {
    if (!confirm('Hủy dòng chi phí này?')) return;
    try {
      await api.post(`/cost-hub/entries/${id}/void`, { reason: 'Hủy trên sổ' }, { params: adminParams });
      const { data } = await api.get('/cost-hub/entries', { params: { ...adminParams, project_id: projectId } });
      setEntries(data.entries || []);
      await load(true);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/cost-hub/export', {
        params: { ...adminParams, search: searchDebounced || undefined },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'so-chi-phi.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không xuất được');
    }
  };

  const handleBackfill = async () => {
    if (!confirm('Đẩy lại chi phí xưởng, phát sinh và PO của công ty này lên sổ? An toàn — không nhân bản.')) return;
    setBackfilling(true);
    try {
      const { data } = await api.post('/cost-hub/backfill', {}, { params: adminParams });
      alert(`Đã đồng bộ ${data.synced || 0} dòng.`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setBackfilling(false);
    }
  };

  const companyLabel = company?.short_name || company?.name || 'Công ty';
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (!isAccountingUser(user) && user?.role !== 'admin' && user?.role !== 'ecosystem_admin' && user?.role !== 'manager' && user?.role !== 'sales_admin' && user?.role !== 'platform_admin') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-amber-800 font-medium">Sổ chi phí dành cho kế toán công ty hoặc admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-teal-700 mb-1">
            <Calculator className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Sổ chi phí</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Chi phí dự án — {companyLabel}</h1>
          <p className="text-sm text-gray-500 mt-1">Dòng từ SX, mua hàng, VC, CRM gom về một sổ. Công thức tại trang setup.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/ketoan/chi-phi/setup"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" /> Công thức
          </Link>
          <button type="button" onClick={handleBackfill} disabled={backfilling} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            Đồng bộ nguồn
          </button>
          <button type="button" onClick={handleExport} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" /> Xuất CSV
          </button>
          <button type="button" onClick={() => load(true)} disabled={refreshing} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Làm mới
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Doanh thu (trang này)" value={formatVND(kpis.revenue)} sub={`${total} dự án`} />
        <Kpi label="Giá vốn" value={formatVND(kpis.cost)} tone="cost" />
        <Kpi label="Lợi nhuận gộp" value={formatVND(kpis.profit)} tone="profit" />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm mã hoặc tên dự án…"
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Dự án</th>
              <th className="text-right px-3 py-2 font-semibold">Doanh thu</th>
              <th className="text-right px-3 py-2 font-semibold">Xưởng</th>
              <th className="text-right px-3 py-2 font-semibold">Mua hàng</th>
              <th className="text-right px-3 py-2 font-semibold">VC</th>
              <th className="text-right px-3 py-2 font-semibold">COGS</th>
              <th className="text-right px-3 py-2 font-semibold">Giá vốn</th>
              <th className="text-right px-3 py-2 font-semibold">Lợi nhuận</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Đang tải…</td></tr>
            ) : !rows.length ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Chưa có dự án trong sổ. Bấm Đồng bộ nguồn nếu đã có chi phí xưởng.</td></tr>
            ) : rows.map((r) => (
              <FragmentRow
                key={r.project_id}
                row={r}
                open={openId === r.project_id}
                onToggle={() => openBreakdown(r.project_id)}
                entries={openId === r.project_id ? entries : []}
                entryLoading={openId === r.project_id && entryLoading}
                manual={manual}
                setManual={setManual}
                saving={saving}
                onAdd={() => addManual(r.project_id)}
                onVoid={(id) => voidEntry(id, r.project_id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 px-3 rounded border disabled:opacity-40">Trước</button>
          <span>Trang {page}/{totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 px-3 rounded border disabled:opacity-40">Sau</button>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ row, open, onToggle, entries, entryLoading, manual, setManual, saving, onAdd, onVoid }) {
  const src = row.by_source || {};
  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
            <div>
              <p className="font-semibold text-gray-900">{row.code}</p>
              <p className="text-xs text-gray-500">{row.name}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{formatVND(row.revenue || 0)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatVND(src['sx.production_value'] || 0)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatVND(src['purchasing.po'] || 0)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatVND(src['vc.shipping'] || 0)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatVND(src['crm.product_cogs'] || 0)}</td>
        <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatVND(row.gia_von || 0)}</td>
        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${(row.loi_nhuan_gop || 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatVND(row.loi_nhuan_gop || 0)}</td>
      </tr>
      {open && (
        <tr className="bg-slate-50">
          <td colSpan={8} className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
            {entryLoading ? <p className="text-sm text-gray-500">Đang tải dòng…</p> : (
              <div className="space-y-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left py-1">Ngày</th>
                      <th className="text-left py-1">Nguồn</th>
                      <th className="text-left py-1">Ghi chú</th>
                      <th className="text-right py-1">Số tiền</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(entries || []).map((e) => (
                      <tr key={e.id} className="border-t border-gray-100">
                        <td className="py-1">{formatDate(e.entry_date)}</td>
                        <td className="py-1">{SOURCE_LABEL[e.source_key] || e.source_key}</td>
                        <td className="py-1 text-gray-600">{e.note || '—'}</td>
                        <td className="py-1 text-right tabular-nums font-medium">{formatVND(e.amount)}</td>
                        <td className="py-1 text-right">
                          {e.origin === 'manual' && (
                            <button type="button" onClick={() => onVoid(e.id)} className="text-red-500 hover:text-red-700 p-1">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!entries.length && <tr><td colSpan={5} className="py-2 text-gray-400">Chưa có dòng. Thêm tay hoặc đồng bộ nguồn.</td></tr>}
                  </tbody>
                </table>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-gray-600">
                    Số tiền
                    <input value={manual.amount} onChange={(e) => setManual((m) => ({ ...m, amount: e.target.value }))} className="mt-0.5 block h-8 w-32 px-2 rounded border text-sm" />
                  </label>
                  <label className="text-xs text-gray-600">
                    Nguồn
                    <select value={manual.source_key} onChange={(e) => setManual((m) => ({ ...m, source_key: e.target.value }))} className="mt-0.5 block h-8 px-2 rounded border text-sm">
                      <option value="ketoan.manual">Nhập tay Kế toán</option>
                      <option value="crm.manual">Nhập tay CRM</option>
                      <option value="vc.shipping">Phí VC / lắp</option>
                    </select>
                  </label>
                  <label className="text-xs text-gray-600 grow">
                    Ghi chú
                    <input value={manual.note} onChange={(e) => setManual((m) => ({ ...m, note: e.target.value }))} className="mt-0.5 block h-8 w-full px-2 rounded border text-sm" />
                  </label>
                  <button type="button" onClick={onAdd} disabled={saving} className="h-8 px-3 rounded-lg bg-teal-600 text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-60">
                    <Plus className="h-3.5 w-3.5" /> Thêm dòng
                  </button>
                  {row.lead_id && (
                    <Link to={`/ketoan/deals/${row.lead_id}`} className="h-8 px-3 rounded-lg border text-xs font-medium text-indigo-700">Mở deal Kế toán</Link>
                  )}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
