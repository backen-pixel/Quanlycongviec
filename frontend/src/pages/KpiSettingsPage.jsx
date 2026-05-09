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
} from 'lucide-react';
import KpiUserFilter from '../components/KpiUserFilter';

const FORMULA_OPTIONS = [
  { v: 'increasing', l: 'Tăng dần (cao = tốt)' },
  { v: 'decreasing', l: 'Giảm dần (thấp = tốt)' },
  { v: 'quantity', l: 'Số lượng (theo target)' },
  { v: 'revenue', l: 'Doanh số (theo target)' },
  { v: 'duration', l: 'Thời gian (thấp = tốt)' },
];

const APPLIES_TO_OPTIONS = [
  { v: 'sales', l: 'Sales' },
  { v: 'sales_admin', l: 'Sales Admin' },
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

// ═════════════════════════════════════════════════════════════════════════════
// Tab 1: Definitions
// ═════════════════════════════════════════════════════════════════════════════
function DefinitionsTab() {
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-700">
            Tổng trọng số đang kích hoạt: <strong className={totalWeight === 100 ? 'text-emerald-700' : 'text-red-600'}>{totalWeight}</strong>
            <span className="text-gray-500"> / 100</span>
          </span>
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
              {defs.map((d) => {
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
              })}
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
function TargetsTab() {
  const [periodStart, setPeriodStart] = useState(getDefaultPeriodStart());
  const [defs, setDefs] = useState([]);
  const [users, setUsers] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', q: '' });

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
      const [d1, d3] = await Promise.all([
        api.get('/kpi/definitions'),
        api.get('/kpi/targets', { params: { period_start: periodStart } }),
      ]);
      setDefs(d1.data.definitions || []);
      setTargets(d3.data.targets || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodStart]);

  // Tải danh sách users theo filter (debounce search)
  useEffect(() => {
    const t = setTimeout(() => {
      const params = {
        ...(filter.companyId ? { company_id: filter.companyId } : {}),
        ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
        ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
      };
      api.get('/kpi/users', { params })
        .then((r) => setUsers(r.data?.users || []))
        .catch(() => setUsers([]));
    }, 300);
    return () => clearTimeout(t);
  }, [filter.companyId, filter.departmentId, filter.q]);

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

  return (
    <div className="space-y-3">
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
        <KpiUserFilter value={filter} onChange={setFilter} />
        <p className="text-xs text-gray-500 mt-1">{users.length} nhân viên khớp bộ lọc</p>
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3">
        <h3 className="font-semibold text-sm text-gray-900 mb-2 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Thêm / cập nhật target
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <select
            value={form.kpi_definition_id}
            onChange={(e) => setForm({ ...form, kpi_definition_id: e.target.value })}
            className="px-2 py-1.5 border rounded text-sm"
          >
            <option value="">— Chọn KPI —</option>
            {defs.map((d) => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
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
              {targets.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-400 py-6">Chưa có target tuỳ chỉnh cho tháng này.</td></tr>
              ) : targets.map((t) => {
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
function PeriodsTab() {
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
// Page wrapper
// ═════════════════════════════════════════════════════════════════════════════
export default function KpiSettingsPage() {
  const { user } = useAuth();
  const isManager = ['admin', 'manager', 'director', 'supervisor', 'superadmin'].includes(String(user?.role || '').toLowerCase());
  const [tab, setTab] = useState('definitions');

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
  ];

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cấu hình KPI Tủ bếp</h1>
          <p className="text-sm text-gray-500">Quản lý thông số 15 KPI, target theo nhân viên, đóng/mở kỳ.</p>
        </div>
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

      {tab === 'definitions' && <DefinitionsTab />}
      {tab === 'targets' && <TargetsTab />}
      {tab === 'periods' && <PeriodsTab />}
    </div>
  );
}
