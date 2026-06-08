import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Loader2, Plus, Save, Settings, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';

const INTAKE_BUCKET = 'delivery_pending';

const DEFAULT_FORM = {
  name: '',
  icon: '📦',
  color: '#f97316',
  is_active: true,
  is_intake: false,
  crm_sync_type: '',
};

const SYNC_OPTIONS = [
  { value: '', label: 'Không trigger CRM' },
  { value: 'delivery', label: '🚚 Trigger Vận chuyển' },
  { value: 'installation', label: '🔧 Trigger Lắp đặt' },
  { value: 'customer_care', label: '🤝 Trigger CSKH/Bảo hành' },
];

const syncTypeBadge = (syncType) => {
  if (syncType === 'delivery') return { label: '🚚 Vận chuyển', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (syncType === 'installation') return { label: '🔧 Lắp đặt', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (syncType === 'customer_care') return { label: '🤝 CSKH', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  return { label: 'Không trigger', cls: 'bg-gray-50 text-gray-600 border-gray-200' };
};

export default function LogisticsPipelineSettingsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [stages, setStages] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const resolvedCompanyId = useMemo(() => {
    if (isAdmin) return companyId || undefined;
    return user?.company_id ? String(user.company_id) : undefined;
  }, [isAdmin, companyId, user?.company_id]);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [stages],
  );

  const eligibleStages = useMemo(
    () => sortedStages.filter((s) => s.bucket_slug !== INTAKE_BUCKET),
    [sortedStages],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stagesRes, companiesRes] = await Promise.all([
        api.get('/logistics/pipeline-stages', {
          params: { all: 'true', ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}) },
        }).catch(() => ({ data: [] })),
        isAdmin
          ? api.get('/companies', { params: { for_module: 'logistics' } }).catch(() => ({ data: { companies: [] } }))
          : Promise.resolve({ data: [] }),
      ]);

      const list = Array.isArray(stagesRes.data) ? stagesRes.data : [];
      setStages(list);
      setSelectedIds((prev) => new Set([...prev].filter((id) => list.some((s) => s.id === id))));

      if (isAdmin) {
        const cos = companiesRes.data?.companies || companiesRes.data || [];
        setCompanies(Array.isArray(cos) ? cos : []);
      } else {
        setCompanies([]);
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin, resolvedCompanyId]);

  useEffect(() => { load(); }, [load]);

  const startAdd = () => {
    setEditId('new');
    setForm({ ...DEFAULT_FORM });
  };

  const startEdit = (stage) => {
    setEditId(stage.id);
    setForm({
      name: stage.name || '',
      icon: stage.icon || '📦',
      color: stage.color || '#f97316',
      is_active: stage.is_active !== false,
      is_intake: stage.bucket_slug === INTAKE_BUCKET,
      crm_sync_type: stage.crm_sync_type || '',
    });
  };

  const save = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        icon: form.icon || '📦',
        color: form.color || '#f97316',
        is_active: form.is_active !== false,
        bucket_slug: form.is_intake ? INTAKE_BUCKET : null,
        crm_sync_type: form.is_intake ? null : (form.crm_sync_type || null),
        ...(isAdmin && resolvedCompanyId ? { company_id: resolvedCompanyId } : {}),
      };
      if (editId === 'new') await api.post('/logistics/pipeline-stages', payload);
      else await api.put(`/logistics/pipeline-stages/${editId}`, payload);
      setEditId('');
      setForm(DEFAULT_FORM);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu cột VC/LĐ');
    } finally {
      setSaving(false);
    }
  };

  const removeStage = async (stage) => {
    if (!confirm(`Xóa cột "${stage.name}"?`)) return;
    try {
      await api.delete(`/logistics/pipeline-stages/${stage.id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa cột');
    }
  };

  const moveStage = async (stage, dir) => {
    const idx = sortedStages.findIndex((s) => s.id === stage.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sortedStages.length) return;
    const next = [...sortedStages];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    const reorder = next.map((s, i) => ({ id: s.id, order_index: i + 1 }));
    try {
      await api.put('/logistics/pipeline-stages-reorder', { stages: reorder });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi sắp xếp cột');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allEligibleSelected = eligibleStages.length > 0 && eligibleStages.every((s) => selectedIds.has(s.id));
  const someEligibleSelected = eligibleStages.some((s) => selectedIds.has(s.id));

  const bulkSetSync = async (syncType) => {
    const targetIds = eligibleStages.map((s) => s.id).filter((id) => selectedIds.has(id));
    if (!targetIds.length) return;
    setBulkSaving(true);
    try {
      await Promise.all(targetIds.map((id) => api.put(`/logistics/pipeline-stages/${id}`, {
        crm_sync_type: syncType,
        ...(syncType ? { crm_target_stage_id: null } : {}),
      })));
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gán trigger VC/LĐ');
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-gray-50 to-white gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">⚙️ Cài đặt Pipeline VC/LĐ</h1>
            <p className="text-[11px] text-gray-500 mt-1">
              Đồng bộ giao diện như setup pipeline khác, hỗ trợ chọn nhiều cột và gán trigger nhanh.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="h-8 px-2 border rounded-lg text-xs bg-white min-w-[220px]"
                title="Lọc pipeline theo công ty"
              >
                <option value="">Tất cả công ty</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={startAdd}
              className="h-8 px-3 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-700 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm cột
            </button>
          </div>
        </div>

        <div className="p-4 border-b">
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {sortedStages.map((s, i) => (
              <div key={s.id} className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-2 transition-all ${
                    s.is_active === false ? 'opacity-40 border-dashed' : 'border-transparent'
                  } ${editId === s.id ? 'ring-2 ring-orange-500' : ''}`}
                  style={{
                    backgroundColor: `${s.color || '#f97316'}20`,
                    color: s.color || '#f97316',
                    borderColor: editId === s.id ? '#f97316' : 'transparent',
                  }}
                >
                  {s.icon || '📦'} {s.name}
                </button>
                {i < sortedStages.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300 mx-0.5 shrink-0" />}
              </div>
            ))}
            {!sortedStages.length && (
              <span className="text-xs text-gray-400">Chưa có cột VC/LĐ</span>
            )}
          </div>
        </div>

        {editId && (
          <div className="border-b bg-orange-50/40 p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">
              {editId === 'new' ? '➕ Thêm cột VC/LĐ' : `✏️ Sửa cột: ${form.name || '...'}`}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Tên cột"
                className="h-9 px-3 border rounded-lg text-sm"
              />
              <input
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="Icon (ví dụ 🚚)"
                className="h-9 px-3 border rounded-lg text-sm"
              />
              <input
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                placeholder="#f97316"
                className="h-9 px-3 border rounded-lg text-sm"
              />
              <select
                value={form.crm_sync_type || ''}
                onChange={(e) => setForm((f) => ({ ...f, crm_sync_type: e.target.value }))}
                disabled={form.is_intake}
                className="h-9 px-2 border rounded-lg text-sm bg-white disabled:bg-gray-100"
              >
                {SYNC_OPTIONS.map((opt) => (
                  <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_intake}
                  onChange={(e) => setForm((f) => ({ ...f, is_intake: e.target.checked, crm_sync_type: e.target.checked ? '' : f.crm_sync_type }))}
                  className="rounded border-gray-300"
                />
                Cột tiếp nhận (chờ vận chuyển)
              </label>
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                Đang hoạt động
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setEditId(''); setForm(DEFAULT_FORM); }}
                className="h-8 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="h-8 px-3 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-700 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? 'Đang lưu...' : 'Lưu cột'}
              </button>
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-b bg-orange-50/60 flex items-center justify-between gap-2 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={allEligibleSelected}
              ref={(el) => { if (el) el.indeterminate = !allEligibleSelected && someEligibleSelected; }}
              onChange={() => {
                if (allEligibleSelected) setSelectedIds(new Set());
                else setSelectedIds(new Set(eligibleStages.map((s) => s.id)));
              }}
              className="rounded border-gray-300"
            />
            Chọn tất cả cột thường ({selectedIds.size}/{eligibleStages.length})
          </label>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button type="button" onClick={() => bulkSetSync('delivery')} disabled={bulkSaving} className="h-7 px-2.5 text-[11px] rounded-lg border border-blue-300 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 disabled:opacity-50 cursor-pointer">
                🚚 Trigger Vận chuyển
              </button>
              <button type="button" onClick={() => bulkSetSync('installation')} disabled={bulkSaving} className="h-7 px-2.5 text-[11px] rounded-lg border border-amber-300 bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100 disabled:opacity-50 cursor-pointer">
                🔧 Trigger Lắp đặt
              </button>
              <button type="button" onClick={() => bulkSetSync('customer_care')} disabled={bulkSaving} className="h-7 px-2.5 text-[11px] rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 disabled:opacity-50 cursor-pointer">
                🤝 Trigger CSKH
              </button>
              <button type="button" onClick={() => bulkSetSync(null)} disabled={bulkSaving} className="h-7 px-2.5 text-[11px] rounded-lg border border-gray-300 bg-white text-gray-600 font-semibold hover:bg-gray-50 disabled:opacity-50 cursor-pointer">
                Bỏ trigger
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500 inline-flex w-full items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải pipeline VC/LĐ...
          </div>
        ) : sortedStages.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Chưa có cột VC/LĐ.</div>
        ) : (
          <div className="divide-y">
            {sortedStages.map((s, i) => {
              const isIntake = s.bucket_slug === INTAKE_BUCKET;
              return (
                <div key={s.id} className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
                  {!isIntake ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleSelect(s.id)}
                      className="rounded border-gray-300"
                    />
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className="w-7 h-7 rounded-full text-white text-xs font-bold inline-flex items-center justify-center" style={{ backgroundColor: s.color || '#f97316' }}>
                    {s.order_index || i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveStage(s, -1)}
                    disabled={i === 0}
                    className="p-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                    title="Lên"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStage(s, 1)}
                    disabled={i === sortedStages.length - 1}
                    className="p-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                    title="Xuống"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <div className="min-w-[220px] flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {s.icon || '📦'} {s.name}
                      {isIntake && <span className="ml-1 text-[10px] text-orange-600">(tiếp nhận)</span>}
                      {s.is_active === false && <span className="ml-1 text-[10px] text-gray-400">(ẩn)</span>}
                    </p>
                    <span className={`inline-flex mt-1 items-center px-1.5 py-0.5 rounded text-[10px] border ${syncTypeBadge(s.crm_sync_type).cls}`}>
                      {syncTypeBadge(s.crm_sync_type).label}
                    </span>
                  </div>
                  {!isIntake && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => api.put(`/logistics/pipeline-stages/${s.id}`, { crm_sync_type: 'delivery', crm_target_stage_id: null }).then(load)} className={`h-7 px-2 rounded border text-[11px] cursor-pointer ${s.crm_sync_type === 'delivery' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-white text-gray-600 border-gray-200'}`}>🚚</button>
                      <button type="button" onClick={() => api.put(`/logistics/pipeline-stages/${s.id}`, { crm_sync_type: 'installation', crm_target_stage_id: null }).then(load)} className={`h-7 px-2 rounded border text-[11px] cursor-pointer ${s.crm_sync_type === 'installation' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-gray-600 border-gray-200'}`}>🔧</button>
                    </div>
                  )}
                  <button type="button" onClick={() => startEdit(s)} className="h-8 px-2.5 rounded border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1 cursor-pointer">
                    <Settings className="h-3.5 w-3.5" /> Sửa
                  </button>
                  {!isIntake && (
                    <button type="button" onClick={() => removeStage(s)} className="h-8 px-2.5 rounded border border-red-200 text-xs text-red-600 hover:bg-red-50 inline-flex items-center gap-1 cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" /> Xóa
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

