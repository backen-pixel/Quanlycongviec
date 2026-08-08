import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, CheckCircle2, ChevronRight, EyeOff, GripVertical, Info, ListChecks, Loader2,
  Pencil, Plus, RefreshCw, Save, Settings, Trash2, Truck, UserCircle, Wrench,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { isInstallVcStage } from '../lib/managementDashboardUtils';

const INTAKE = 'delivery_pending';
const LS_VC_PIPE_COMPANY = 'vc_pipeline_settings_company_id';
const COLORS = ['#f97316', '#ea580c', '#d97706', '#fb923c', '#0f766e', '#3B82F6', '#8B5CF6', '#10B981'];
const ICONS = ['📦', '🚚', '🔧', '🤝', '📋', '✅', '🎯', '⏳'];

const SETTINGS_TABS = [
  { id: 'stages', label: 'Giai đoạn', Icon: ListChecks },
  { id: 'handover', label: 'Bàn giao SX→VC', Icon: UserCircle },
];

function PipelineMiniFlowBar({ stages, className = '' }) {
  const list = (stages || []).filter((s) => s.is_active !== false);
  if (!list.length) return null;
  return (
    <div
      className={`flex h-1.5 rounded-full overflow-hidden gap-px bg-gray-100 ${className}`}
      title="Toàn cảnh flow pipeline"
    >
      {list.map((s) => (
        <div
          key={s.id}
          className="flex-1 min-w-[3px]"
          style={{ backgroundColor: s.color || '#94A3B8' }}
        />
      ))}
    </div>
  );
}

const CRM_SYNC_TYPE_BADGES = {
  delivery: { cls: 'bg-blue-50 text-blue-700 border-blue-200', text: '🚚 Trigger → VC' },
  installation: { cls: 'bg-amber-50 text-amber-800 border-amber-200', text: '🔧 Trigger → LĐ' },
  customer_care: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: '🤝 Trigger → CSKH' },
};

