import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { Clock, Save, RefreshCw, Building2 } from 'lucide-react';

const FIELD_OPTIONS = [
  { v: 'kanban_deadline_at', l: 'Deadline thẻ (kanban_deadline_at)' },
  { v: 'crm_next_open_task_deadline', l: 'Ngày hẹn NV CRM mở mới nhất (theo cập nhật gần nhất)' },
  { v: 'expected_close_date', l: 'Ngày dự kiến đóng (expected_close_date)' },
];

const BUCKETS_DEF = [
  { key: 'overdue',     label: 'Quá hạn',       hasDays: false },
  { key: 'today',       label: 'Hôm nay',       hasDays: false },
  { key: 'this_week',   label: 'Tuần này',      hasDays: false },
  { key: 'next_week',   label: 'Tuần sau',      hasDays: false },
  { key: 'in_2_weeks',  label: 'Trong 2 tuần',  hasDays: true,  defaultDays: 14 },
  { key: 'in_3_weeks',  label: 'Trong 3 tuần',  hasDays: true,  defaultDays: 21 },
  { key: 'in_4_weeks',  label: 'Trong 4 tuần',  hasDays: true,  defaultDays: 28 },
  { key: 'in_1_month',  label: 'Trong 1 tháng', hasDays: true,  defaultDays: 30 },
  { key: 'next_month',  label: 'Tháng sau',     hasDays: false },
  { key: 'no_deadline', label: 'Không hạn',     hasDays: false },
];

export default function CrmDeadlineSettingsPage() {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [primaryField, setPrimaryField] = useState('crm_next_open_task_deadline');
  const [fallbackField, setFallbackField] = useState('expected_close_date');
  const [buckets, setBuckets] = useState({});
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
    if (!companyId) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const { data } = await api.get('/crm/settings/deadline-config', { params: { company_id: companyId } });
      setPrimaryField(data?.primary_field || 'crm_next_open_task_deadline');
      setFallbackField(data?.fallback_field || '');
      const initBuckets = {};
      BUCKETS_DEF.forEach((b) => {
        const cur = (data?.buckets || {})[b.key] || {};
        initBuckets[b.key] = {
          enabled: cur.enabled !== false,
          label: cur.label || b.label,
          ...(b.hasDays ? { days: Number(cur.days) > 0 ? Number(cur.days) : b.defaultDays } : {}),
        };
      });
      setBuckets(initBuckets);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId]);

  const fallbackOptions = useMemo(
    () => [{ v: '', l: '— Không dùng —' }, ...FIELD_OPTIONS.filter(f => f.v !== primaryField)],
    [primaryField],
  );

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await api.put('/crm/settings/deadline-config', {
        company_id: Number(companyId),
        primary_field: primaryField,
        fallback_field: fallbackField || null,
        buckets,
      });
      setMsg('Đã lưu cấu hình deadline.');
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateBucket = (key, patch) => {
    setBuckets((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <Clock className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Cấu hình Deadline CRM</h1>
          <p className="text-xs text-gray-500">Chọn trường nguồn deadline và bật/tắt các nhóm thời gian hiển thị ở view Deadline.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 mb-4">
        <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> Công ty
        </label>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
          className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">— Chọn công ty —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {companyId && (
        <>
          {loading ? (
            <div className="bg-white rounded-xl border p-6 text-center text-sm text-gray-500">
              <RefreshCw className="h-4 w-4 inline-block animate-spin mr-1" /> Đang tải…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border p-4">
                <p className="text-sm font-bold mb-2" style={{ color: '#000000' }}>Trường nguồn deadline</p>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Trường chính</label>
                    <select value={primaryField} onChange={(e) => {
                      const v = e.target.value;
                      setPrimaryField(v);
                      if (fallbackField === v) setFallbackField('');
                    }}
                      className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {FIELD_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Trường dự phòng (khi trường chính rỗng)</label>
                    <select value={fallbackField} onChange={(e) => setFallbackField(e.target.value)}
                      className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {fallbackOptions.map(o => <option key={o.v || 'none'} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border p-4">
                <p className="text-sm font-bold mb-2" style={{ color: '#000000' }}>Các nhóm hiển thị</p>
                <div className="divide-y">
                  {BUCKETS_DEF.map((b) => {
                    const cur = buckets[b.key] || { enabled: true, label: b.label };
                    return (
                      <div key={b.key} className="py-2 flex items-center gap-3 flex-wrap">
                        <label className="inline-flex items-center gap-2 min-w-[140px] cursor-pointer">
                          <input type="checkbox" checked={cur.enabled !== false}
                            onChange={(e) => updateBucket(b.key, { enabled: e.target.checked })} />
                          <span className="text-sm font-medium text-gray-800">{b.label}</span>
                        </label>
                        <input type="text" value={cur.label || ''}
                          onChange={(e) => updateBucket(b.key, { label: e.target.value })}
                          placeholder="Nhãn hiển thị"
                          className="h-8 px-2 border rounded text-sm flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        {b.hasDays && (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <span>Ngưỡng</span>
                            <input type="number" min={1} max={365} value={cur.days || b.defaultDays}
                              onChange={(e) => updateBucket(b.key, { days: Number(e.target.value) || b.defaultDays })}
                              className="w-16 h-8 px-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <span>ngày</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {err && <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-rose-700 text-sm">{err}</div>}
              {msg && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-700 text-sm">{msg}</div>}

              <div className="flex items-center gap-2">
                <button onClick={save} disabled={saving}
                  className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5">
                  <Save className="h-4 w-4" /> {saving ? 'Đang lưu…' : 'Lưu'}
                </button>
                <button onClick={load} disabled={loading}
                  className="h-10 px-4 rounded-lg border text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5">
                  <RefreshCw className="h-4 w-4" /> Tải lại
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
