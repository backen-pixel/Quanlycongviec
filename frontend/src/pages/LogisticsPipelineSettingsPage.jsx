import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, CheckCircle2, ChevronRight, Clock, EyeOff, GripVertical, Info, Layers, ListChecks, Loader2,
  Pencil, Plus, RefreshCw, Save, Settings, Trash2, Truck, UserCircle, Wrench,
} from 'lucide-react';
import { VC_DASHBOARD_KPI_TICKS } from '../lib/vcPipelineKpi';
import { gomCotTheoNhom, nhanCotLon, khoaCotLonTuNhan } from '../lib/sxGopCot';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { isInstallVcStage } from '../lib/managementDashboardUtils';

const INTAKE = 'delivery_pending';
const LS_VC_PIPE_COMPANY = 'vc_pipeline_settings_company_id';
const COLORS = ['#f97316', '#ea580c', '#d97706', '#fb923c', '#0f766e', '#3B82F6', '#8B5CF6', '#10B981'];
const ICONS = ['📦', '🚚', '🔧', '🤝', '📋', '✅', '🎯', '⏳'];

const SETTINGS_TABS = [
  { id: 'gop', label: 'Cột chính', Icon: Layers },
  { id: 'stages', label: 'Cột nhỏ', Icon: ListChecks },
  { id: 'handover', label: 'Bàn giao SX→VC', Icon: UserCircle },
];

const VC_COT_LON_GOI_Y = ['Giao hàng', 'Lắp đặt', 'Bảo hành', 'Hoàn thành'];

