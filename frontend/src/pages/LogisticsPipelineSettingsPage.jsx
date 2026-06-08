import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, ChevronRight, ListChecks, Loader2, Plus, Save, Settings, Trash2, Truck, Wrench, ShieldCheck,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';

const INTAKE = 'delivery_pending';
const LS_VC_PIPE_COMPANY = 'vc_pipeline_settings_company_id';
const COLORS = ['#f97316', '#ea580c', '#d97706', '#fb923c', '#0f766e', '#3B82F6', '#8B5CF6', '#10B981'];
const ICONS = ['📦', '🚚', '🔧', '🤝', '📋', '✅', '🎯', '⏳'];

const SYNC_LABELS = {
  delivery: '🚚 Trigger Vận chuyển → CRM',
  installation: '🔧 Trigger Lắp đặt → CRM',
  customer_care: '🤝 Trigger CSKH → CRM',
};

export default function LogisticsPipelineSettingsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);

  const [companies, setCompanies] = useState([]);
  const [settingsCompanyId, setSettingsCompanyId] = useState('');
  const [stages, setStages] = useState([]);
  const [crmStages, setCrmStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [bulkSelected, setBulkSelected] = useState(() => new Set());
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    color: COLORS[0],
    icon: '📦',
    is_active: true,
    crm_sync_type: null,
    crm_target_stage_id: '',
    progress_percent: '',
  });

  const settingsCompanyLabel = useMemo(() => {
    if (!settingsCompanyId) return '';
    const c = companies.find((x) => String(x.id) === String(settingsCompanyId));
    return c?.short_name || c?.name || '';
  }, [companies, settingsCompanyId]);

  const load = useCallback(async () => {
    if (!settingsCompanyId) {
      setStages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [pipeRes, crmRes] = await Promise.all([
        api.get('/logistics/pipeline-stages', {
          params: { all: 'true', company_id: settingsCompanyId },
        }),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
      ]);
      setStages(pipeRes.data || []);
      setCrmStages((crmRes.data || []).filter((s) => s.pipeline_type === 'deal' || !s.pipeline_type));
      setBulkSelected((prev) => new Set([...prev].filter((id) => (pipeRes.data || []).some((s) => s.id === id))));
    } catch {
      setStages([]);
    }
    setLoading(false);
  }, [settingsCompanyId]);

  useEffect(() => {
    if (!isAdmin) {
      const cid = user?.company_id ? String(user.company_id) : '';
      setSettingsCompanyId(cid);
      return;
    }
    api.get('/companies', { params: { for_module: 'logistics' } })
      .then((r) => {
        const cos = r.data?.companies || r.data || [];
        const list = Array.isArray(cos) ? cos : [];
        setCompanies(list);
        const saved = localStorage.getItem(LS_VC_PIPE_COMPANY) || '';
        const pick = saved && list.some((c) => String(c.id) === saved)
          ? saved
          : (list[0]?.id ? String(list[0].id) : '');
        setSettingsCompanyId(pick);
      })
      .catch(() => setCompanies([]));
  }, [isAdmin, user?.company_id]);

  useEffect(() => {
    if (isAdmin && settingsCompanyId) {
      try { localStorage.setItem(LS_VC_PIPE_COMPANY, settingsCompanyId); } catch { /* ignore */ }
    }
  }, [isAdmin, settingsCompanyId]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(
    () => [...stages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [stages],
  );

  const eligibleCols = useMemo(
    () => sorted.filter((s) => s.bucket_slug !== INTAKE),
    [sorted],
  );

  const editingIntake = editId && sorted.find((s) => s.id === editId)?.bucket_slug === INTAKE;

  const requestEdit = (stage) => {
    if (adding) {
      if (!confirm(`Đang thêm cột mới. Chuyển sang sửa «${stage.name}»?`)) return;
      setAdding(false);
    }
    startEdit(stage);
  };

  const startAdd = () => {
    setAdding(true);
    setEditId(null);
    setForm({
      name: '',
      color: COLORS[sorted.length % COLORS.length],
      icon: ICONS[sorted.length % ICONS.length],
      is_active: true,
      crm_sync_type: null,
      crm_target_stage_id: '',
      progress_percent: '',
    });
  };

  const startEdit = (stage) => {
    setEditId(stage.id);
    setAdding(false);
    setForm({
      name: stage.name || '',
      color: stage.color || COLORS[0],
      icon: stage.icon || '📦',
      is_active: stage.is_active !== false,
      crm_sync_type: stage.crm_sync_type || null,
      crm_target_stage_id: stage.crm_target_stage_id || '',
      progress_percent: stage.progress_percent ?? '',
    });
  };

  const saveNew = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    if (!settingsCompanyId) return alert('Chọn công ty trước');
    setSaving(true);
    try {
      await api.post('/logistics/pipeline-stages', {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon,
        is_active: form.is_active,
        progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
        crm_sync_type: form.crm_target_stage_id ? null : (form.crm_sync_type || null),
        crm_target_stage_id: form.crm_target_stage_id || null,
        company_id: settingsCompanyId,
      });
      setAdding(false);
      setEditId(null);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi tạo cột');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    const intakeRow = sorted.find((s) => s.id === editId)?.bucket_slug === INTAKE;
    setSaving(true);
    try {
      await api.put(`/logistics/pipeline-stages/${editId}`, {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon,
        is_active: form.is_active,
        progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
        crm_sync_type: intakeRow ? null : (form.crm_target_stage_id ? null : (form.crm_sync_type || null)),
        crm_target_stage_id: intakeRow ? null : (form.crm_target_stage_id || null),
      });
      setEditId(null);
      setAdding(false);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id, bucket) => {
    if (bucket === INTAKE) return alert('Không xóa cột tiếp nhận — chỉ ẩn');
    if (!confirm('Xóa cột này?')) return;
    if (editId === id) { setEditId(null); setAdding(false); }
    setStages((prev) => prev.filter((s) => s.id !== id));
    try {
      await api.delete(`/logistics/pipeline-stages/${id}`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa');
      await load();
    }
  };

  const toggleActive = async (stage) => {
    try {
      await api.put(`/logistics/pipeline-stages/${stage.id}`, { is_active: !stage.is_active });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật');
    }
  };

  const toggleRowSync = async (stage, syncType) => {
    const next = stage.crm_sync_type === syncType ? null : syncType;
    try {
      await api.put(`/logistics/pipeline-stages/${stage.id}`, {
        crm_sync_type: next,
        ...(next ? { crm_target_stage_id: null } : {}),
      });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật trigger');
    }
  };

  const toggleBulk = (id) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkSetSync = async (syncType) => {
    const ids = eligibleCols.map((s) => s.id).filter((id) => bulkSelected.has(id));
    if (!ids.length) return;
    setBulkSaving(true);
    try {
      await Promise.all(ids.map((id) => api.put(`/logistics/pipeline-stages/${id}`, {
        crm_sync_type: syncType,
        ...(syncType ? { crm_target_stage_id: null } : {}),
      })));
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gán trigger hàng loạt');
    } finally {
      setBulkSaving(false);
    }
  };

  const persistStagesReorder = async (newList) => {
    if (reorderBusy) return;
    const reorder = newList.map((s, i) => ({ id: s.id, order_index: i + 1 }));
    const prevStages = stages;
    const orderMap = new Map(newList.map((s, i) => [String(s.id), i + 1]));
    setReorderBusy(true);
    setStages((prev) => prev.map((s) => {
      const nextOrder = orderMap.get(String(s.id));
      return nextOrder != null ? { ...s, order_index: nextOrder } : s;
    }));
    try {
      await api.put('/logistics/pipeline-stages-reorder', { stages: reorder });
    } catch (err) {
      setStages(prevStages);
      alert('Lỗi sắp xếp: ' + (err.response?.data?.error || err.message));
    } finally {
      setReorderBusy(false);
    }
  };

  const moveStage = async (stage, dir) => {
    if (reorderBusy || stage.bucket_slug === INTAKE) return;
    const list = [...sorted];
    const idx = list.findIndex((s) => s.id === stage.id);
    if (idx < 0 || (dir === -1 && idx === 0) || (dir === 1 && idx === list.length - 1)) return;
    if (dir === -1 && list[idx - 1]?.bucket_slug === INTAKE) return;
    const newList = [...list];
    [newList[idx], newList[idx + dir]] = [newList[idx + dir], newList[idx]];
    await persistStagesReorder(newList);
  };

  const handleDragStart = (e, stage) => {
    if (stage.bucket_slug === INTAKE) {
      e.preventDefault();
      return;
    }
    setDraggingId(stage.id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', stage.id); } catch { /* ignore */ }
  };
  const handleDragEnd = () => { setDraggingId(null); setDragOverId(null); };
  const handleDragOver = (e, stage) => {
    const sourceId = draggingId || e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === stage.id || stage.bucket_slug === INTAKE) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== stage.id) setDragOverId(stage.id);
  };
  const handleDrop = async (e, target) => {
    if (reorderBusy) return;
    e.preventDefault();
    e.stopPropagation();
    const sourceId = draggingId || e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === target.id || target.bucket_slug === INTAKE) return;

    const list = [...sorted];
    const fromIdx = list.findIndex((s) => s.id === sourceId);
    const toIdx = list.findIndex((s) => s.id === target.id);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx || list[fromIdx]?.bucket_slug === INTAKE) return;

    const newList = [...list];
    const [moved] = newList.splice(fromIdx, 1);
    const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    newList.splice(insertIdx, 0, moved);
    await persistStagesReorder(newList);
  };

  const vcCrmStages = crmStages.filter((cs) => !cs.is_lost && !cs.is_won);
  const deliveryCrmStages = vcCrmStages.filter((cs) => cs.sync_role === 'vc_delivery');
  const installationCrmStages = vcCrmStages.filter((cs) => cs.sync_role === 'vc_installation');
  const careCrmStages = vcCrmStages.filter((cs) => cs.sync_role === 'vc_customer_care');

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="h-7 w-7 text-orange-600" />
          <h1 className="text-xl font-bold text-gray-900">Pipeline VC/LĐ</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/vc/task-templates"
            className="text-sm font-medium text-orange-700 hover:text-orange-900 border border-orange-200 rounded-lg px-3 py-2 bg-white inline-flex items-center gap-1.5"
          >
            <ListChecks className="h-4 w-4" /> Bộ mẫu nhiệm vụ
          </Link>
          <Link
            to="/vc/dashboard"
            className="text-sm font-medium text-orange-700 hover:text-orange-900 border border-orange-200 rounded-lg px-3 py-2 bg-white"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${settingsCompanyId ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
          1. Công ty {settingsCompanyId ? '✓' : '·'}
        </span>
        <span className="text-gray-300">→</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${settingsCompanyId ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-400 border border-gray-200'}`}>
          2. Pipeline VC/LĐ
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-orange-200 bg-white shadow-sm">
        <Building2 className="h-5 w-5 text-orange-600 shrink-0" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Công ty</p>
          {isAdmin ? (
            <select
              value={settingsCompanyId}
              onChange={(e) => setSettingsCompanyId(e.target.value)}
              className="mt-1 w-full max-w-md h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name || c.id}</option>
              ))}
            </select>
          ) : (
            <p className="mt-1 text-sm font-medium text-gray-900">{settingsCompanyLabel || 'Theo tài khoản'}</p>
          )}
        </div>
      </div>

      {!settingsCompanyId ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          Chọn <strong>Công ty</strong> phía trên.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-orange-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm bg-orange-600">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">Cột Kanban VC/LĐ</h2>
                <p className="text-[10px] text-gray-500">{sorted.length} cột — kéo ⋮⋮ để sắp xếp</p>
              </div>
            </div>
            <button
              type="button"
              onClick={startAdd}
              className="h-8 px-3 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm cột
            </button>
          </div>

          <div className="p-4 border-b">
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {sorted.map((s, i) => (
                <div key={s.id} className="flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => requestEdit(s)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-2 transition-all ${
                      !s.is_active ? 'opacity-40 border-dashed' : 'border-transparent'
                    } ${editId === s.id ? 'ring-2 ring-orange-500' : ''}`}
                    style={{
                      backgroundColor: `${s.color || '#f97316'}20`,
                      color: s.color || '#f97316',
                      borderColor: editId === s.id ? '#ea580c' : 'transparent',
                    }}
                  >
                    {s.icon && <span className="mr-1">{s.icon}</span>}
                    {s.name}
                    {s.bucket_slug === INTAKE && <span className="ml-1 text-[10px] font-normal">(tiếp nhận)</span>}
                  </button>
                  {i < sorted.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300 mx-0.5 shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {eligibleCols.length > 0 && (() => {
            const eligibleIds = eligibleCols.map((s) => s.id);
            const allSelected = eligibleIds.every((id) => bulkSelected.has(id));
            const someSelected = eligibleIds.some((id) => bulkSelected.has(id));
            const triggerCount = eligibleCols.filter((s) => s.crm_sync_type).length;
            return (
              <div className="border-t bg-amber-50/50 px-4 py-2.5 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                    onChange={() => {
                      if (allSelected) setBulkSelected(new Set());
                      else setBulkSelected(new Set(eligibleIds));
                    }}
                    className="rounded border-gray-300"
                  />
                  Chọn nhiều ({bulkSelected.size}/{eligibleIds.length})
                </label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700 border border-orange-200">
                  🔥 {triggerCount} cột trigger
                </span>
                {bulkSelected.size > 0 && (
                  <>
                    <span className="text-xs text-gray-400">→</span>
                    <button
                      type="button"
                      onClick={() => bulkSetSync('delivery')}
                      disabled={bulkSaving}
                      className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                    >
                      {bulkSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : '🚚'}
                      {' '}Đặt {bulkSelected.size} cột → Vận chuyển
                    </button>
                    <button
                      type="button"
                      onClick={() => bulkSetSync('installation')}
                      disabled={bulkSaving}
                      className="h-8 px-3 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                    >
                      🔧 Đặt {bulkSelected.size} cột → Lắp đặt
                    </button>
                    <button
                      type="button"
                      onClick={() => bulkSetSync('customer_care')}
                      disabled={bulkSaving}
                      className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                    >
                      🤝 Đặt {bulkSelected.size} cột → CSKH
                    </button>
                    <button
                      type="button"
                      onClick={() => bulkSetSync(null)}
                      disabled={bulkSaving}
                      className="h-8 px-3 bg-white border border-orange-300 text-orange-700 rounded-lg text-xs font-semibold hover:bg-orange-50 disabled:opacity-50 cursor-pointer"
                    >
                      Bỏ trigger
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkSelected(new Set())}
                      className="h-8 px-2 text-gray-500 hover:text-gray-700 text-xs cursor-pointer"
                    >
                      Hủy chọn
                    </button>
                  </>
                )}
                {bulkSelected.size === 0 && (
                  <span className="text-[11px] text-gray-500">
                    Tick các cột → bấm <strong>«Vận chuyển»</strong> hoặc <strong>«Lắp đặt»</strong>. Khi kéo dự án vào cột trigger → CRM tự cập nhật.
                  </span>
                )}
              </div>
            );
          })()}

          <div className="border-t">
            {sorted.map((s, i) => {
              const isIntake = s.bucket_slug === INTAKE;
              const isDragging = draggingId === s.id;
              const isDragOver = dragOverId === s.id && draggingId && draggingId !== s.id;
              return (
                <div
                  key={s.id}
                  onDragOver={(e) => handleDragOver(e, s)}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={(e) => handleDrop(e, s)}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 transition-all
                    ${isDragging ? 'opacity-40 bg-orange-50' : 'hover:bg-gray-50'}
                    ${isDragOver ? 'border-t-2 border-t-orange-500 bg-orange-50/50' : ''}
                    ${bulkSelected.has(s.id) ? 'bg-blue-50/60' : ''}
                    ${!s.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      draggable={!isIntake}
                      onDragStart={(e) => handleDragStart(e, s)}
                      onDragEnd={handleDragEnd}
                      className={`select-none px-0.5 text-gray-400 ${isIntake ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing hover:text-gray-700'}`}
                      title={isIntake ? 'Cột tiếp nhận cố định ở đầu' : 'Kéo để sắp xếp lại'}
                    >
                      ⋮⋮
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <button type="button" onClick={() => moveStage(s, -1)}
                        disabled={reorderBusy || i === 0 || isIntake || sorted[i - 1]?.bucket_slug === INTAKE}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▲</button>
                      <button type="button" onClick={() => moveStage(s, 1)}
                        disabled={reorderBusy || i === sorted.length - 1 || isIntake}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▼</button>
                    </div>
                  </div>
                  <div className={`flex items-center gap-3 flex-1 min-w-0 ${draggingId ? 'pointer-events-none' : ''}`}>
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: s.color || '#f97316' }}
                    >
                      {i + 1}
                    </div>
                    {!isIntake && (
                      <input
                        type="checkbox"
                        checked={bulkSelected.has(s.id)}
                        onChange={() => toggleBulk(s.id)}
                        className="rounded border-gray-300 cursor-pointer"
                        title="Chọn để gán trigger hàng loạt"
                      />
                    )}
                    <span className="text-lg shrink-0">{s.icon || '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                        {s.name}
                        {s.crm_target_stage && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                            📋 → CRM: {s.crm_target_stage.icon ? `${s.crm_target_stage.icon} ` : ''}{s.crm_target_stage.name}
                          </span>
                        )}
                        {!s.crm_target_stage && s.crm_sync_type && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                            {SYNC_LABELS[s.crm_sync_type] || s.crm_sync_type}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {isIntake ? 'Dự án bàn giao từ SX · chờ vận chuyển' : 'Cột pipeline VC/LĐ'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isIntake && (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleRowSync(s, 'delivery')}
                            className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                              s.crm_sync_type === 'delivery'
                                ? 'bg-blue-100 text-blue-800 border-blue-300'
                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-700'
                            }`}
                            title="Trigger Vận chuyển → CRM"
                          >
                            <Truck className="h-3 w-3" /> VC
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleRowSync(s, 'installation')}
                            className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                              s.crm_sync_type === 'installation'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-amber-300 hover:text-amber-700'
                            }`}
                            title="Trigger Lắp đặt → CRM"
                          >
                            <Wrench className="h-3 w-3" /> LĐ
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleRowSync(s, 'customer_care')}
                            className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                              s.crm_sync_type === 'customer_care'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-emerald-300 hover:text-emerald-700'
                            }`}
                            title="Trigger CSKH → CRM"
                          >
                            <ShieldCheck className="h-3 w-3" /> CSKH
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => toggleActive(s)} className="p-1.5 rounded hover:bg-gray-100 cursor-pointer text-[10px] text-gray-500" title={s.is_active ? 'Ẩn' : 'Hiện'}>
                        {s.is_active ? 'Ẩn' : 'Hiện'}
                      </button>
                      <button type="button" onClick={() => requestEdit(s)} className="p-1.5 rounded hover:bg-orange-50 text-orange-600 cursor-pointer">
                        <Save className="h-3.5 w-3.5" />
                      </button>
                      {!isIntake && (
                        <button type="button" onClick={() => del(s.id, s.bucket_slug)} className="p-1.5 rounded hover:bg-red-50 text-red-500 cursor-pointer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {(adding || editId) && (
            <div className="p-4 border-t bg-orange-50/50 space-y-3">
              <p className="text-sm font-bold text-gray-900">
                {adding ? (
                  <span className="inline-flex items-center gap-1.5 text-orange-800">
                    <Plus className="h-4 w-4" /> Thêm cột mới
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-orange-800">
                    <Save className="h-4 w-4" /> Sửa cột: {form.name || '…'}
                  </span>
                )}
              </p>
              <div>
                <label className="text-[10px] font-medium text-gray-500 block mb-1">Tên cột *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full h-8 px-3 border rounded-lg text-sm"
                  placeholder="VD: Đang vận chuyển"
                />
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] text-gray-500">Màu</span>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div>
                <span className="text-[10px] text-gray-500 block mb-1">Icon</span>
                <div className="flex flex-wrap gap-1">
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, icon: ic }))}
                      className={`w-8 h-8 rounded text-sm cursor-pointer ${form.icon === ic ? 'bg-orange-100 ring-2 ring-orange-500' : 'bg-gray-50 hover:bg-gray-100'}`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 block mb-1">% hoàn thành (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress_percent ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, progress_percent: e.target.value }))}
                  className="w-full max-w-[160px] h-8 px-3 border rounded-lg text-sm"
                  placeholder="VD: 60"
                />
              </div>
              {!editingIntake && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-orange-700">Trigger đồng bộ CRM (chọn 1)</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'delivery', label: '🚚 Vận chuyển', color: 'blue' },
                      { value: 'installation', label: '🔧 Lắp đặt', color: 'amber' },
                      { value: 'customer_care', label: '🤝 CSKH', color: 'emerald' },
                    ].map((opt) => (
                      <label key={opt.value} className="inline-flex items-center gap-2 text-xs cursor-pointer bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={form.crm_sync_type === opt.value}
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            crm_sync_type: e.target.checked ? opt.value : null,
                            crm_target_stage_id: e.target.checked ? '' : f.crm_target_stage_id,
                          }))}
                          className="rounded"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  <details className="mt-1">
                    <summary className="text-[10px] font-medium text-gray-500 cursor-pointer hover:text-gray-700">
                      📋 Nâng cao: Gán cứng → 1 cột CRM cụ thể
                    </summary>
                    <div className="mt-2 space-y-2">
                      <select
                        value={form.crm_target_stage_id || ''}
                        onChange={(e) => setForm((f) => ({ ...f, crm_target_stage_id: e.target.value, crm_sync_type: e.target.value ? null : f.crm_sync_type }))}
                        className="w-full h-8 px-2 border rounded-lg text-sm bg-white border-blue-200"
                      >
                        <option value="">— Không —</option>
                        {deliveryCrmStages.length > 0 && (
                          <optgroup label="Vận chuyển">
                            {deliveryCrmStages.map((cs) => (
                              <option key={cs.id} value={cs.id}>{cs.icon ? `${cs.icon} ` : ''}{cs.name}</option>
                            ))}
                          </optgroup>
                        )}
                        {installationCrmStages.length > 0 && (
                          <optgroup label="Lắp đặt">
                            {installationCrmStages.map((cs) => (
                              <option key={cs.id} value={cs.id}>{cs.icon ? `${cs.icon} ` : ''}{cs.name}</option>
                            ))}
                          </optgroup>
                        )}
                        {careCrmStages.length > 0 && (
                          <optgroup label="CSKH">
                            {careCrmStages.map((cs) => (
                              <option key={cs.id} value={cs.id}>{cs.icon ? `${cs.icon} ` : ''}{cs.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <p className="text-[10px] text-gray-500">
                        Dùng khi cần đẩy deal về đúng 1 cột CRM (override trigger ở trên).
                      </p>
                    </div>
                  </details>
                </div>
              )}
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                Hiển thị trên Kanban
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={adding ? saveNew : saveEdit}
                  disabled={saving}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {adding ? 'Tạo cột' : 'Lưu thay đổi'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setEditId(null); }}
                  disabled={saving}
                  className="px-4 py-2 border rounded-lg text-sm cursor-pointer disabled:opacity-50"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
