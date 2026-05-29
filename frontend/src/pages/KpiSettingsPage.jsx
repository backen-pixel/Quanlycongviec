import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND } from '../lib/utils';
import {
  Settings,
  Save,
  AlertTriangle,
  Plus,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  RefreshCw,
  Clock,
  CalendarDays,
  UserMinus,
  GitBranch,
  Wand2,
  Building2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Paperclip,
  UserCog,
} from 'lucide-react';
import KpiUserFilter from '../components/KpiUserFilter';
import {
  KPI_SETTINGS_ROLE_FILTER_OPTIONS,
  definitionMatchesRoleFilter,
  crmSettingsShowsDealTemplates,
} from '../lib/kpiRoleApplies';

const FORMULA_OPTIONS = [
  { v: 'increasing', l: 'Tăng dần (cao = tốt)' },
  { v: 'decreasing', l: 'Giảm dần (thấp = tốt)' },
  { v: 'quantity', l: 'Số lượng (theo target)' },
  { v: 'revenue', l: 'Doanh số (theo target)' },
  { v: 'duration', l: 'Thời gian (thấp = tốt)' },
];

const APPLIES_TO_OPTIONS = [
  { v: 'sales', l: 'Sales (SAE)' },
  { v: 'sales_admin', l: 'Sales Admin' },
  { v: 'sales_all', l: 'Sales + Sales Admin' },
  { v: 'deal', l: 'Deal' },
  { v: 'all', l: 'Tất cả' },
];

const GROUP_OPTIONS = [
  { v: 'A', l: 'A — Tốc độ & kỷ luật' },
  { v: 'B', l: 'B — Chất lượng chuyển đổi' },
  { v: 'C', l: 'C — Kết quả kinh doanh' },
];

function getDefaultPeriodStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

function companyOptionLabel(c) {
  if (!c) return '';
  return c.short_name || c.name || String(c.id);
}

/** Mẫu CRM hiển thị khi lọc công ty: có ít nhất một item không giới hạn công ty hoặc gồm companyId. */
function crmTemplateVisibleForCompany(tpl, companyId) {
  if (!companyId) return true;
  const items = tpl.items || [];
  if (!items.length) return true;
  return items.some((it) => {
    let arr = it.default_allowed_companies;
    if (arr == null || arr === '') return true;
    if (typeof arr === 'string') {
      try {
        arr = JSON.parse(arr);
      } catch {
        return true;
      }
    }
    if (!Array.isArray(arr) || arr.length === 0) return true;
    return arr.map(String).includes(String(companyId));
  });
}