function StageBadges({ stage }) {
  const s = stage;
  const badges = [];
  if (s.bucket_slug === INTAKE) {
    badges.push({ key: 'intake', cls: 'bg-sky-50 text-sky-700 border-sky-200', text: 'Tiếp nhận' });
  }
  if (s.is_handover_to_install) {
    badges.push({ key: 'to-ld', cls: 'bg-teal-50 text-teal-800 border-teal-200', text: '→ LĐ' });
  }
  if (isInstallVcStage(s)) {
    badges.push({ key: 'col-ld', cls: 'bg-amber-50 text-amber-800 border-amber-200', text: 'Cột LĐ' });
  }
  if (s.progress_percent != null && s.progress_percent !== '') {
    badges.push({ key: 'pct', cls: 'bg-violet-50 text-violet-700 border-violet-200', text: `${s.progress_percent}%` });
  }
  if (!s.is_active) {
    badges.push({ key: 'hidden', cls: 'bg-orange-50 text-orange-700 border-orange-200', text: 'Ẩn' });
  }
  if (s.crm_target_stage) {
    badges.push({
      key: 'crm-hard',
      cls: 'bg-blue-50 text-blue-700 border-blue-200',
      text: `→ ${s.crm_target_stage.icon ? `${s.crm_target_stage.icon} ` : ''}${s.crm_target_stage.name}`,
    });
  } else if (s.crm_sync_type && CRM_SYNC_TYPE_BADGES[s.crm_sync_type]) {
    const b = CRM_SYNC_TYPE_BADGES[s.crm_sync_type];
    badges.push({ key: `sync-${s.crm_sync_type}`, cls: b.cls, text: b.text });
  }
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {badges.map((b) => (
        <span key={b.key} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${b.cls}`}>
          {b.text}
        </span>
      ))}
    </div>
  );
}

export default function LogisticsPipelineSettingsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);

  const [companies, setCompanies] = useState([]);
  const [settingsCompanyId, setSettingsCompanyId] = useState('');
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stages');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverSaving, setHandoverSaving] = useState(false);
  const [handoverUsers, setHandoverUsers] = useState([]);
  const [vcResponsibleId, setVcResponsibleId] = useState('');
  const [ldResponsibleId, setLdResponsibleId] = useState('');
  const [vcConfirmUserId, setVcConfirmUserId] = useState('');
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

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!settingsCompanyId) {
      setStages([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const pipeRes = await api.get('/logistics/pipeline-stages', {
        params: { all: 'true', company_id: settingsCompanyId },
      });
      setStages(pipeRes.data || []);
    } catch {
      if (!silent) setStages([]);
    } finally {
      if (!silent) setLoading(false);
    }
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

  const loadHandoverSettings = useCallback(async () => {
    if (!settingsCompanyId) {
      setHandoverUsers([]);
      setVcResponsibleId('');
      setLdResponsibleId('');
      setVcConfirmUserId('');
      return;
    }
    setHandoverLoading(true);
    try {
      const { data } = await api.get(`/logistics/handover-settings/${settingsCompanyId}`);
      setHandoverUsers(data?.users || []);
      setVcResponsibleId(data?.settings?.responsible_user_id ? String(data.settings.responsible_user_id) : '');
      setLdResponsibleId(data?.settings?.installer_user_id ? String(data.settings.installer_user_id) : '');
      setVcConfirmUserId(data?.settings?.handover_confirm_user_id ? String(data.settings.handover_confirm_user_id) : '');
    } catch {
      setHandoverUsers([]);
      setVcResponsibleId('');
      setLdResponsibleId('');
      setVcConfirmUserId('');
    }
    setHandoverLoading(false);
  }, [settingsCompanyId]);

  useEffect(() => { void loadHandoverSettings(); }, [loadHandoverSettings]);

  const saveHandoverSettings = async () => {
    if (!settingsCompanyId) return;
    setHandoverSaving(true);
    try {
      await api.put(`/logistics/handover-settings/${settingsCompanyId}`, {
        responsible_user_id: vcResponsibleId || null,
        installer_user_id: ldResponsibleId || null,
        handover_confirm_user_id: vcConfirmUserId || null,
      });
      await loadHandoverSettings();
      alert('Đã lưu cấu hình bàn giao SX → VC/LĐ.');
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    }
    setHandoverSaving(false);
  };

  const sorted = useMemo(
    () => [...stages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [stages],
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
    const hardTarget = form.crm_target_stage_id || null;
    setSaving(true);
    try {
      await api.post('/logistics/pipeline-stages', {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon,
        is_active: form.is_active,
        progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
        crm_sync_type: hardTarget ? null : (form.crm_sync_type || null),
        crm_target_stage_id: hardTarget,
        bucket_slug: null,
        company_id: settingsCompanyId,
      });
      setAdding(false);
      setEditId(null);
      await load({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi tạo cột');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    const intakeRow = sorted.find((s) => s.id === editId)?.bucket_slug === INTAKE;
    const hardTarget = intakeRow ? null : (form.crm_target_stage_id || null);
    setSaving(true);
    try {
      await api.put(`/logistics/pipeline-stages/${editId}`, {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon,
        is_active: form.is_active,
        progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
        crm_sync_type: intakeRow || hardTarget ? null : (form.crm_sync_type || null),
        crm_target_stage_id: hardTarget,
      });
      setEditId(null);
      setAdding(false);
      await load({ silent: true });
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
      await load({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa');
      await load({ silent: true });
    }
  };

  const toggleActive = async (stage) => {
    try {
      await api.put(`/logistics/pipeline-stages/${stage.id}`, { is_active: !stage.is_active });
      await load({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật');
    }
  };

  const toggleInstallTabColumn = async (stage) => {
    const isOn = String(stage.bucket_slug || '').toLowerCase().includes('install')
      || isInstallVcStage(stage);
    try {
      await api.put(`/logistics/pipeline-stages/${stage.id}`, {
        bucket_slug: isOn ? null : 'installation',
        is_handover_to_install: false,
      });
      await load({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật cột Lắp đặt');
    }
  };

  const toggleHandoverToInstall = async (stage) => {
    if (stage.bucket_slug === INTAKE) return;
    if (isInstallVcStage(stage)) {
      return alert('Cột Lắp đặt không cần cờ «Chuyển LĐ» — chỉ gắn trên cột trước Lắp đặt.');
    }
    try {
      await api.put(`/logistics/pipeline-stages/${stage.id}`, {
        is_handover_to_install: !stage.is_handover_to_install,
      });
      await load({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật chuyển LĐ');
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
    if (idx < 0) return;
    const dest = idx + dir;
    if (dest < 0 || dest >= list.length) return;
    if (dir === -1 && list[dest]?.bucket_slug === INTAKE) return;
    const newList = [...list];
    [newList[idx], newList[dest]] = [newList[dest], newList[idx]];
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

  const pillBtn = (active, activeCls, idleCls = 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100') =>
    `h-6 px-1.5 rounded-md text-[9px] font-semibold flex items-center gap-0.5 cursor-pointer border ${
      active ? activeCls : idleCls
    }`;

  const renderStageForm = () => {
    if (!adding && !editId) return null;
    return (
      <div className="p-3 border-t space-y-2.5 bg-orange-50/40">
        <p className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
          {adding ? <Plus className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          {adding ? 'Thêm giai đoạn VC / LĐ' : `Sửa: ${form.name || '…'}`}
        </p>
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-1">Tên *</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full h-8 px-2.5 border border-gray-200 rounded-lg text-xs"
            placeholder="VD: Đang vận chuyển / Đang lắp đặt"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] text-gray-500">Màu</span>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm((f) => ({ ...f, color: c }))}
              className={`w-6 h-6 rounded-full border-2 ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
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
                className={`w-7 h-7 rounded text-sm cursor-pointer ${
                  form.icon === ic
                    ? 'bg-orange-100 ring-2 ring-orange-500'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-1">% hoàn thành</label>
          <input
            type="number"
            min={0}
            max={100}
            value={form.progress_percent ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, progress_percent: e.target.value }))}
            className="w-full max-w-[140px] h-8 px-2.5 border border-gray-200 rounded-lg text-xs"
            placeholder="VD: 60"
          />
        </div>
        <label className="flex items-center gap-2 text-[11px] cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            className="rounded border-gray-300"
          />
          Hiện trên Kanban
        </label>
        {!editingIntake && (
          <div className="space-y-1.5 p-2.5 rounded-lg bg-blue-50 border border-blue-200">
            <label className="text-[10px] font-semibold text-blue-800 block">
              Trigger CRM khi project vào cột
            </label>
            <select
              value={form.crm_sync_type || ''}
              onChange={(e) => setForm((f) => ({
                ...f,
                crm_sync_type: e.target.value || null,
                crm_target_stage_id: e.target.value ? '' : f.crm_target_stage_id,
              }))}
              className="w-full h-8 px-2 border border-blue-200 rounded-lg text-xs bg-white focus:border-blue-400"
            >
              <option value="">— Không —</option>
              <option value="delivery">🚚 Vận chuyển (sync_role=vc_delivery)</option>
              <option value="installation">🔧 Lắp đặt (sync_role=vc_installation)</option>
              <option value="customer_care">🤝 CSKH (sync_role=vc_customer_care)</option>
            </select>
            <p className="text-[10px] text-blue-600 leading-snug">
              VD: «Đang giao» → Vận chuyển thì CRM deal nhảy sang cột có
              <code className="mx-1 px-1 bg-white/70 rounded">sync_role=vc_delivery</code>
              (cần deal đã bàn giao SX→VC).
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={adding ? saveNew : saveEdit}
            disabled={saving}
            className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {adding ? 'Tạo' : 'Lưu'}
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setEditId(null); }}
            disabled={saving}
            className="h-8 px-3 border border-gray-200 rounded-lg text-xs cursor-pointer disabled:opacity-50"
          >
            Hủy
          </button>
        </div>
      </div>
    );
  };

  const renderPipelinePanel = () => {
    const list = sorted;

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col max-h-[min(80vh,760px)] min-h-[360px]">
        <div className="px-4 py-3 border-b border-gray-100 space-y-2 shrink-0 bg-white">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ring-2 ring-offset-1 bg-orange-600 ring-orange-200">
                <Truck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs font-semibold text-gray-900">
                  Pipeline Lắp đặt
                </h2>
                <p className="text-[10px] text-gray-400">{list.length} giai đoạn · một luồng Kanban</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => startAdd()}
              className="h-7 px-2.5 bg-emerald-600 text-white rounded-lg text-[10px] font-semibold hover:bg-emerald-700 flex items-center gap-1 cursor-pointer shrink-0 shadow-sm ring-1 ring-emerald-500/40"
              title="Thêm giai đoạn"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm
            </button>
          </div>
          <PipelineMiniFlowBar stages={list} />
          <div className="flex items-center gap-0.5 overflow-x-auto pb-0.5">
            {list.length === 0 ? (
              <p className="text-[10px] text-gray-400 italic py-1">Chưa có giai đoạn — bấm Thêm</p>
            ) : list.map((s, i) => (
              <div key={s.id} className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => requestEdit(s)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium cursor-pointer transition-all border ${
                    !s.is_active ? 'opacity-40 border-dashed' : 'border-transparent'
                  } ${editId === s.id ? 'ring-2 ring-violet-400 ring-offset-1' : ''}`}
                  style={{
                    backgroundColor: `${s.color || '#f97316'}18`,
                    color: s.color || '#f97316',
                    borderColor: editId === s.id ? '#8B5CF6' : 'transparent',
                  }}
                  title={s.name}
                >
                  {s.icon && <span className="mr-0.5">{s.icon}</span>}
                  <span className="max-w-[72px] truncate inline-block align-middle">{s.name}</span>
                </button>
                {i < list.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300 mx-0.5 shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        <div className="divide-y divide-gray-100 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          {list.length === 0 ? (
            <div className="px-4 py-12 text-center text-xs text-gray-400">
              Chưa có giai đoạn VC / LĐ.
            </div>
          ) : list.map((s, i) => {
            const isIntake = s.bucket_slug === INTAKE;
            const isDragging = draggingId === s.id;
            const isDragOver = dragOverId === s.id && draggingId && draggingId !== s.id;
            const onInstallCol = isInstallVcStage(s);
            return (
              <div
                key={s.id}
                onDragOver={(e) => handleDragOver(e, s)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => handleDrop(e, s)}
                className={`flex items-start gap-2 px-3 py-2 transition-all
                  ${isDragging ? 'opacity-40 bg-violet-50/50' : 'hover:bg-gray-50/80'}
                  ${isDragOver ? 'bg-violet-50/60 ring-1 ring-inset ring-violet-300' : ''}
                  ${!s.is_active ? 'opacity-55' : ''}
                  ${editId === s.id ? 'bg-violet-50/40 ring-1 ring-inset ring-violet-200' : ''}`}
              >
                <div className="flex items-center gap-0.5 pt-1 shrink-0">
                  <span
                    draggable={!isIntake}
                    onDragStart={(e) => handleDragStart(e, s)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none ${isIntake ? 'opacity-30 cursor-not-allowed' : ''}`}
                    title={isIntake ? 'Cột tiếp nhận cố định' : 'Kéo sắp xếp'}
                  >
                    <GripVertical className="w-4 h-4" strokeWidth={1.5} />
                  </span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveStage(s, -1)}
                      disabled={reorderBusy || i === 0 || isIntake || list[i - 1]?.bucket_slug === INTAKE}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[9px] leading-none px-0.5"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStage(s, 1)}
                      disabled={reorderBusy || i === list.length - 1 || isIntake}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[9px] leading-none px-0.5"
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <div
                  className="w-1 self-stretch rounded-full shrink-0 min-h-[2.5rem]"
                  style={{ backgroundColor: s.color || '#94A3B8' }}
                />
                <div className={`flex-1 min-w-0 py-0.5 ${draggingId ? 'pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">{s.icon || (onInstallCol ? '🔧' : '📦')}</span>
                    <p className="text-xs font-bold text-gray-900 truncate">{s.name}</p>
                    <span className="text-[9px] font-semibold text-violet-600 bg-violet-50 px-1 py-0.5 rounded font-mono">
                      #{s.order_index ?? i + 1}
                    </span>
                  </div>
                  <StageBadges stage={s} />
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[280px] border-l border-gray-200 pl-1.5 ml-1">
                  {!isIntake && (
                    <>
                      {!onInstallCol && (
                        <button
                          type="button"
                          onClick={() => toggleHandoverToInstall(s)}
                          className={pillBtn(!!s.is_handover_to_install, 'bg-teal-100 text-teal-900 border-teal-300 ring-1 ring-teal-200')}
                          title={s.is_handover_to_install
                            ? 'Đang bật: kéo dự án vào cột này → nhảy sang cột Lắp đặt'
                            : 'Bật để khi kéo dự án vào cột này sẽ nhảy sang cột Lắp đặt'}
                        >
                          → LĐ
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleInstallTabColumn(s)}
                        className={pillBtn(onInstallCol, 'bg-amber-100 text-amber-900 border-amber-300')}
                        title={onInstallCol ? 'Bỏ đánh dấu cột Lắp đặt' : 'Đánh dấu là cột Lắp đặt'}
                      >
                        Cột LĐ
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleActive(s)}
                    className={pillBtn(!s.is_active, 'bg-orange-100 text-orange-800 border-orange-300')}
                    title={s.is_active ? 'Ẩn cột trên Kanban' : 'Hiện lại trên Kanban'}
                  >
                    <EyeOff className="h-3 w-3" /> {s.is_active ? 'Ẩn' : 'Hiện'}
                  </button>
                  <button
                    type="button"
                    onClick={() => requestEdit(s)}
                    className="h-6 px-1.5 rounded-md text-[9px] font-semibold flex items-center gap-0.5 cursor-pointer border bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                    title="Sửa giai đoạn"
                  >
                    <Pencil className="h-3 w-3" /> Sửa
                  </button>
                  {!isIntake && (
                    <button
                      type="button"
                      onClick={() => del(s.id, s.bucket_slug)}
                      className="h-6 px-1.5 rounded-md text-[9px] font-semibold flex items-center gap-0.5 cursor-pointer border bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                      title="Xóa giai đoạn"
                    >
                      <Trash2 className="h-3 w-3" /> Xóa
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {renderStageForm()}
      </div>
    );
  };

  return (
    <div className="min-h-full bg-white">
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Settings className="w-6 h-6 text-orange-600 shrink-0" strokeWidth={1.75} />
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Cài đặt Pipeline Lắp đặt</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Quản lý một pipeline Lắp đặt — khớp Kanban dashboard VC
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/vc/task-templates"
              className="h-8 px-3 text-xs font-medium text-orange-700 hover:text-orange-900 border border-orange-200 rounded-lg bg-white inline-flex items-center gap-1.5"
            >
              <ListChecks className="h-3.5 w-3.5" /> Bộ mẫu nhiệm vụ
            </Link>
            <Link
              to="/vc/dashboard"
              className="h-8 px-3 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg bg-white inline-flex items-center"
            >
              ← Dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-orange-200 bg-orange-50/30 px-4 py-3 flex flex-wrap gap-3 items-end shadow-sm">
          <label className="flex flex-col gap-1 text-[10px] text-orange-800 min-w-[220px] flex-1">
            <span className="font-semibold uppercase tracking-wide flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" /> Công ty
            </span>
            {isAdmin ? (
              <select
                className="rounded-lg px-2.5 py-1.5 text-xs border border-orange-200 bg-white"
                value={settingsCompanyId}
                onChange={(e) => {
                  setSettingsCompanyId(e.target.value);
                  setAdding(false);
                  setEditId(null);
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name || c.id}</option>
                ))}
              </select>
            ) : (
              <p className="rounded-lg px-2.5 py-1.5 text-xs bg-white border border-orange-100 text-gray-800">
                {settingsCompanyLabel || 'Theo tài khoản'}
              </p>
            )}
          </label>
          <button
            type="button"
            onClick={() => load({ silent: true })}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 cursor-pointer"
            title="Tải lại"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {SETTINGS_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === id
                  ? 'border-orange-600 text-orange-700 bg-orange-50/50 rounded-t-lg'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {!settingsCompanyId ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            Chọn <strong>Công ty</strong> phía trên.
          </div>
        ) : activeTab === 'handover' ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4 max-w-3xl">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <UserCircle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Bàn giao Sản xuất → Lắp đặt</h2>
                  <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">
                    Khi dự án chuyển từ SX sang VC, hệ thống gán người phụ trách VC và người lắp đặt.
                    Riêng người bấm xác nhận trên thẻ bàn giao cấu hình ở ô «Người xác nhận bàn giao VC/LĐ».
                  </p>
                </div>
              </div>
              <Link
                to="/sx/pipeline-settings"
                className="text-[11px] font-medium text-orange-700 hover:text-orange-900 border border-orange-200 rounded-lg px-2.5 py-1.5 bg-white shrink-0"
              >
                Cột bàn giao SX →
              </Link>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-900">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>
                Không thay đổi phụ trách CRM / Sản xuất — chỉ bổ sung phụ trách VC và LĐ trên dự án.
              </p>
            </div>
            {handoverLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải nhân sự…
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-orange-700 uppercase tracking-wide flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Người phụ trách VC
                    </span>
                    <select
                      value={vcResponsibleId}
                      onChange={(e) => setVcResponsibleId(e.target.value)}
                      className="h-9 px-2 border border-orange-200 rounded-lg text-sm bg-white"
                    >
                      <option value="">— Chưa chọn —</option>
                      {handoverUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                      <Wrench className="h-3 w-3" /> Người lắp đặt (LĐ)
                    </span>
                    <select
                      value={ldResponsibleId}
                      onChange={(e) => setLdResponsibleId(e.target.value)}
                      className="h-9 px-2 border border-amber-200 rounded-lg text-sm bg-white"
                    >
                      <option value="">— Chưa chọn —</option>
                      {handoverUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Người xác nhận bàn giao VC/LĐ
                    </span>
                    <select
                      value={vcConfirmUserId}
                      onChange={(e) => setVcConfirmUserId(e.target.value)}
                      className="h-9 px-2 border border-emerald-200 rounded-lg text-sm bg-white max-w-md"
                    >
                      <option value="">— Dùng người phụ trách VC —</option>
                      {handoverUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-gray-500">
                      Người được bấm «Xác nhận» phía VC/LĐ trên thẻ bàn giao. Để trống thì dùng Người phụ trách VC.
                    </span>
                  </label>
                </div>
                {handoverUsers.length === 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Chưa có nhân viên VC/LĐ thuộc công ty này.
                  </p>
                )}
                <button
                  type="button"
                  disabled={handoverSaving}
                  onClick={() => saveHandoverSettings()}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50 cursor-pointer"
                >
                  {handoverSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu cấu hình bàn giao
                </button>
              </>
            )}
          </div>
        ) : loading ? (
          <div className="text-center py-16 text-gray-400 text-xs flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            Đang tải giai đoạn…
          </div>
        ) : (
          renderPipelinePanel()
        )}
      </div>
    </div>
  );
}
