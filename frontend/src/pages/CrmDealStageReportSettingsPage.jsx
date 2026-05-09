import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { LayoutGrid, RefreshCw, Save, Building2 } from 'lucide-react';

const BUCKET_OPTIONS = [
  { v: '', l: 'Tự động (theo slug)' },
  { v: 'pre_contract', l: 'Chưa chốt' },
  { v: 'implementation', l: 'Đang triển khai' },
  { v: 'completed', l: 'Hoàn thành' },
  { v: 'lost', l: 'Thua' },
];

function normBucket(v) {
  if (v === '' || v == null) return null;
  return String(v);
}

export default function CrmDealStageReportSettingsPage() {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [stages, setStages] = useState([]);
  const [origBuckets, setOrigBuckets] = useState({});
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.get('/companies')
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, []);

  const load = async () => {
    if (!companyId) {
      setStages([]);
      setOrigBuckets({});
      setDraft({});
      return;
    }
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const { data } = await api.get('/crm/settings/deal-stage-report-buckets', {
        params: { company_id: companyId },
      });
      const list = data.stages || [];
      setStages(list);
      const o = {};
      const d = {};
      for (const s of list) {
        const b = normBucket(s.deal_report_bucket);
        o[s.id] = b;
        d[s.id] = b === null ? '' : b;
      }
      setOrigBuckets(o);
      setDraft(d);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      setStages([]);
      setOrigBuckets({});
      setDraft({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ tải khi đổi công ty
  }, [companyId]);

  const pendingUpdates = useMemo(() => {
    const out = [];
    for (const s of stages) {
      const cur = normBucket(draft[s.id]);
      const was = origBuckets[s.id] ?? null;
      if (cur !== was) out.push({ stage_id: s.id, deal_report_bucket: cur });
    }
    return out;
  }, [stages, draft, origBuckets]);

  const save = async () => {
    if (!companyId || !pendingUpdates.length) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await api.put('/crm/settings/deal-stage-report-buckets', {
        company_id: companyId,
        updates: pendingUpdates,
      });
      setMsg(`Đã lưu ${pendingUpdates.length} cột.`);
      await load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const sortStages = [...stages].sort((a, b) => {
    const pa = String(a.pipeline_name || '').localeCompare(String(b.pipeline_name || ''));
    if (pa !== 0) return pa;
    return (a.order_index ?? 0) - (b.order_index ?? 0);
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-slate-600" />
            Phân loại cột Deal (BC Lead/Deal theo NV)
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Gán mỗi cột pipeline Deal vào nhóm hiển thị trên báo cáo: Chưa chốt, Đang triển khai, Hoàn thành, Thua.
            Để trống &quot;Tự động&quot; thì hệ thống dùng slug và cờ thắng/thua như trước.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading || !companyId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !pendingUpdates.length || !companyId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Đang lưu…' : `Lưu (${pendingUpdates.length})`}
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          <option value="">Chọn công ty…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
          ))}
        </select>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>
      )}

      {!companyId && (
        <p className="text-sm text-slate-500">Chọn công ty để xem các cột pipeline Deal.</p>
      )}

      {companyId && loading && (
        <div className="flex justify-center py-12 text-slate-500 text-sm">Đang tải…</div>
      )}

      {companyId && !loading && sortStages.length === 0 && (
        <p className="text-sm text-slate-500">Không có cột Deal hoạt động cho công ty này.</p>
      )}

      {companyId && !loading && sortStages.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600 border-b border-slate-200">
                <th className="px-3 py-2 font-medium">Pipeline</th>
                <th className="px-3 py-2 font-medium">Cột</th>
                <th className="px-3 py-2 font-medium">Slug</th>
                <th className="px-3 py-2 font-medium">Thắng / Thua</th>
                <th className="px-3 py-2 font-medium min-w-[220px]">Nhóm báo cáo</th>
              </tr>
            </thead>
            <tbody>
              {sortStages.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="px-3 py-2 text-slate-800">{s.pipeline_name || '—'}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{s.name}</td>
                  <td className="px-3 py-2 text-slate-600 font-mono text-xs">{s.canonical_slug || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {s.is_won ? 'Thắng' : s.is_lost ? 'Thua' : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={draft[s.id] ?? ''}
                      onChange={(e) => setDraft((p) => ({ ...p, [s.id]: e.target.value }))}
                      className="w-full max-w-xs border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                    >
                      {BUCKET_OPTIONS.map((o) => (
                        <option key={o.v || 'auto'} value={o.v}>{o.l}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