function FormThemCotNho({ mo, ten, setTen, busy, onMo, onHuy, onSubmit }) {
  if (!mo) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onMo(); }}
        className="w-full inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-violet-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 cursor-pointer"
      >
        <Plus className="h-3 w-3" /> Thêm cột nhỏ
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); onSubmit(); }}
      className="flex items-center gap-1"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        value={ten}
        onChange={(e) => setTen(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onHuy(); }
        }}
        placeholder="Tên cột nhỏ"
        className="min-w-0 flex-1 h-7 rounded-md border border-violet-300 bg-white px-1.5 text-[12px]"
      />
      <button
        type="submit"
        disabled={busy || !String(ten || '').trim()}
        className="h-7 shrink-0 rounded-md bg-violet-600 px-2 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer inline-flex items-center"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Thêm'}
      </button>
    </form>
  );
}

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
  if (s.is_temp_install_staging) {
    badges.push({ key: 'temp', cls: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200', text: '🔧 Lắp đặt tạm' });
  }
  if (s.clears_deadline) {
    badges.push({ key: 'no-dl', cls: 'bg-slate-100 text-slate-700 border-slate-300', text: 'Tắt hạn' });
  }
  if (s.dashboard_kpi === 'shipping') {
    badges.push({ key: 'kpi-ship', cls: 'bg-orange-50 text-orange-800 border-orange-200', text: '🚚 Đang VC' });
  }
  if (s.dashboard_kpi === 'installing') {
    badges.push({ key: 'kpi-ins', cls: 'bg-amber-50 text-amber-800 border-amber-200', text: '🔧 Đang LĐ' });
  }
  if (s.dashboard_kpi === 'warranty') {
    badges.push({ key: 'kpi-wh', cls: 'bg-teal-50 text-teal-800 border-teal-200', text: '🛡 BH' });
  }
  if (s.dashboard_kpi === 'completed') {
    badges.push({ key: 'kpi-done', cls: 'bg-green-50 text-green-800 border-green-200', text: '✅ Xong' });
  }
  if (s.progress_percent != null && s.progress_percent !== '') {
    badges.push({ key: 'pct', cls: 'bg-violet-50 text-violet-700 border-violet-200', text: `${s.progress_percent}%` });
  }
  if (String(s.group_key || '').trim()) {
    badges.push({
      key: 'gop',
      cls: 'bg-violet-100 text-violet-800 border-violet-300',
      text: `Cột chính · ${nhanCotLon(s.group_key) || s.group_key}`,
    });
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
  const [activeTab, setActiveTab] = useState('gop');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [gopThemNhoKey, setGopThemNhoKey] = useState('');
  const [gopThemNhoTen, setGopThemNhoTen] = useState('');
  const [gopThemNhoBusy, setGopThemNhoBusy] = useState(false);
  const [gopThemTen, setGopThemTen] = useState('');
  const [gopOverKey, setGopOverKey] = useState(null);
  const [gopOverNhoId, setGopOverNhoId] = useState(null);
  const [gopOverNhoViTri, setGopOverNhoViTri] = useState('truoc');
  const [gopDragKey, setGopDragKey] = useState(null);
  const [keoCotNhoId, setKeoCotNhoId] = useState(null);
  const keoPayloadRef = useRef(null);
  const vuaKeoRef = useRef(0);
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
    is_temp_install_staging: false,
    clears_deadline: false,
    dashboard_kpi: '',
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
      is_temp_install_staging: false,
      clears_deadline: false,
      dashboard_kpi: '',
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
      is_temp_install_staging: !!stage.is_temp_install_staging,
      clears_deadline: !!stage.clears_deadline,
      dashboard_kpi: stage.dashboard_kpi || '',
    });
  };

  const patchStageLocal = (id, patch) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const saveStageFlags = async (stage, patch) => {
    const rollback = {};
    for (const k of Object.keys(patch)) rollback[k] = stage[k];
    patchStageLocal(stage.id, patch);
    try {
      const { data } = await api.put(`/logistics/pipeline-stages/${stage.id}`, patch);
      if (data && typeof data === 'object') {
        const synced = {};
        for (const k of Object.keys(patch)) {
          if (data[k] !== undefined) synced[k] = data[k];
        }
        if (Object.keys(synced).length) patchStageLocal(stage.id, synced);
      }
    } catch (e) {
      patchStageLocal(stage.id, rollback);
      throw e;
    }
    return true;
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
        is_temp_install_staging: !!form.is_temp_install_staging,
        clears_deadline: !!form.clears_deadline,
        dashboard_kpi: form.dashboard_kpi || null,
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
        is_temp_install_staging: intakeRow ? false : !!form.is_temp_install_staging,
        clears_deadline: intakeRow ? false : !!form.clears_deadline,
        dashboard_kpi: intakeRow ? null : (form.dashboard_kpi || null),
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
      await saveStageFlags(stage, { is_active: stage.is_active === false });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật');
    }
  };

  const toggleInstallTabColumn = async (stage) => {
    const isOn = String(stage.bucket_slug || '').toLowerCase().includes('install')
      || isInstallVcStage(stage);
    try {
      await saveStageFlags(stage, {
        bucket_slug: isOn ? null : 'installation',
        is_handover_to_install: false,
      });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật cột Lắp đặt');
    }
  };

  const toggleTempInstallStaging = async (stage) => {
    if (stage.bucket_slug === INTAKE) {
      return alert('Cột tiếp nhận là nơi dự án vào khi bàn giao thật — không dùng làm cột lắp đặt tạm.');
    }
    try {
      await saveStageFlags(stage, { is_temp_install_staging: !stage.is_temp_install_staging });
      if (!stage.is_temp_install_staging) {
        setStages((prev) => prev.map((s) => (
          String(s.id) === String(stage.id) ? s : { ...s, is_temp_install_staging: false }
        )));
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật cột lắp đặt tạm');
    }
  };

  const toggleHandoverToInstall = async (stage) => {
    if (stage.bucket_slug === INTAKE) return;
    if (isInstallVcStage(stage)) {
      return alert('Cột Lắp đặt không cần cờ «Chuyển LĐ» — chỉ gắn trên cột trước Lắp đặt.');
    }
    try {
      await saveStageFlags(stage, { is_handover_to_install: !stage.is_handover_to_install });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật chuyển LĐ');
    }
  };

  const toggleClearsDeadlineColumn = async (stage) => {
    try {
      await saveStageFlags(stage, { clears_deadline: !stage.clears_deadline });
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Lỗi';
      alert(msg.includes('clears_deadline') || msg.includes('631')
        ? 'Chưa chạy migration 631 (cột Tắt hạn).'
        : msg);
    }
  };

  const toggleDashboardKpiColumn = async (stage, key) => {
    try {
      const next = stage.dashboard_kpi === key ? null : key;
      await saveStageFlags(stage, { dashboard_kpi: next });
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Lỗi';
      alert(msg.includes('dashboard_kpi') || msg.includes('631')
        ? 'Chưa chạy migration 631 (cột KPI Dashboard).'
        : msg);
    }
  };

  const persistStageOrderPatch = async (patch) => {
    if (reorderBusy || !patch.length) return;
    const prevStages = stages;
    const byId = new Map(patch.map((p) => [String(p.id), p]));
    setReorderBusy(true);
    setStages((prev) => prev.map((s) => {
      const hit = byId.get(String(s.id));
      if (!hit) return s;
      return {
        ...s,
        ...(hit.order_index != null && hit.order_index !== '' ? { order_index: hit.order_index } : {}),
        ...(hit.group_sort !== undefined ? { group_sort: hit.group_sort } : {}),
      };
    }));
    try {
      await api.put('/logistics/pipeline-stages-reorder', { stages: patch });
    } catch (err) {
      setStages(prevStages);
      alert('Lỗi sắp xếp: ' + (err.response?.data?.error || err.message));
    } finally {
      setReorderBusy(false);
    }
  };

  const persistStagesReorder = async (newList) => {
    await persistStageOrderPatch(newList.map((s, i) => ({ id: s.id, order_index: i + 1 })));
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
          <label className="flex items-start gap-2 text-[11px] cursor-pointer p-2.5 rounded-lg bg-fuchsia-50 border border-fuchsia-200">
            <input
              type="checkbox"
              checked={!!form.is_temp_install_staging}
              onChange={(e) => setForm((f) => ({ ...f, is_temp_install_staging: e.target.checked }))}
              className="rounded border-gray-300 mt-0.5"
            />
            <span>
              <span className="font-semibold text-fuchsia-900">Nơi để dự án lắp đặt tạm</span>
              <span className="block text-[10px] text-fuchsia-700 leading-snug mt-0.5">
                Sale setup kế hoạch SX & VC/LĐ (chọn công ty VC + ngày lấy hàng / lắp) → dự án vào cột này ngay
                để bên VC/LĐ thấy trước. Xưởng hoàn thành và bàn giao thật thì dự án chuyển sang cột tiếp nhận,
                không tạo dự án mới. Mỗi công ty chỉ có một cột tạm.
              </span>
            </span>
          </label>
        )}
        {!editingIntake && (
          <div className="space-y-1.5 p-2.5 rounded-lg bg-orange-50 border border-orange-200">
            <p className="text-[10px] font-semibold text-orange-900">Ô Dashboard</p>
            <label className="flex items-center gap-2 text-[11px] cursor-pointer">
              <input
                type="radio"
                name="dashboard_kpi"
                checked={!form.dashboard_kpi}
                onChange={() => setForm((f) => ({ ...f, dashboard_kpi: '' }))}
                className="border-gray-300"
              />
              Tự suy
            </label>
            {VC_DASHBOARD_KPI_TICKS.map((t) => (
              <label key={t.key} className="flex items-center gap-2 text-[11px] cursor-pointer">
                <input
                  type="radio"
                  name="dashboard_kpi"
                  checked={form.dashboard_kpi === t.key}
                  onChange={() => setForm((f) => ({ ...f, dashboard_kpi: t.key }))}
                  className="border-gray-300"
                />
                {t.label}
              </label>
            ))}
            <label className="flex items-center gap-2 text-[11px] cursor-pointer pt-1 border-t border-orange-100">
              <input
                type="checkbox"
                checked={!!form.clears_deadline}
                onChange={(e) => setForm((f) => ({ ...f, clears_deadline: e.target.checked }))}
                className="rounded border-gray-300"
              />
              Tắt hạn — cột không đếm quá hạn
            </label>
          </div>
        )}
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

  const cotLonDaCo = useMemo(() => (
    gomCotTheoNhom(sorted)
      .filter((g) => !g.riengLe)
      .map((g) => ({ key: g.key, ds: g.cotNho }))
  ), [sorted]);

  const cotNhoChuaGan = useMemo(
    () => sorted.filter((st) => st.bucket_slug !== INTAKE && !String(st.group_key || '').trim()),
    [sorted],
  );

  const xayDanhSachCotNhoTheoCotChinh = (allStages, groups) => {
    const used = new Set();
    const out = [];
    const take = (st) => {
      const id = String(st?.id || '');
      if (!id || used.has(id)) return;
      used.add(id);
      out.push(st);
    };
    const byOrder = (a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0);
    [...(allStages || [])].filter((s) => s.bucket_slug === INTAKE).sort(byOrder).forEach(take);
    (groups || []).forEach((g) => (g.ds || []).forEach(take));
    [...(allStages || [])].filter((s) => !used.has(String(s.id))).sort(byOrder).forEach(take);
    return out;
  };

  const datCotLon = async (stageId, ten) => {
    const nhap = String(ten || '').trim();
    const nhom = cotLonDaCo.find((g) => g.key === nhap || (nhanCotLon(g.key) || g.key) === nhap);
    const moi = nhom ? nhom.key : khoaCotLonTuNhan(nhap);
    const sorts = nhom
      ? nhom.ds.map((x) => Number(x.group_sort)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const group_sort = sorts.length ? Math.min(...sorts) : null;
    setStages((prev) => prev.map((x) => (
      String(x.id) === String(stageId)
        ? { ...x, group_key: moi || null, group_sort: moi ? group_sort : null }
        : x
    )));
    try {
      await api.put(`/logistics/pipeline-stages/${stageId}`, {
        group_key: moi || null,
        group_sort: moi ? group_sort : null,
      });
    } catch (e) {
      alert(e?.response?.data?.error || 'Không lưu được cột lớn');
      await load({ silent: true });
    }
  };

  const persistCotLonOrder = async (nextGroups) => {
    if (reorderBusy) return;
    const newList = xayDanhSachCotNhoTheoCotChinh(stages, nextGroups);
    const byId = new Map();
    newList.forEach((s, i) => byId.set(String(s.id), { id: s.id, order_index: i + 1 }));
    nextGroups.forEach((g, i) => {
      (g.ds || []).forEach((st) => {
        const cur = byId.get(String(st.id)) || { id: st.id };
        byId.set(String(st.id), { ...cur, group_sort: i + 1 });
      });
    });
    await persistStageOrderPatch([...byId.values()]);
  };

  const luuTenCotLon = async (key, ds, tenMoi) => {
    const cu = nhanCotLon(key) || key;
    const moi = String(tenMoi || '').trim();
    if (!moi || moi === key || moi === cu) return;
    try {
      await Promise.all(ds.map((st) => api.put(`/logistics/pipeline-stages/${st.id}`, { group_key: moi })));
      await load({ silent: true });
    } catch (e) {
      alert(e?.response?.data?.error || 'Không đổi được tên cột lớn');
      await load({ silent: true });
    }
  };

  const boCotLon = async (key, ds) => {
    const ten = nhanCotLon(key) || key;
    if (!window.confirm(`Tách ${ds.length} cột nhỏ ra khỏi «${ten}»?\n\nỞ chế độ Gộp cột trên Kanban, chúng sẽ hiện thành từng cột riêng.`)) return;
    try {
      await Promise.all(ds.map((st) => api.put(`/logistics/pipeline-stages/${st.id}`, { group_key: null })));
      await load({ silent: true });
    } catch (e) {
      alert(e?.response?.data?.error || 'Không tách được cột lớn');
    }
  };

  const taoCotNhoTrongCotLon = async (tenCotLon) => {
    const ten = String(gopThemNhoTen || '').trim();
    if (!ten) {
      alert('Nhập tên cột nhỏ');
      return;
    }
    if (!settingsCompanyId) {
      alert('Chọn công ty trước');
      return;
    }
    const nhom = cotLonDaCo.find((g) => g.key === tenCotLon || (nhanCotLon(g.key) || g.key) === tenCotLon);
    const moi = nhom ? nhom.key : khoaCotLonTuNhan(tenCotLon);
    let group_sort;
    if (nhom) {
      const sorts = nhom.ds.map((x) => Number(x.group_sort)).filter((n) => Number.isFinite(n) && n > 0);
      group_sort = sorts.length ? Math.min(...sorts) : cotLonDaCo.length + 1;
    } else {
      const sorts = cotLonDaCo.flatMap((g) => (
        g.ds.map((x) => Number(x.group_sort)).filter((n) => Number.isFinite(n) && n > 0)
      ));
      group_sort = (sorts.length ? Math.max(...sorts) : cotLonDaCo.length) + 1;
    }
    const mau = nhom?.ds?.[0];
    setGopThemNhoBusy(true);
    try {
      await api.post('/logistics/pipeline-stages', {
        name: ten,
        color: mau?.color || COLORS[stages.length % COLORS.length],
        icon: ICONS[stages.length % ICONS.length],
        company_id: settingsCompanyId,
        group_key: moi,
        group_sort,
        is_active: true,
      });
      setGopThemNhoTen('');
      setGopThemNhoKey('');
      if (gopThemTen && moi === khoaCotLonTuNhan(gopThemTen)) setGopThemTen('');
      await load({ silent: true });
    } catch (e) {
      alert(e?.response?.data?.error || 'Không tạo được cột nhỏ');
    } finally {
      setGopThemNhoBusy(false);
    }
  };

  const docKeoPayload = (e) => {
    let raw = '';
    try { raw = String(e?.dataTransfer?.getData('text/plain') || ''); } catch { raw = ''; }
    if (raw.startsWith('nho:')) return { loai: 'nho', id: raw.slice(4) };
    if (raw.startsWith('lon:')) return { loai: 'lon', id: raw.slice(4) };
    const fromRef = keoPayloadRef.current;
    if (fromRef?.loai && fromRef.id) return fromRef;
    if (!raw) return null;
    const laCotNho = sorted.some((x) => String(x.id) === String(raw));
    return { loai: laCotNho ? 'nho' : 'lon', id: raw };
  };

  const batDauKeoCotNho = (e, st) => {
    if (st.bucket_slug === INTAKE) {
      e.preventDefault();
      return;
    }
    const payload = { loai: 'nho', id: String(st.id) };
    keoPayloadRef.current = payload;
    vuaKeoRef.current = false;
    setKeoCotNhoId(String(st.id));
    setGopDragKey(null);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', `nho:${st.id}`); } catch { /* ignore */ }
  };

  const ketThucKeo = () => {
    vuaKeoRef.current = Date.now();
    window.setTimeout(() => {
      keoPayloadRef.current = null;
      setKeoCotNhoId(null);
      setGopDragKey(null);
      setGopOverKey(null);
      setGopOverNhoId(null);
    }, 0);
  };

  const viTriThaCotNho = (e) => {
    const el = e.currentTarget;
    if (!el?.getBoundingClientRect) return 'truoc';
    const rect = el.getBoundingClientRect();
    return (e.clientY - rect.top) < rect.height / 2 ? 'truoc' : 'sau';
  };

  const choPhepTha = (e, tenCotLon) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (tenCotLon && gopOverKey !== tenCotLon) setGopOverKey(tenCotLon);
  };

  const choPhepThaCotNho = (e, st) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (String(keoCotNhoId) === String(st.id)) return;
    const viTri = viTriThaCotNho(e);
    if (gopOverNhoId !== st.id) setGopOverNhoId(st.id);
    if (gopOverNhoViTri !== viTri) setGopOverNhoViTri(viTri);
    const key = String(st.group_key || '').trim();
    if (key && gopOverKey !== key) setGopOverKey(key);
  };

  const datCotNhoVaoHang = async (sourceId, targetSt, viTri) => {
    if (reorderBusy) return;
    const srcId = String(sourceId || '');
    const targetKey = String(targetSt?.group_key || '').trim();
    if (!srcId || !targetKey || srcId === String(targetSt.id)) return;

    const list = [...stages].sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    const moved = list.find((s) => String(s.id) === srcId);
    if (!moved || moved.bucket_slug === INTAKE || targetSt.bucket_slug === INTAKE) return;

    const sourceKey = String(moved.group_key || '').trim();
    const members = list.filter((s) => (
      String(s.group_key || '').trim() === targetKey && String(s.id) !== srcId
    ));
    const tIdx = members.findIndex((s) => String(s.id) === String(targetSt.id));
    const insertAt = tIdx < 0 ? members.length : (viTri === 'sau' ? tIdx + 1 : tIdx);
    members.splice(insertAt, 0, { ...moved, group_key: targetKey });

    const groups = cotLonDaCo.map((g) => {
      if (g.key === targetKey) return { ...g, ds: members };
      if (sourceKey && g.key === sourceKey) {
        return { ...g, ds: g.ds.filter((s) => String(s.id) !== srcId) };
      }
      return g;
    });
    const stagesForFlatten = sourceKey === targetKey
      ? stages
      : stages.map((s) => (String(s.id) === srcId ? { ...s, group_key: targetKey } : s));
    if (sourceKey !== targetKey) await datCotLon(srcId, targetKey);
    await persistStagesReorder(xayDanhSachCotNhoTheoCotChinh(stagesForFlatten, groups));
  };

  const thaVaoCotNho = async (e, targetSt) => {
    e.preventDefault();
    e.stopPropagation();
    const viTri = viTriThaCotNho(e);
    const payload = docKeoPayload(e);
    setGopOverNhoId(null);
    setGopOverKey(null);
    if (!payload || payload.loai !== 'nho' || !targetSt) return;
    keoPayloadRef.current = null;
    setKeoCotNhoId(null);
    vuaKeoRef.current = Date.now();
    await datCotNhoVaoHang(payload.id, targetSt, viTri);
  };

  const thaVaoCotChinh = async (e, tenCotLon) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = docKeoPayload(e);
    setGopOverKey(null);
    if (!payload || !tenCotLon) return;
    if (payload.loai === 'lon') {
      const fromKey = payload.id;
      keoPayloadRef.current = null;
      setGopDragKey(null);
      if (fromKey && fromKey !== tenCotLon) {
        const list = [...cotLonDaCo];
        const fromIdx = list.findIndex((x) => x.key === fromKey);
        const toIdx = list.findIndex((x) => x.key === tenCotLon);
        if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
          const next = [...list];
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          await persistCotLonOrder(next);
        }
      }
      return;
    }
    const id = payload.id;
    keoPayloadRef.current = null;
    setKeoCotNhoId(null);
    vuaKeoRef.current = Date.now();
    if (!id) return;
    const st = sorted.find((x) => String(x.id) === String(id));
    if (!st || st.bucket_slug === INTAKE) return;
    if (String(st.group_key || '').trim() === String(tenCotLon)) return;
    await datCotLon(id, tenCotLon);
  };

  const bamSauKhiKeo = (fn) => {
    const t = Number(vuaKeoRef.current) || 0;
    if (t && Date.now() - t < 400) return;
    fn();
  };

  const renderGopPanel = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-800 inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Cột chính trên Dashboard VC/LĐ
          </p>
          <p className="text-[12px] text-gray-600">
            Mỗi thẻ = một giai đoạn nối tiếp. Cột nhỏ bên trong chạy song song.
            Kéo cột nhỏ lên xuống trong thẻ để đổi thứ tự. Kéo sang thẻ khác để gán.
          </p>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 pt-1 snap-x">
        {cotLonDaCo.map((g, gi) => {
          const tenHien = nhanCotLon(g.key) || g.key;
          const dangKeoNho = Boolean(keoCotNhoId || keoPayloadRef.current?.loai === 'nho');
          const isOver = (gopOverKey === g.key && ((gopDragKey && gopDragKey !== g.key) || dangKeoNho));
          return (
            <div
              key={g.key}
              onDragOver={(e) => choPhepTha(e, g.key)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget) && gopOverKey === g.key) {
                  setGopOverKey(null);
                }
              }}
              onDrop={(e) => thaVaoCotChinh(e, g.key)}
              className={`snap-start w-[240px] shrink-0 rounded-xl border bg-white shadow-sm flex flex-col max-h-[28rem] ${
                isOver ? 'border-violet-500 ring-2 ring-violet-200' : 'border-violet-200'
              } ${gopDragKey === g.key ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-1 px-2 pt-2 pb-1">
                <span
                  draggable={!reorderBusy}
                  onDragStart={(e) => {
                    keoPayloadRef.current = { loai: 'lon', id: g.key };
                    setGopDragKey(g.key);
                    setKeoCotNhoId(null);
                    e.dataTransfer.effectAllowed = 'move';
                    try { e.dataTransfer.setData('text/plain', `lon:${g.key}`); } catch { /* ignore */ }
                  }}
                  onDragEnd={ketThucKeo}
                  title="Kéo để đổi thứ tự cột chính"
                  className="inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-violet-400 hover:bg-violet-50 active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">
                  {gi + 1}
                </span>
                <input
                  defaultValue={tenHien}
                  key={`${g.key}:${tenHien}`}
                  onBlur={(e) => { luuTenCotLon(g.key, g.ds, e.target.value); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  className="min-w-0 flex-1 rounded-md border border-violet-200 bg-violet-50/50 px-1.5 h-7 text-[13px] font-bold text-violet-950"
                  title="Tên cột chính — Enter để lưu"
                />
              </div>
              <p className="px-3 text-[10px] text-violet-500">
                {g.ds.length} cột nhỏ{g.ds.length > 1 ? ' · song song' : ''}
              </p>
              <div
                className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1 min-h-[6rem]"
                onDragOver={(e) => choPhepTha(e, g.key)}
                onDrop={(e) => thaVaoCotChinh(e, g.key)}
              >
                {g.ds.map((st) => {
                  const dangKeoDong = String(keoCotNhoId) === String(st.id);
                  const dangThaDong = String(gopOverNhoId) === String(st.id) && !dangKeoDong;
                  return (
                    <div
                      key={st.id}
                      onDragOver={(e) => choPhepThaCotNho(e, st)}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget) && String(gopOverNhoId) === String(st.id)) {
                          setGopOverNhoId(null);
                        }
                      }}
                      onDrop={(e) => thaVaoCotNho(e, st)}
                      className={`flex items-center gap-0.5 rounded-md border ${
                        dangKeoDong
                          ? 'border-violet-400 bg-violet-100 opacity-70'
                          : dangThaDong
                            ? `border-violet-400 bg-violet-50 ${gopOverNhoViTri === 'sau' ? 'border-b-[3px] border-b-violet-600' : 'border-t-[3px] border-t-violet-600'}`
                            : 'border-gray-100 bg-slate-50 hover:border-violet-300 hover:bg-violet-50'
                      }`}
                    >
                      <button
                        type="button"
                        draggable={!reorderBusy}
                        onDragStart={(e) => batDauKeoCotNho(e, st)}
                        onDragEnd={ketThucKeo}
                        onClick={() => bamSauKhiKeo(() => requestEdit(st))}
                        className="min-w-0 flex-1 text-left px-2 py-1.5 text-[12px] font-medium text-gray-800 cursor-grab active:cursor-grabbing"
                        title="Kéo lên xuống để đổi thứ tự, hoặc sang cột chính khác"
                      >
                        <span className="mr-1">{st.icon || '📋'}</span>
                        {st.name}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); requestEdit(st); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="shrink-0 mr-0.5 h-7 px-1.5 rounded text-[10px] font-semibold text-violet-700 hover:bg-white inline-flex items-center gap-0.5"
                        title="Sửa cột nhỏ"
                      >
                        <Pencil className="h-3 w-3" />
                        Sửa
                      </button>
                    </div>
                  );
                })}
                {g.ds.length === 0 && gopThemNhoKey !== g.key && (
                  <p className="text-[11px] text-gray-400 px-1 py-2 text-center pointer-events-none">Kéo cột nhỏ vào đây</p>
                )}
                <FormThemCotNho
                  mo={gopThemNhoKey === g.key}
                  ten={gopThemNhoTen}
                  setTen={setGopThemNhoTen}
                  busy={gopThemNhoBusy}
                  onMo={() => { setGopThemNhoKey(g.key); setGopThemNhoTen(''); }}
                  onHuy={() => { setGopThemNhoKey(''); setGopThemNhoTen(''); }}
                  onSubmit={() => taoCotNhoTrongCotLon(g.key)}
                />
              </div>
              <div className="border-t border-violet-100 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => boCotLon(g.key, g.ds)}
                  className="h-7 w-full rounded px-1.5 text-[11px] text-rose-500 hover:bg-rose-50 cursor-pointer"
                >
                  Tách
                </button>
              </div>
            </div>
          );
        })}

        <div
          onDragOver={(e) => choPhepTha(e, '__moi__')}
          onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const ten = String(gopThemTen || '').trim() || window.prompt('Tên cột lớn mới:', '');
            if (!ten) return;
            const payload = docKeoPayload(e);
            setGopOverKey(null);
            if (payload?.loai === 'nho' && payload.id) {
              await datCotLon(payload.id, ten);
              setGopThemTen('');
            }
          }}
          className={`snap-start w-[220px] shrink-0 rounded-xl border-2 border-dashed px-3 py-3 flex flex-col items-stretch gap-2 ${
            gopOverKey === '__moi__' ? 'border-violet-500 bg-violet-100/70' : 'border-violet-300 bg-violet-50/40'
          }`}
        >
          <p className="text-[13px] font-bold text-violet-800 inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> Cột lớn mới
          </p>
          <input
            value={gopThemTen}
            onChange={(e) => setGopThemTen(e.target.value)}
            placeholder="Tên cột lớn"
            className="h-8 rounded-md border border-violet-200 bg-white px-2 text-[12px]"
          />
          <div className="flex flex-wrap gap-1">
            {VC_COT_LON_GOI_Y.filter((t) => !cotLonDaCo.some((g) => (
              (nhanCotLon(g.key) || g.key) === t || g.key === khoaCotLonTuNhan(t)
            ))).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setGopThemTen(t)}
                className={`rounded-full border px-2 py-0.5 text-[10px] cursor-pointer ${
                  String(gopThemTen || '').trim() === t
                    ? 'border-violet-500 bg-violet-100 text-violet-900'
                    : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-violet-600 leading-snug">
            Kéo cột nhỏ vào đây, hoặc thêm cột nhỏ mới.
          </p>
          <FormThemCotNho
            mo={gopThemNhoKey === '__moi__'}
            ten={gopThemNhoTen}
            setTen={setGopThemNhoTen}
            busy={gopThemNhoBusy}
            onMo={() => { setGopThemNhoKey('__moi__'); setGopThemNhoTen(''); }}
            onHuy={() => { setGopThemNhoKey(''); setGopThemNhoTen(''); }}
            onSubmit={() => {
              const ten = String(gopThemTen || '').trim();
              if (!ten) {
                alert('Nhập tên cột lớn trước');
                return;
              }
              taoCotNhoTrongCotLon(ten);
            }}
          />
        </div>
      </div>

      {cotNhoChuaGan.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5">
            Cột nhỏ chưa gán — kéo vào một cột chính
          </p>
          <div className="flex flex-wrap gap-1.5">
            {cotNhoChuaGan.map((st) => (
              <button
                key={st.id}
                type="button"
                draggable={!reorderBusy}
                onDragStart={(e) => batDauKeoCotNho(e, st)}
                onDragEnd={ketThucKeo}
                onClick={() => bamSauKhiKeo(() => requestEdit(st))}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-800 cursor-grab hover:border-violet-300"
              >
                <span>{st.icon || '📋'}</span>
                {st.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {(adding || editId) && renderStageForm()}
    </div>
  );

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
                <p className="text-[10px] text-gray-400">{list.length} cột nhỏ · một luồng Kanban</p>
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
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[min(100%,22rem)] border-l border-gray-200 pl-1.5 ml-1">
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
                      <button
                        type="button"
                        onClick={() => toggleTempInstallStaging(s)}
                        className={pillBtn(!!s.is_temp_install_staging, 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300 ring-1 ring-fuchsia-200')}
                        title={s.is_temp_install_staging
                          ? 'Đang bật: dự án vào cột này ngay khi Sale setup kế hoạch SX & VC/LĐ (chưa bàn giao thật)'
                          : 'Bật để dự án nằm tạm ở cột này ngay khi Sale setup kế hoạch SX & VC/LĐ'}
                      >
                        LĐ tạm
                      </button>
                      {VC_DASHBOARD_KPI_TICKS.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => toggleDashboardKpiColumn(s, t.key)}
                          className={pillBtn(
                            s.dashboard_kpi === t.key,
                            t.key === 'completed'
                              ? 'bg-green-100 text-green-900 border-green-300'
                              : t.key === 'warranty'
                                ? 'bg-teal-100 text-teal-900 border-teal-300'
                                : t.key === 'installing'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-orange-100 text-orange-900 border-orange-300',
                          )}
                          title={t.title}
                        >
                          {t.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => toggleClearsDeadlineColumn(s)}
                        className={pillBtn(!!s.clears_deadline, 'bg-slate-200 text-slate-900 border-slate-400')}
                        title={s.clears_deadline
                          ? 'Đang tắt hạn: cột không đếm quá hạn VC/LĐ'
                          : 'Tắt hạn trên cột này — không hiện quá hạn'}
                      >
                        <Clock className="h-3 w-3" /> {s.clears_deadline ? 'Đã tắt hạn' : 'Tắt hạn'}
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
        ) : activeTab === 'gop' ? (
          renderGopPanel()
        ) : (
          renderPipelinePanel()
        )}
      </div>
    </div>
  );
}