/** Nhóm A — thông số thời gian (SLA phút, mục tiêu phút, giờ HC…). */
function GroupATimeParamsPanel({ defs, edits, setEdits, save, savingId }) {
  const groupA = defs.filter((d) => d.group_code === 'A' && d.is_active !== false);
  const a1 = groupA.find((d) => d.code === 'A1');
  if (!groupA.length) return null;

  const calcVal = (d, key, fallback) => {
    const patch = edits[d.id]?.calc_params;
    if (patch && patch[key] != null && patch[key] !== '') return patch[key];
    const fromDb = d.calc_params?.[key];
    if (fromDb != null && fromDb !== '') return fromDb;
    return fallback;
  };

  const setCalcParam = (def, key, raw) => {
    const n = raw === '' ? null : Number(raw);
    setEdits((p) => {
      const prev = p[def.id] || {};
      const baseParams = { ...(def.calc_params || {}), ...(prev.calc_params || {}) };
      if (n == null || !Number.isFinite(n)) delete baseParams[key];
      else baseParams[key] = n;
      return {
        ...p,
        [def.id]: { ...prev, calc_params: baseParams },
      };
    });
  };

  const targetVal = (d) => {
    if (Object.hasOwn(edits[d.id] || {}, 'target_default')) return edits[d.id].target_default;
    return d.target_default;
  };

  return (
    <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Clock className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-sm" style={{ color: '#000000' }}>Nhóm A — thông số thời gian</h3>
          <p className="text-xs text-blue-800 mt-0.5">
            Giờ hành chính &amp; ngày lễ: tab <strong>Lịch làm việc</strong>. SLA cột deal (A5/A6): tab <strong>Pipeline KPI</strong> / Cài đặt pipeline CRM.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        {a1 && (
          <label className="bg-white border border-blue-100 rounded-lg px-3 py-2 block">
            <span className="text-gray-700 font-medium">A1 — SLA phản hồi lead (phút)</span>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Dùng khi đếm % lead chạm trong hạn. Mục tiêu % vẫn chỉnh ở cột «Mục tiêu» (vd. 90%).
            </p>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                min={1}
                max={240}
                step={1}
                value={calcVal(a1, 'sla_minutes', 15)}
                onChange={(e) => setCalcParam(a1, 'sla_minutes', e.target.value)}
                className="w-24 px-2 py-1 border rounded text-right"
              />
              <span className="text-gray-500 text-xs">phút (mặc định 15)</span>
              <button
                type="button"
                disabled={!edits[a1.id] || savingId === a1.id}
                onClick={() => save(a1)}
                className="ml-auto px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-40"
              >
                Lưu A1
              </button>
            </div>
          </label>
        )}
        {groupA.filter((d) => d.code === 'A2').map((d) => (
          <div key={d.id} className="bg-white border border-blue-100 rounded-lg px-3 py-2">
            <span className="text-gray-700 font-medium">A2 — thời gian phản hồi TB (phút)</span>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Ngưỡng chấm điểm = cột <strong>Mục tiêu mặc định</strong> hiện tại:{' '}
              <strong>{targetVal(d) ?? '—'}</strong> phút (median giờ HC).
            </p>
          </div>
        ))}
        {groupA.filter((d) => d.code === 'A4').map((d) => (
          <div key={d.id} className="bg-white border border-amber-100 rounded-lg px-3 py-2">
            <span className="text-gray-700 font-medium">A4 — follow-up đúng hạn (gating)</span>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Ngưỡng gating = cột <strong>Ngưỡng tối thiểu</strong> (vd. 80%). Deadline từng NV CRM trên lead/deal.
            </p>
          </div>
        ))}
        {groupA.filter((d) => ['A5', 'A6'].includes(d.code)).map((d) => (
          <div key={d.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
            <span className="font-medium text-gray-800">{d.code}</span> — SLA theo <code className="bg-gray-100 px-1 rounded">sla_days</code> từng cột pipeline (CRM → Cài đặt pipeline).
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 1: Definitions
// ═════════════════════════════════════════════════════════════════════════════
function DefinitionsTab({ companyId, roleFilter }) {
  const [defs, setDefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [edits, setEdits] = useState({}); // id -> patch
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/kpi/definitions');
      setDefs(data.definitions || []);
      setEdits({});
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalWeight = useMemo(() => {
    return defs.reduce((s, d) => {
      if (!d.is_active && !edits[d.id]?.is_active) return s;
      if (edits[d.id]?.is_active === false) return s;
      const w = edits[d.id]?.weight ?? d.weight;
      return s + Number(w || 0);
    }, 0);
  }, [defs, edits]);

  const defsFiltered = useMemo(
    () => defs.filter((d) => definitionMatchesRoleFilter(d.applies_to, roleFilter)),
    [defs, roleFilter],
  );

  const setEdit = (id, field, value) => {
    setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [field]: value } }));
  };

  const save = async (def) => {
    const patch = edits[def.id];
    if (!patch) return;
    setSavingId(def.id);
    setErr(null);
    setMsg(null);
    try {
      const { data } = await api.patch(`/kpi/definitions/${def.id}`, patch);
      setDefs((arr) => arr.map((d) => (d.id === def.id ? { ...d, ...data.definition } : d)));
      setEdits((p) => { const n = { ...p }; delete n[def.id]; return n; });
      setMsg(`Đã lưu ${def.code}. Tổng weight active: ${data.total_active_weight}${data.weight_warning ? ' (cảnh báo: khác 100)' : ''}`);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {roleFilter && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Đang <strong>lọc hiển thị</strong> theo vai trò <code className="bg-amber-100 px-1 rounded">{roleFilter}</code> — chỉ các KPI có cột «Áp dụng»
          khớp vai trò này (cột <code className="bg-amber-100 px-1 rounded">applies_to</code> trong DB). Sửa vẫn ghi vào cấu hình chung; đổi «Áp dụng» trên từng KPI để điều chỉnh vai trò được chấm.
        </div>
      )}
      {companyId && (
        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Đang lọc theo công ty trên thanh phía trên. <strong>Thông số 15 KPI</strong> là cấu hình <em>chung toàn hệ thống</em> (không tách theo công ty);
          dùng tab Target / Pipeline / Lịch làm việc để cấu hình riêng từng công ty.
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-700">
            Tổng trọng số đang kích hoạt: <strong className={totalWeight === 100 ? 'text-emerald-700' : 'text-red-600'}>{totalWeight}</strong>
            <span className="text-gray-500"> / 100</span>
          </span>
          {roleFilter && (
            <span className="text-xs text-gray-500">
              · Hiển thị <strong>{defsFiltered.length}</strong> / {defs.length} KPI
            </span>
          )}
          {totalWeight !== 100 && (
            <span className="text-xs text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Khuyến nghị giữ tổng = 100 để dễ chấm điểm.
            </span>
          )}
        </div>
        <button onClick={load} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Tải lại
        </button>
      </div>

      
      <GroupATimeParamsPanel
        defs={defs}
        edits={edits}
        setEdits={setEdits}
        save={save}
        savingId={savingId}
      />

      {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>}
      {msg && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700">{msg}</div>}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Đang tải…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
              <tr>
                <th className="text-left px-3 py-2.5 sticky left-0 bg-gray-50">Mã</th>
                <th className="text-left px-3 py-2.5 min-w-[280px]">Tên KPI</th>
                <th className="text-left px-3 py-2.5">Nhóm</th>
                <th className="text-left px-3 py-2.5 min-w-[180px]">Công thức</th>
                <th className="text-right px-3 py-2.5">Trọng số</th>
                <th className="text-right px-3 py-2.5">Mục tiêu mặc định</th>
                <th className="text-right px-3 py-2.5">Ngưỡng tối thiểu</th>
                <th className="text-center px-3 py-2.5">Gating</th>
                <th className="text-center px-3 py-2.5">Áp dụng</th>
                <th className="text-center px-3 py-2.5">Bật</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {defsFiltered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-gray-500 text-sm">
                    Không có KPI nào khớp vai trò đã chọn. Chọn «Tất cả vai trò» hoặc chỉnh cột «Áp dụng» (applies_to) trên từng KPI.
                  </td>
                </tr>
              ) : (
                defsFiltered.map((d) => {
                const e = edits[d.id] || {};
                const dirty = Object.keys(e).length > 0;
                const v = (k) => (Object.hasOwn(e, k) ? e[k] : d[k]);
                return (
                  <tr key={d.id} className={`border-t hover:bg-blue-50/30 ${dirty ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-2 sticky left-0 bg-inherit font-mono font-semibold text-gray-700">{d.code}</td>
                    <td className="px-3 py-2">
                      <input
                        value={v('name') || ''}
                        onChange={(ev) => setEdit(d.id, 'name', ev.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                      {(v('description')) && (
                        <div className="text-[11px] text-gray-500 mt-0.5">{v('description')}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={v('group_code')}
                        onChange={(ev) => setEdit(d.id, 'group_code', ev.target.value)}
                        className="px-2 py-1 border rounded text-sm"
                      >
                        {GROUP_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={v('formula_type')}
                        onChange={(ev) => setEdit(d.id, 'formula_type', ev.target.value)}
                        className="px-2 py-1 border rounded text-sm w-full"
                      >
                        {FORMULA_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                      <div className="text-[10px] text-gray-500 mt-0.5">Đơn vị: {v('unit') || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" step="0.5" min="0"
                        value={v('weight') ?? ''}
                        onChange={(ev) => setEdit(d.id, 'weight', ev.target.value === '' ? null : Number(ev.target.value))}
                        className="w-20 px-2 py-1 border rounded text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" step="any"
                        value={v('target_default') ?? ''}
                        onChange={(ev) => setEdit(d.id, 'target_default', ev.target.value === '' ? null : Number(ev.target.value))}
                        className="w-32 px-2 py-1 border rounded text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" step="any"
                        value={v('min_threshold') ?? ''}
                        onChange={(ev) => setEdit(d.id, 'min_threshold', ev.target.value === '' ? null : Number(ev.target.value))}
                        placeholder="—"
                        className="w-24 px-2 py-1 border rounded text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!v('is_gating')}
                        onChange={(ev) => setEdit(d.id, 'is_gating', ev.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <select
                        value={v('applies_to')}
                        onChange={(ev) => setEdit(d.id, 'applies_to', ev.target.value)}
                        className="px-2 py-1 border rounded text-xs"
                      >
                        {APPLIES_TO_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={v('is_active') !== false}
                        onChange={(ev) => setEdit(d.id, 'is_active', ev.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        disabled={!dirty || savingId === d.id}
                        onClick={() => save(d)}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" /> Lưu
                      </button>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 2: Targets
// ═════════════════════════════════════════════════════════════════════════════
function TargetsTab({ companyId, roleFilter }) {
  const [periodStart, setPeriodStart] = useState(getDefaultPeriodStart());
  const [defs, setDefs] = useState([]);
  const [users, setUsers] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState({ companyId: companyId || '', departmentId: '', q: '' });

  useEffect(() => {
    setFilter((f) => ({ ...f, companyId: companyId || '' }));
  }, [companyId]);

  const [form, setForm] = useState({
    kpi_definition_id: '',
    user_id: '',
    target_value: '',
    weight_override: '',
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const targetParams = { period_start: periodStart };
      if (companyId) targetParams.company_id = companyId;
      const [d1, d3] = await Promise.all([
        api.get('/kpi/definitions'),
        api.get('/kpi/targets', { params: targetParams }),
      ]);
      setDefs(d1.data.definitions || []);
      setTargets(d3.data.targets || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodStart, companyId]);

  // Tải danh sách users theo filter (debounce search)
  useEffect(() => {
    const t = setTimeout(() => {
      const cid = companyId || filter.companyId;
      const params = {
        ...(cid ? { company_id: cid } : {}),
        ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
        ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
        ...(roleFilter ? { roles: roleFilter } : {}),
      };
      api.get('/kpi/users', { params })
        .then((r) => setUsers(r.data?.users || []))
        .catch(() => setUsers([]));
    }, 300);
    return () => clearTimeout(t);
  }, [companyId, filter.companyId, filter.departmentId, filter.q, roleFilter]);

  const handleAdd = async () => {
    if (!form.kpi_definition_id || form.target_value === '') {
      setErr('Cần chọn KPI và nhập target_value');
      return;
    }
    setErr(null);
    try {
      await api.put('/kpi/targets', {
        kpi_definition_id: form.kpi_definition_id,
        user_id: form.user_id || null,
        company_id: companyId || null,
        period_type: 'monthly',
        period_start: periodStart,
        target_value: Number(form.target_value),
        weight_override: form.weight_override === '' ? null : Number(form.weight_override),
        notes: form.notes || null,
      });
      setForm({ kpi_definition_id: '', user_id: '', target_value: '', weight_override: '', notes: '' });
      load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xoá target này?')) return;
    try {
      await api.delete(`/kpi/targets/${id}`);
      setTargets((arr) => arr.filter((t) => t.id !== id));
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  };

  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const defsForRole = useMemo(
    () => defs.filter((d) => definitionMatchesRoleFilter(d.applies_to, roleFilter)),
    [defs, roleFilter],
  );

  const targetsVisible = useMemo(() => {
    return targets.filter((t) => {
      const def = t.kpi_definition;
      if (!definitionMatchesRoleFilter(def?.applies_to, roleFilter)) return false;
      if (!roleFilter || !t.user_id) return true;
      const ur = String(userMap[t.user_id]?.role || '').toLowerCase();
      return ur === roleFilter;
    });
  }, [targets, roleFilter, userMap]);

  return (
    <div className="space-y-3">
      {roleFilter && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Lọc theo vai trò <code className="bg-amber-100 px-1 rounded">{roleFilter}</code>: danh sách nhân viên gọi API với{' '}
          <code className="bg-amber-100 px-1 rounded">roles</code> tương ứng; dropdown KPI và bảng target chỉ hiện mục khớp vai trò.
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-700 flex items-center gap-2">
          Tháng:
          <input
            type="month"
            value={periodStart.slice(0, 7)}
            onChange={(e) => setPeriodStart(`${e.target.value}-01`)}
            className="px-3 py-1.5 border rounded-lg text-sm"
          />
        </label>
        <button onClick={load} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Tải lại
        </button>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-1">
        <p className="text-xs text-gray-500">Lọc nhân viên trong dropdown bên dưới</p>
        <KpiUserFilter value={filter} onChange={setFilter} lockCompanyId={companyId || null} />
        <p className="text-xs text-gray-500 mt-1">{users.length} nhân viên khớp bộ lọc</p>
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3">
        <h3 className="font-semibold text-sm mb-2 flex items-center gap-2" style={{ color: '#000000' }}>
          <Plus className="w-4 h-4" /> Thêm / cập nhật target
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <select
            value={form.kpi_definition_id}
            onChange={(e) => setForm({ ...form, kpi_definition_id: e.target.value })}
            className="px-2 py-1.5 border rounded text-sm"
          >
            <option value="">— Chọn KPI —</option>
            {defsForRole.map((d) => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
          </select>
          <select
            value={form.user_id}
            onChange={(e) => setForm({ ...form, user_id: e.target.value })}
            className="px-2 py-1.5 border rounded text-sm"
          >
            <option value="">— Tất cả nhân viên (default) —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}{u.department?.name ? ` · ${u.department.name}` : ''}
              </option>
            ))}
          </select>
          <input
            type="number" step="any" placeholder="Target value"
            value={form.target_value}
            onChange={(e) => setForm({ ...form, target_value: e.target.value })}
            className="px-2 py-1.5 border rounded text-sm"
          />
          <input
            type="number" step="0.5" placeholder="Weight override (option)"
            value={form.weight_override}
            onChange={(e) => setForm({ ...form, weight_override: e.target.value })}
            className="px-2 py-1.5 border rounded text-sm"
          />
          <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center justify-center gap-1">
            <Save className="w-3.5 h-3.5" /> Lưu target
          </button>
        </div>
        <input
          type="text" placeholder="Ghi chú (option)"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="mt-2 w-full px-2 py-1.5 border rounded text-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Đang tải…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
              <tr>
                <th className="text-left px-3 py-2.5">KPI</th>
                <th className="text-left px-3 py-2.5">Nhân viên</th>
                <th className="text-right px-3 py-2.5">Target</th>
                <th className="text-right px-3 py-2.5">Weight override</th>
                <th className="text-left px-3 py-2.5">Ghi chú</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {targetsVisible.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-400 py-6">Không có target khớp bộ lọc vai trò / tháng.</td></tr>
              ) : targetsVisible.map((t) => {
                const def = t.kpi_definition;
                const isRevenue = def?.formula_type === 'revenue';
                return (
                  <tr key={t.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-mono font-semibold text-gray-700">{def?.code}</div>
                      <div className="text-xs text-gray-500">{def?.name}</div>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {t.user_id ? (userMap[t.user_id]?.full_name || userMap[t.user_id]?.email || t.user_id) : <span className="text-gray-500 italic">Mặc định công ty</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {isRevenue ? formatVND(t.target_value) : t.target_value}
                    </td>
                    <td className="px-3 py-2 text-right">{t.weight_override ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-700">{t.notes || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleDelete(t.id)} className="px-2 py-1 text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 3: Periods
// ═════════════════════════════════════════════════════════════════════════════
function PeriodsTab({ companyId }) {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [recomputing, setRecomputing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/kpi/periods');
      setPeriods(data.periods || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (p, status) => {
    try {
      const { data } = await api.patch(`/kpi/periods/${p.id}`, { status });
      setPeriods((arr) => arr.map((x) => (x.id === p.id ? { ...x, ...data.period } : x)));
    } catch (e) { setErr(e.response?.data?.error || e.message); }
  };

  const recompute = async (p) => {
    setRecomputing(p.id);
    setErr(null);
    try {
      const { data } = await api.post('/kpi/recompute', {
        period_type: p.period_type,
        period_start: p.period_start,
        ...(companyId ? { company_id: companyId } : {}),
      });
      alert(`Đã recompute ${data.count} nhân viên cho ${p.period_start}.`);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setRecomputing(null); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Trạng thái <strong>locked</strong>: chặn recompute. <strong>Closed</strong>: chốt số chính thức.
          {companyId && (
            <span className="block mt-1 text-xs text-blue-700">
              «Tính lại» chỉ chạy cho nhân viên thuộc công ty đã chọn trên thanh lọc.
            </span>
          )}
        </p>
        <button onClick={load} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Tải lại
        </button>
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Đang tải…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
              <tr>
                <th className="text-left px-3 py-2.5">Kỳ</th>
                <th className="text-left px-3 py-2.5">Loại</th>
                <th className="text-left px-3 py-2.5">Trạng thái</th>
                <th className="text-left px-3 py-2.5">Đóng lúc</th>
                <th className="px-3 py-2.5 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-6">Chưa có kỳ KPI nào — chạy KPI ít nhất 1 lần để tự tạo.</td></tr>
              ) : periods.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{p.period_start} → {p.period_end}</td>
                  <td className="px-3 py-2">{p.period_type}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.status === 'closed' ? 'bg-emerald-100 text-emerald-700'
                      : p.status === 'locked' ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    {p.closed_at ? new Date(p.closed_at).toLocaleString('vi-VN') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      {p.status !== 'open' && (
                        <button onClick={() => setStatus(p, 'open')} title="Mở lại" className="px-2 py-1 border rounded text-xs hover:bg-gray-50 flex items-center gap-1">
                          <Unlock className="w-3 h-3" /> Mở
                        </button>
                      )}
                      {p.status === 'open' && (
                        <button onClick={() => setStatus(p, 'locked')} title="Khoá" className="px-2 py-1 border rounded text-xs hover:bg-gray-50 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Khoá
                        </button>
                      )}
                      {p.status !== 'closed' && (
                        <button onClick={() => setStatus(p, 'closed')} title="Đóng kỳ" className="px-2 py-1 border rounded text-xs hover:bg-gray-50 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Đóng
                        </button>
                      )}
                      <button
                        onClick={() => recompute(p)}
                        disabled={p.status === 'closed' || recomputing === p.id}
                        title="Tính lại KPI cho kỳ này"
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center gap-1 disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3 h-3 ${recomputing === p.id ? 'animate-spin' : ''}`} /> Tính lại
                      </button>
                    </div>
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

// ═════════════════════════════════════════════════════════════════════════════
// Tab 4: Lịch làm việc — giờ HC, ngày lễ, ngày phép NV
// ═════════════════════════════════════════════════════════════════════════════
const WEEKDAYS = [
  { v: 1, l: 'T2' }, { v: 2, l: 'T3' }, { v: 3, l: 'T4' }, { v: 4, l: 'T5' },
  { v: 5, l: 'T6' }, { v: 6, l: 'T7' }, { v: 7, l: 'CN' },
];
const LEAVE_TYPES = [
  { v: 'paid', l: 'Phép có lương' },
  { v: 'unpaid', l: 'Phép không lương' },
  { v: 'sick', l: 'Nghỉ ốm' },
  { v: 'business_trip', l: 'Công tác' },
  { v: 'remote', l: 'Làm từ xa' },
  { v: 'other', l: 'Khác' },
];
const HALF_DAY = [
  { v: 'full', l: 'Cả ngày' },
  { v: 'morning', l: 'Sáng' },
  { v: 'afternoon', l: 'Chiều' },
];

function minutesToHHMM(m) {
  if (m == null) return '';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function hhmmToMinutes(s) {
  if (!s) return null;
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
}

function BusinessHoursPanel({ companyId }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = companyId ? { company_id: companyId } : {};
      const { data } = await api.get('/kpi/business-hours', { params });
      setConfig(data.config || {
        start_minute: 480, end_minute: 1020,
        lunch_start_minute: 720, lunch_end_minute: 780,
        work_days: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Ho_Chi_Minh',
        company_id: companyId || null,
      });
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [companyId]);

  const toggleDay = (d) => {
    setConfig((c) => {
      const set = new Set(c.work_days || []);
      if (set.has(d)) set.delete(d); else set.add(d);
      return { ...c, work_days: [...set].sort((a, b) => a - b) };
    });
  };

  const save = async () => {
    setSaving(true); setErr(null); setMsg(null);
    try {
      const { data } = await api.put('/kpi/business-hours', { ...config, company_id: companyId || null });
      setConfig(data.config);
      setMsg('Đã lưu cấu hình giờ hành chính.');
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-6 text-gray-400">Đang tải…</div>;
  if (!config) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold" style={{ color: '#000000' }}>Giờ hành chính</h3>
      </div>
      {err && <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700">{err}</div>}
      {msg && <div className="bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-sm text-emerald-700">{msg}</div>}

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-gray-600">Bắt đầu ca</span>
          <input type="time" value={minutesToHHMM(config.start_minute)}
            onChange={(e) => setConfig({ ...config, start_minute: hhmmToMinutes(e.target.value) })}
            className="mt-1 w-full px-2 py-1.5 border rounded" />
        </label>
        <label className="text-sm">
          <span className="text-gray-600">Kết thúc ca</span>
          <input type="time" value={minutesToHHMM(config.end_minute)}
            onChange={(e) => setConfig({ ...config, end_minute: hhmmToMinutes(e.target.value) })}
            className="mt-1 w-full px-2 py-1.5 border rounded" />
        </label>
        <label className="text-sm">
          <span className="text-gray-600">Nghỉ trưa từ <em className="text-gray-400">(để trống = không trừ)</em></span>
          <input type="time" value={minutesToHHMM(config.lunch_start_minute)}
            onChange={(e) => setConfig({ ...config, lunch_start_minute: e.target.value ? hhmmToMinutes(e.target.value) : null })}
            className="mt-1 w-full px-2 py-1.5 border rounded" />
        </label>
        <label className="text-sm">
          <span className="text-gray-600">Nghỉ trưa đến</span>
          <input type="time" value={minutesToHHMM(config.lunch_end_minute)}
            onChange={(e) => setConfig({ ...config, lunch_end_minute: e.target.value ? hhmmToMinutes(e.target.value) : null })}
            className="mt-1 w-full px-2 py-1.5 border rounded" />
        </label>
      </div>

      <div>
        <p className="text-sm text-gray-600 mb-1.5">Ngày làm trong tuần</p>
        <div className="flex gap-1.5 flex-wrap">
          {WEEKDAYS.map((d) => {
            const on = (config.work_days || []).includes(d.v);
            return (
              <button key={d.v} onClick={() => toggleDay(d.v)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                {d.l}
              </button>
            );
          })}
        </div>
      </div>

      <label className="text-sm block">
        <span className="text-gray-600">Múi giờ</span>
        <input type="text" value={config.timezone || ''}
          onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
          className="mt-1 w-full px-2 py-1.5 border rounded" placeholder="Asia/Ho_Chi_Minh" />
      </label>

      <button onClick={save} disabled={saving}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1.5">
        <Save className="w-4 h-4" /> {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
      </button>

      <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
        <strong>Phạm vi:</strong>{' '}
        {companyId ? 'Cấu hình riêng cho công ty đã chọn (nếu chưa có sẽ tạo bản ghi mới khi Lưu).' : 'Mặc định toàn hệ thống (company_id = null).'}
        <br />
        <strong>Áp dụng cho:</strong> KPI A1 (phản hồi lead ≤15p), A2 (thời gian phản hồi TB).
        Lead tạo ngoài giờ HC sẽ được đẩy mốc bắt đầu sang đầu giờ ngày làm kế tiếp.
      </div>
    </div>
  );
}

function HolidaysPanel({ companyId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState({ holiday_date: '', name: '', repeat_yearly: false, notes: '' });

  const load = async () => {
    setLoading(true);
    try {
      const params = companyId ? { company_id: companyId } : {};
      const { data } = await api.get('/kpi/holidays', { params });
      setItems(data.holidays || []);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [companyId]);

  const add = async () => {
    if (!form.holiday_date || !form.name) { setErr('Cần điền ngày và tên'); return; }
    setErr(null);
    try {
      await api.post('/kpi/holidays', { ...form, company_id: companyId || null });
      setForm({ holiday_date: '', name: '', repeat_yearly: false, notes: '' });
      load();
    } catch (e) { setErr(e.response?.data?.error || e.message); }
  };
  const del = async (id) => {
    if (!window.confirm('Xoá ngày lễ này?')) return;
    try { await api.delete(`/kpi/holidays/${id}`); setItems((a) => a.filter((x) => x.id !== id)); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-5 h-5 text-amber-600" />
        <h3 className="font-semibold" style={{ color: '#000000' }}>Ngày lễ / nghỉ chung</h3>
        {companyId && <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">+ lễ hệ thống (null)</span>}
      </div>
      {err && <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
        <input type="date" value={form.holiday_date}
          onChange={(e) => setForm({ ...form, holiday_date: e.target.value })}
          className="px-2 py-1.5 border rounded text-sm" />
        <input type="text" placeholder="Tên ngày lễ" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="px-2 py-1.5 border rounded text-sm md:col-span-2" />
        <label className="text-sm flex items-center gap-1.5 px-2">
          <input type="checkbox" checked={form.repeat_yearly}
            onChange={(e) => setForm({ ...form, repeat_yearly: e.target.checked })} />
          Lặp hằng năm
        </label>
        <button onClick={add} className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 flex items-center justify-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Thêm
        </button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-gray-400">Đang tải…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
              <tr>
                <th className="text-left px-3 py-2.5">Ngày</th>
                <th className="text-left px-3 py-2.5">Tên</th>
                <th className="text-center px-3 py-2.5">Lặp</th>
                <th className="text-left px-3 py-2.5">Ghi chú</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-6">Chưa có ngày lễ.</td></tr>
              ) : items.map((h) => (
                <tr key={h.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{h.holiday_date}</td>
                  <td className="px-3 py-2">{h.name}</td>
                  <td className="px-3 py-2 text-center">
                    {h.repeat_yearly ? <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Hằng năm</span> : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">{h.notes || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => del(h.id)} className="px-2 py-1 text-red-600 hover:bg-red-50 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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

function LeavesPanel({ companyId, roleFilter }) {
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState({ companyId: companyId || '', departmentId: '', q: '' });
  const [form, setForm] = useState({
    user_id: '', start_date: '', end_date: '',
    leave_type: 'paid', half_day: 'full', reason: '', status: 'approved',
  });

  useEffect(() => {
    setFilter((f) => ({ ...f, companyId: companyId || '' }));
  }, [companyId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/kpi/leaves');
      setItems(data.leaves || []);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const cid = companyId || filter.companyId;
      const params = {
        ...(cid ? { company_id: cid } : {}),
        ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
        ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
        ...(roleFilter ? { roles: roleFilter } : {}),
      };
      api.get('/kpi/users', { params }).then((r) => setUsers(r.data?.users || [])).catch(() => setUsers([]));
    }, 300);
    return () => clearTimeout(t);
  }, [companyId, filter.companyId, filter.departmentId, filter.q, roleFilter]);

  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const add = async () => {
    if (!form.user_id || !form.start_date || !form.end_date) { setErr('Cần chọn nhân viên & khoảng ngày'); return; }
    setErr(null);
    try {
      await api.post('/kpi/leaves', form);
      setForm({ ...form, user_id: '', start_date: '', end_date: '', reason: '' });
      load();
    } catch (e) { setErr(e.response?.data?.error || e.message); }
  };
  const updateStatus = async (id, status) => {
    try { await api.patch(`/kpi/leaves/${id}`, { status }); load(); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
  };
  const del = async (id) => {
    if (!window.confirm('Xoá đơn nghỉ này?')) return;
    try { await api.delete(`/kpi/leaves/${id}`); setItems((a) => a.filter((x) => x.id !== id)); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <UserMinus className="w-5 h-5 text-purple-600" />
        <h3 className="font-semibold" style={{ color: '#000000' }}>Ngày phép nhân viên</h3>
      </div>
      {err && <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="bg-white border border-gray-100 rounded-xl p-3">
        <p className="text-xs text-gray-500 mb-1">Lọc nhân viên</p>
        <KpiUserFilter value={filter} onChange={setFilter} lockCompanyId={companyId || null} />
        <p className="text-xs text-gray-500 mt-1">{users.length} nhân viên khớp</p>
      </div>

      <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-3 grid grid-cols-1 md:grid-cols-7 gap-2">
        <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}
          className="px-2 py-1.5 border rounded text-sm md:col-span-2">
          <option value="">— Chọn NV —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
        </select>
        <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          className="px-2 py-1.5 border rounded text-sm" />
        <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          className="px-2 py-1.5 border rounded text-sm" />
        <select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
          className="px-2 py-1.5 border rounded text-sm">
          {LEAVE_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <select value={form.half_day} onChange={(e) => setForm({ ...form, half_day: e.target.value })}
          className="px-2 py-1.5 border rounded text-sm">
          {HALF_DAY.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <button onClick={add} className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 flex items-center justify-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Thêm
        </button>
        <input type="text" placeholder="Lý do (tuỳ chọn)" value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          className="md:col-span-7 px-2 py-1.5 border rounded text-sm" />
      </div>

      {loading ? (
        <div className="text-center py-6 text-gray-400">Đang tải…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
              <tr>
                <th className="text-left px-3 py-2.5">Nhân viên</th>
                <th className="text-left px-3 py-2.5">Từ</th>
                <th className="text-left px-3 py-2.5">Đến</th>
                <th className="text-left px-3 py-2.5">Loại</th>
                <th className="text-left px-3 py-2.5">Buổi</th>
                <th className="text-left px-3 py-2.5">Trạng thái</th>
                <th className="text-left px-3 py-2.5">Lý do</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-6">Chưa có đơn nghỉ.</td></tr>
              ) : items.map((l) => (
                <tr key={l.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">{userMap[l.user_id]?.full_name || userMap[l.user_id]?.email || l.user_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.start_date}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.end_date}</td>
                  <td className="px-3 py-2 text-xs">{LEAVE_TYPES.find((t) => t.v === l.leave_type)?.l || l.leave_type}</td>
                  <td className="px-3 py-2 text-xs">{HALF_DAY.find((t) => t.v === l.half_day)?.l || l.half_day}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      l.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                      : l.status === 'pending' ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-700'
                    }`}>{l.status}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">{l.reason || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      {l.status === 'pending' && (
                        <button onClick={() => updateStatus(l.id, 'approved')}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700">Duyệt</button>
                      )}
                      <button onClick={() => del(l.id)} className="px-2 py-1 text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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

function CalendarTab({ companyId, roleFilter }) {
  const [section, setSection] = useState('hours');
  const subTabs = [
    { id: 'hours', label: 'Giờ hành chính', icon: Clock },
    { id: 'holidays', label: 'Ngày lễ', icon: CalendarDays },
    { id: 'leaves', label: 'Ngày phép NV', icon: UserMinus },
  ];
  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {subTabs.map((t) => {
          const Ic = t.icon;
          return (
            <button key={t.id} onClick={() => setSection(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm border flex items-center gap-1.5 ${
                section === t.id ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}>
              <Ic className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>
      {section === 'hours' && <BusinessHoursPanel companyId={companyId} />}
      {section === 'holidays' && <HolidaysPanel companyId={companyId} />}
      {section === 'leaves' && <LeavesPanel companyId={companyId} roleFilter={roleFilter} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 5: Pipeline KPI — map từng stage của pipeline → canonical_slug
// ═════════════════════════════════════════════════════════════════════════════
function PipelineKpiTab({ companyId, companies, roleFilter }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingStageId, setSavingStageId] = useState(null);
  const [autoLoadingId, setAutoLoadingId] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [expanded, setExpanded] = useState({});

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const params = companyId ? { company_id: companyId } : {};
      const { data } = await api.get('/kpi/pipeline-mapping', { params });
      setData(data);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId]);

  const updateStage = async (stage, patch) => {
    setSavingStageId(stage.id); setErr(null); setMsg(null);
    try {
      await api.patch(`/kpi/pipeline-mapping/${stage.id}`, patch);
      setMsg(`Đã cập nhật stage "${stage.name}"`);
      load();
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setSavingStageId(null); }
  };

  const autoMap = async (pipeline, dryRun = true) => {
    setAutoLoadingId(pipeline.id); setErr(null); setMsg(null);
    try {
      const { data } = await api.post('/kpi/pipeline-mapping/auto', { pipeline_id: pipeline.id, dry_run: dryRun });
      if (dryRun) {
        if (data.proposals.length === 0) { setMsg(`Pipeline "${pipeline.name}" đã được map đầy đủ — không có gợi ý mới.`); }
        else if (window.confirm(
          `Tìm thấy ${data.proposals.length} stage có thể auto-map:\n\n` +
          data.proposals.map((p) => `• ${p.stage_name} → ${p.new_slug}${p.old_slug ? ` (cũ: ${p.old_slug})` : ''}`).join('\n') +
          `\n\nÁp dụng?`
        )) {
          await api.post('/kpi/pipeline-mapping/auto', { pipeline_id: pipeline.id, dry_run: false });
          setMsg(`Đã auto-map ${data.proposals.length} stage cho pipeline "${pipeline.name}"`);
          load();
        }
      }
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setAutoLoadingId(null); }
  };

  const slugLabel = (slug) => {
    const labels = {
      lead_new: 'Lead mới', not_contacted: 'Không liên hệ được',
      cold: 'Lạnh', warm: 'Ấm', hot: 'Nóng',
      survey_scheduled: 'Hẹn khảo sát', survey_done: 'Đã khảo sát',
      designing: 'Thiết kế', quoted: 'Đã báo giá', negotiating: 'Đàm phán',
      waiting_deposit: 'Chờ cọc', contract_signed: 'Ký HD',
      producing: 'Sản xuất', installing: 'Lắp đặt', completed: 'Hoàn thành',
      lost: 'Mất khách',
    };
    return labels[slug] || slug;
  };

  const validSlugsFor = (pipelineType) => data?.canonical_slugs?.[pipelineType] || [];

  const allPipelines = data?.pipelines || [];
  const totalLeadStages = allPipelines.reduce((s, p) => s + (p.lead?.total_stages || 0), 0);
  const totalDealStages = allPipelines.reduce((s, p) => s + (p.deal?.total_stages || 0), 0);

  // Render 1 sub-section (Lead hoặc Deal) bên trong 1 pipeline
  const renderSubSection = (pipeline, type, part) => {
    if (!part || part.total_stages === 0) return null;

    const status = part.coverage_pct === 100 ? 'ok' : part.coverage_pct > 0 ? 'partial' : 'none';
    const headerColor = type === 'lead' ? 'bg-blue-50 border-blue-200' : 'bg-purple-50 border-purple-200';
    const headerText  = type === 'lead' ? 'text-blue-800' : 'text-purple-800';
    const typeLabel   = type === 'lead' ? 'STAGE LEAD — phễu thu hút khách' : 'STAGE DEAL — phễu chốt đơn';
    const kpiCoverage = Object.entries(part.kpi_coverage || {});

    return (
      <div className={`border-2 ${headerColor} rounded-lg overflow-hidden`}>
        <div className={`px-3 py-2 ${headerText} flex items-center justify-between flex-wrap gap-2`}>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${type === 'lead' ? 'bg-blue-200 text-blue-900' : 'bg-purple-200 text-purple-900'}`}>
              {type.toUpperCase()}
            </span>
            <span className="font-semibold text-sm">{typeLabel}</span>
            <span className="text-xs">
              {part.mapped_stages}/{part.total_stages} stage đã map · {part.total_leads} {type === 'lead' ? 'lead' : 'deal'} đang có
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${status === 'ok' ? 'text-emerald-700' : status === 'partial' ? 'text-amber-700' : 'text-red-700'}`}>
              {part.coverage_pct}%
            </span>
          </div>
        </div>

        {kpiCoverage.length > 0 && (
          <div className="px-3 py-1.5 bg-gray-50/60 border-t flex flex-wrap gap-1">
            {kpiCoverage.map(([kpi, cov]) => (
              <span key={kpi} className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                cov.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`} title={cov.ok ? `${kpi} OK` : `${kpi} thiếu: ${cov.missing.join(', ')}`}>
                {cov.ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {kpi}
              </span>
            ))}
          </div>
        )}

        <table className="w-full text-sm border-t">
          <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
            <tr>
              <th className="text-left px-3 py-2">Stage</th>
              <th className="text-left px-3 py-2">Canonical slug</th>
              <th className="text-right px-3 py-2">SLA (ngày)</th>
              <th className="text-right px-3 py-2">{type === 'lead' ? 'Lead' : 'Deal'} đang ở</th>
              <th className="text-center px-3 py-2">Tt</th>
            </tr>
          </thead>
          <tbody>
            {part.stages.map((s) => (
              <tr key={s.id} className="border-t hover:bg-blue-50/30">
                <td className="px-3 py-1.5">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-[10px] text-gray-500">vị trí {s.position}{s.is_won ? ' · won' : ''}{s.is_lost ? ' · lost' : ''}</div>
                </td>
                <td className="px-3 py-1.5">
                  <select value={s.canonical_slug || ''}
                    disabled={savingStageId === s.id}
                    onChange={(e) => updateStage(s, { canonical_slug: e.target.value || null })}
                    className={`px-2 py-1 border rounded text-sm min-w-[180px] ${!s.canonical_slug ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
                    <option value="">— Chưa map —</option>
                    {validSlugsFor(type).map((slug) => (
                      <option key={slug} value={slug}>{slug} · {slugLabel(slug)}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input type="number" min="0" step="1" defaultValue={s.sla_days ?? ''}
                    title="0 = tắt SLA; trống = mặc định 7 ngày"
                    onBlur={(e) => {
                      const raw = e.target.value;
                      const v = raw === '' ? null : Number(raw);
                      const normalized = v === 0 ? 0 : (v == null || !Number.isFinite(v) ? null : v);
                      if (normalized !== s.sla_days) updateStage(s, { sla_days: normalized });
                    }}
                    className="w-14 px-2 py-1 border rounded text-sm text-right" placeholder="—" />
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs">
                  {s.lead_count > 0 ? <span className="text-blue-700 font-bold">{s.lead_count}</span> : <span className="text-gray-400">0</span>}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {savingStageId === s.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600 mx-auto" />
                  ) : s.canonical_slug ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 mx-auto" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500 mx-auto" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderPipelineCard = (p) => {
    const isExpanded = expanded[p.id] !== false;
    const showLead = typeFilter === 'all' || typeFilter === 'lead';
    const showDeal = typeFilter === 'all' || typeFilter === 'deal';
    const hasContent = (showLead && p.lead) || (showDeal && p.deal);
    if (!hasContent) return null;

    return (
      <div key={p.id} className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 cursor-pointer hover:bg-gray-50/50 border-b"
          onClick={() => setExpanded((e) => ({ ...e, [p.id]: !isExpanded }))}>
          <div className="flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-gray-700" />
            <div>
              <div className="font-semibold flex items-center gap-2">
                {p.name}
                {p.lead && <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{p.lead.total_stages} lead</span>}
                {p.deal && <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">{p.deal.total_stages} deal</span>}
              </div>
              <div className="text-xs text-gray-500">
                Tổng {p.total_stages} stage · {p.total_leads} lead/deal đang có
              </div>
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); autoMap(p); }}
            disabled={autoLoadingId === p.id}
            className="px-2.5 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1">
            {autoLoadingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Auto-map
          </button>
        </div>

        {isExpanded && (
          <div className="p-3 space-y-3">
            {showLead && renderSubSection(p, 'lead', p.lead)}
            {showDeal && renderSubSection(p, 'deal', p.deal)}
            {(!p.lead && showLead && !showDeal) && (
              <div className="text-center py-3 text-gray-400 text-sm">Pipeline này chưa có stage Lead.</div>
            )}
            {(!p.deal && showDeal && !showLead) && (
              <div className="text-center py-3 text-gray-400 text-sm">Pipeline này chưa có stage Deal.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {roleFilter === 'sales_admin' && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Đang lọc vai trò <strong>Sales Admin</strong>: map <strong>Lead</strong> quan trọng cho KPI nhóm A; map <strong>Deal</strong> chủ yếu cho NV kinh doanh (nhóm B) — vẫn có thể chỉnh tại đây.
        </div>
      )}
      <div className="bg-white border border-gray-100 rounded-xl p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-sm text-gray-700">
            {companyId ? (
              <>
                Pipeline theo công ty: <strong>{companyOptionLabel(companies?.find((c) => String(c.id) === String(companyId))) || companyId}</strong>
                <span className="text-xs text-gray-500 block sm:inline sm:ml-2">(đổi công ty trên thanh lọc phía trên trang)</span>
              </>
            ) : (
              <span className="text-gray-600">Đang xem pipeline <strong>tất cả công ty</strong>. Chọn công ty ở thanh trên để map theo từng đơn vị.</span>
            )}
          </span>

          <div className="flex gap-1 flex-wrap">
            {[
              { id: 'all',  label: `Tất cả (${allPipelines.length} pipeline)`, c: 'bg-gray-700' },
              { id: 'lead', label: `Lead (${totalLeadStages} stage)`,  c: 'bg-blue-600' },
              { id: 'deal', label: `Deal (${totalDealStages} stage)`,  c: 'bg-purple-600' },
            ].map((t) => (
              <button key={t.id} onClick={() => setTypeFilter(t.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  typeFilter === t.id ? `${t.c} text-white` : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <button onClick={load} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </button>
          <span className="text-xs text-gray-500 ml-auto">
            Map từng stage → <strong>canonical_slug</strong> để KPI nhóm B (B2/B3/B4/B5) tính đúng cho pipeline này.
          </span>
        </div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>}
      {msg && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700">{msg}</div>}

      {loading && !data ? (
        <div className="text-center py-6 text-gray-400">Đang tải…</div>
      ) : !allPipelines.length ? (
        <div className="text-center py-6 text-gray-400 text-sm">Không có pipeline nào{companyId ? ' cho công ty này' : ''}.</div>
      ) : (
        <div className="space-y-3">
          {allPipelines.map(renderPipelineCard).filter(Boolean)}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 space-y-1.5">
        <p className="font-semibold flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Quy ước canonical_slug</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1.5">
          <div>
            <p className="font-mono font-semibold">Lead pipeline (8 slug):</p>
            <p className="text-blue-800">lead_new, not_contacted, cold, warm, hot, survey_scheduled, survey_done, lost</p>
          </div>
          <div>
            <p className="font-mono font-semibold">Deal pipeline (9 slug):</p>
            <p className="text-blue-800">designing, quoted, negotiating, waiting_deposit, contract_signed, producing, installing, completed, lost</p>
          </div>
        </div>
        <p className="mt-1">→ KPI <strong>B2/B3/B4/B5</strong> chỉ tính được khi pipeline đã map đủ slug bắt buộc (dấu ✓ ở trên).</p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab: Bộ NV CRM — bắt buộc minh chứng (file hoặc ghi chú) khi hoàn thành (tách Lead / Deal / Chung)
// variant `sales_admin_group_a`: chỉ Lead + Chung — tập trung KPI nhóm A (A3 minh chứng, A4 follow-up)
// ═════════════════════════════════════════════════════════════════════════════
function CrmTaskBundleTab({ companyId, variant = 'full', roleFilter = '' }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [savingTplId, setSavingTplId] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get('/crm/task-templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const { leadTemplates, dealTemplates, sharedTemplates } = useMemo(() => {
    const arr = (templates || []).filter((t) => crmTemplateVisibleForCompany(t, companyId));
    const lead = [];
    const deal = [];
    const shared = [];
    for (const t of arr) {
      const p = String(t.pipeline_type || 'both').toLowerCase().trim();
      if (p === 'lead') lead.push(t);
      else if (p === 'deal') deal.push(t);
      else shared.push(t);
    }
    const byTplOrder = (a, b) => (a.order_index || 0) - (b.order_index || 0);
    lead.sort(byTplOrder);
    deal.sort(byTplOrder);
    shared.sort(byTplOrder);
    if (variant === 'sales_admin_group_a' || !crmSettingsShowsDealTemplates(roleFilter)) {
      return { leadTemplates: lead, dealTemplates: [], sharedTemplates: shared };
    }
    return { leadTemplates: lead, dealTemplates: deal, sharedTemplates: shared };
  }, [templates, companyId, variant, roleFilter]);

  const patchCrmTemplateItem = async (templateId, item, patch) => {
    const key = `${templateId}:${item.id}`;
    setSavingKey(key);
    setErr(null);
    try {
      const merged = { ...item, ...patch };
      const contactOn = !!(merged.completion_requires_customer_contact || merged.completion_requires_file_or_note);
      const body = {
        completion_requires_customer_note: !!merged.completion_requires_customer_note,
        completion_requires_customer_contact: contactOn,
        completion_requires_file_or_note: contactOn,
      };
      const { data: updated } = await api.put(`/crm/task-templates/${templateId}/items/${item.id}`, body);
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === templateId
            ? { ...t, items: (t.items || []).map((x) => (x.id === item.id ? { ...x, ...updated } : x)) }
            : t,
        ),
      );
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSavingKey(null);
    }
  };

  const updateTemplatePipeline = async (tplId, pipelineType) => {
    setSavingTplId(tplId);
    setErr(null);
    try {
      await api.put(`/crm/task-templates/${tplId}`, { pipeline_type: pipelineType });
      setTemplates((prev) => prev.map((t) => (t.id === tplId ? { ...t, pipeline_type: pipelineType } : t)));
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSavingTplId(null);
    }
  };

  const isSalesAdminA =
    variant === 'sales_admin_group_a' || (variant === 'full' && String(roleFilter || '').toLowerCase() === 'sales_admin');
  const completionColLabel = isSalesAdminA
    ? 'Yêu cầu khi hoàn thành (KPI nhóm A — A3 minh chứng, A4 đúng hạn)'
    : 'Yêu cầu khi hoàn thành (KPI B1 / A3)';

  const renderTemplateCard = (tpl) => (
    <div key={tpl.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-2">
        <span className="font-semibold" style={{ color: '#000000' }}>{tpl.name}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-mono">{tpl.stage_slug}</span>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 ml-auto">
          <span className="shrink-0">Loại pipeline:</span>
          <select
            value={String(tpl.pipeline_type || 'both')}
            disabled={savingTplId === tpl.id}
            onChange={(e) => updateTemplatePipeline(tpl.id, e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white min-w-[100px]"
          >
            <option value="lead">Lead</option>
            <option value="deal">Deal</option>
            <option value="both">Chung (Lead &amp; Deal)</option>
          </select>
          {savingTplId === tpl.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-white">
              <th className="px-4 py-2 font-medium">Nhiệm vụ mẫu</th>
              <th className="px-4 py-2 font-medium min-w-[220px]">{completionColLabel}</th>
            </tr>
          </thead>
          <tbody>
            {(tpl.items || [])
              .slice()
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              .map((it) => {
                const busy = savingKey === `${tpl.id}:${it.id}`;
                const noteOn = !!it.completion_requires_customer_note;
                const contactOn = !!(it.completion_requires_customer_contact || it.completion_requires_file_or_note);
                return (
                  <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-4 py-2.5">
                      <div className="font-medium" style={{ color: '#000000' }}>{it.title}</div>
                      {it.description && (
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{it.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-2 text-xs text-gray-700">
                        <label className="inline-flex items-start gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={noteOn}
                            disabled={busy}
                            onChange={(e) =>
                              patchCrmTemplateItem(tpl.id, it, { completion_requires_customer_note: e.target.checked })
                            }
                          />
                          <span>
                            <span className="font-medium text-gray-800">Ghi chú khách hàng</span>
                            <span className="block text-[10px] text-gray-500">
                              {isSalesAdminA
                                ? 'Ghi chú trên task — phục vụ đủ thông tin & KPI A3.'
                                : 'Bắt buộc có nội dung ghi chú trên nhiệm vụ khi xong.'}
                            </span>
                          </span>
                        </label>
                        <label className="inline-flex items-start gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={contactOn}
                            disabled={busy}
                            onChange={(e) =>
                              patchCrmTemplateItem(tpl.id, it, {
                                completion_requires_customer_contact: e.target.checked,
                                completion_requires_file_or_note: e.target.checked,
                              })
                            }
                          />
                          <span>
                            <span className="font-medium text-gray-800">Minh chứng liên hệ</span>
                            <span className="block text-[10px] text-gray-500">
                              {isSalesAdminA
                                ? 'File/ghi chú đính kèm hoặc ghi chú task — liên quan A3 (minh chứng) và B1 khi không có log gọi.'
                                : 'Ghi chú hoặc file đính kèm khi hoàn thành (đếm KPI B1 nếu không có ghi âm).'}
                            </span>
                          </span>
                        </label>
                        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {!(tpl.items || []).length && (
        <div className="px-4 py-3 text-xs text-gray-400">Chưa có mục trong bộ mẫu này.</div>
      )}
    </div>
  );

  const renderSection = (title, subtitle, accentClass, list) => (
    <section className="space-y-4">
      <div className={`rounded-lg border px-4 py-3 ${accentClass}`}>
        <h3 className="text-sm font-bold" style={{ color: '#000000' }}>{title}</h3>
        <p className="text-xs text-gray-600 mt-1">{subtitle}</p>
      </div>
      {list.length ? (
        <div className="space-y-4">{list.map(renderTemplateCard)}</div>
      ) : (
        <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-6 text-center">
          Không có bộ mẫu nào thuộc nhóm này.
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900 flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-slate-500 shrink-0" />
          {isSalesAdminA ? 'Sales Admin — KPI nhóm A (chỉ Lead & Chung)' : 'Bộ nhiệm vụ CRM — tách theo Lead và Deal'}
        </p>
        <p className="mt-1 text-slate-600">
          {isSalesAdminA ? (
            <>
              <span className="block mb-2">
                Cấu hình này dành cho vai trò <strong>Sales Admin / telesales</strong>: chỉ hiển thị bộ mẫu{' '}
                <code className="text-xs bg-slate-200 px-1 rounded">pipeline_type = lead</code> và{' '}
                <code className="text-xs bg-slate-200 px-1 rounded">both</code>. Các chỉ số{' '}
                <strong>A1–A6</strong> lấy từ lead + nhiệm vụ CRM giai đoạn đầu; <strong>không hiển thị bộ Deal</strong>{' '}
                (nhóm B/C — cấu hình ở tab «Bộ NV CRM · Kinh doanh»).
              </span>
              {companyId && (
                <span className="block mb-1 text-amber-900 bg-amber-50 border border-amber-100 rounded px-2 py-1 text-xs">
                  Đang lọc bộ mẫu áp dụng cho công ty đã chọn (theo <code className="text-[10px] bg-amber-100 px-1 rounded">default_allowed_companies</code> trên từng nhiệm vụ mẫu).
                </span>
              )}
              <span className="block text-xs text-slate-600">
                A1/A2: phản hồi lead; A3: đủ field + task bắt buộc minh chứng; A4: hoàn thành task đúng hạn. Cùng một API với tab Kinh doanh — chỉ khác phần hiển thị.
              </span>
            </>
          ) : (
            <>
              {companyId && (
                <span className="block mb-1 text-amber-900 bg-amber-50 border border-amber-100 rounded px-2 py-1 text-xs">
                  Đang lọc bộ mẫu áp dụng cho công ty đã chọn (theo <code className="text-[10px] bg-amber-100 px-1 rounded">default_allowed_companies</code> trên từng nhiệm vụ mẫu).
                </span>
              )}
              Danh sách được <strong>phân nhóm theo trường pipeline_type</strong> trên mỗi bộ mẫu CRM (<code className="text-xs bg-slate-200 px-1 rounded">lead</code>,{' '}
              <code className="text-xs bg-slate-200 px-1 rounded">deal</code>,{' '}
              <code className="text-xs bg-slate-200 px-1 rounded">both</code>). Khi bật “bắt buộc file/ghi chú”, nhiệm vụ sinh ra
              từ mẫu đó phải có ghi chú hoặc đính kèm trước khi hoàn thành. Dùng ô <strong>Loại pipeline</strong> trên từng bộ mẫu để
              xếp vào nhóm Lead, Deal hoặc Chung.
            </>
          )}
        </p>
      </div>
      {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading ? (
        <div className="text-center py-10 text-gray-400 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Đang tải mẫu…
        </div>
      ) : !templates.length ? (
        <div className="text-center py-8 text-gray-500 text-sm">Chưa có bộ mẫu CRM hoặc không có quyền đọc.</div>
      ) : (
        <div className="space-y-10">
          {renderSection(
            'Nhiệm vụ Lead',
            isSalesAdminA
              ? 'Bộ mẫu pipeline_type = lead — trọng tâm KPI nhóm A trên pipeline lead.'
              : 'Các bộ mẫu có pipeline_type = lead — dùng khi auto-gen / tạo từ mẫu trên lead.',
            'bg-emerald-50/80 border-emerald-200',
            leadTemplates,
          )}
          {!isSalesAdminA &&
            renderSection(
              'Nhiệm vụ Deal',
              'Các bộ mẫu có pipeline_type = deal — dùng cho deal (giai đoạn KD sau chuyển đổi).',
              'bg-indigo-50/80 border-indigo-200',
              dealTemplates,
            )}
          {renderSection(
            'Chung Lead & Deal',
            isSalesAdminA
              ? 'Bộ mẫu pipeline_type = both — thường dùng cho nhiệm vụ đầu funnel lead; chỉnh cờ minh chứng nếu mẫu áp dụng cho telesales.'
              : 'Bộ mẫu pipeline_type = both (hoặc chưa gán) — áp dụng cho cả lead và deal tùy cách gen nhiệm vụ.',
            'bg-amber-50/80 border-amber-200',
            sharedTemplates,
          )}
        </div>
      )}
      <p className="text-xs text-gray-500">
        {isSalesAdminA && (
          <span className="block mb-1">
            Mẫu <strong>Deal</strong> (nhóm B/C) chỉnh ở tab <strong>«Bộ NV CRM · KD»</strong>.
          </span>
        )}
        Bộ nhiệm vụ theo <strong>đơn vị / dự án</strong> (quy trình xưởng, checklist từng dòng) chỉnh tại{' '}
        <a href="/template-sets" className="text-blue-600 underline">
          Bộ NV mẫu theo đơn vị
        </a>
        .
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Page wrapper
// ═════════════════════════════════════════════════════════════════════════════
export default function KpiSettingsPage() {
  const { user } = useAuth();
  const isManager = ['admin', 'manager', 'director', 'supervisor', 'superadmin'].includes(String(user?.role || '').toLowerCase());
  const [tab, setTab] = useState('definitions');
  const [companies, setCompanies] = useState([]);
  const [settingsCompanyId, setSettingsCompanyId] = useState('');
  const [settingsRoleFilter, setSettingsRoleFilter] = useState('');

  useEffect(() => {
    api.get('/companies')
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, []);

  if (!isManager) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          Cần quyền quản lý để cấu hình KPI.
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'definitions', label: 'Thông số KPI', desc: 'Sửa weight, mục tiêu, công thức, gating' },
    { id: 'targets', label: 'Target nhân viên', desc: 'Đặt target riêng theo người / kỳ' },
    { id: 'periods', label: 'Kỳ KPI', desc: 'Khoá / đóng kỳ, recompute' },
    { id: 'calendar', label: 'Lịch làm việc', desc: 'Giờ hành chính, ngày lễ, ngày phép NV' },
    { id: 'pipeline', label: 'Pipeline KPI', desc: 'Map stage pipeline → canonical_slug cho KPI nhóm B' },
    { id: 'crm_tasks', label: 'Bộ NV CRM · KD', desc: 'Lead / Deal / Chung: minh chứng khi hoàn thành (B1, A3…)' },
    { id: 'crm_tasks_sa', label: 'Bộ NV CRM · Sales Admin (A)', desc: 'Chỉ Lead & Chung — tập trung KPI nhóm A (A3, A4)' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#000000' }}>Cấu hình KPI Tủ bếp</h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <Building2 className="w-4 h-4 text-gray-600 shrink-0" />
        <label className="text-sm text-gray-700 flex flex-wrap items-center gap-2">
          <span className="font-medium">Lọc theo công ty</span>
          <select
            value={settingsCompanyId}
            onChange={(e) => setSettingsCompanyId(e.target.value)}
            className="min-w-[220px] max-w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">— Tất cả / mặc định hệ thống —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{companyOptionLabel(c)}</option>
            ))}
          </select>
        </label>
        <span className="hidden sm:inline h-6 w-px bg-gray-200 shrink-0" aria-hidden />
        <UserCog className="w-4 h-4 text-gray-600 shrink-0" />
        <label className="text-sm text-gray-700 flex flex-wrap items-center gap-2">
          <span className="font-medium">Lọc theo vai trò</span>
          <select
            value={settingsRoleFilter}
            onChange={(e) => setSettingsRoleFilter(e.target.value)}
            className="min-w-[200px] max-w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {KPI_SETTINGS_ROLE_FILTER_OPTIONS.map((o) => (
              <option key={o.value || '_all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-gray-500 w-full sm:w-auto sm:ml-auto">
          Công ty: target, lịch, pipeline, mẫu CRM. Vai trò: danh sách KPI / NV / nhóm Deal trên tab tương ứng.
        </span>
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
            title={t.desc}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'definitions' && <DefinitionsTab companyId={settingsCompanyId} roleFilter={settingsRoleFilter} />}
      {tab === 'targets' && <TargetsTab companyId={settingsCompanyId} roleFilter={settingsRoleFilter} />}
      {tab === 'periods' && <PeriodsTab companyId={settingsCompanyId} />}
      {tab === 'calendar' && <CalendarTab companyId={settingsCompanyId} roleFilter={settingsRoleFilter} />}
      {tab === 'pipeline' && <PipelineKpiTab companyId={settingsCompanyId} companies={companies} roleFilter={settingsRoleFilter} />}
      {tab === 'crm_tasks' && <CrmTaskBundleTab companyId={settingsCompanyId} variant="full" roleFilter={settingsRoleFilter} />}
      {tab === 'crm_tasks_sa' && <CrmTaskBundleTab companyId={settingsCompanyId} variant="sales_admin_group_a" roleFilter={settingsRoleFilter} />}
    </div>
  );
}
