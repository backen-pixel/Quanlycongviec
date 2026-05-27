import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { Settings, Plus, Trash2, Save, ChevronRight, Loader2, Factory, Truck, Building2, ListChecks, Tags, Globe } from 'lucide-react';
import WorkshopTypeSettingsSection from '../components/WorkshopTypeSettingsSection';

const INTAKE = 'won_pending';
const LS_SX_PIPE_COMPANY = 'sx_pipeline_settings_company_id';
const LS_SX_PIPE_TYPE = 'sx_pipeline_settings_type_key';
const COLORS = ['#0f766e', '#14b8a6', '#5eead4', '#64748b', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981'];
const ICONS = ['🏭', '🚚', '🤝', '⏳', '📋', '✅', '🎯', '🔧', '📦'];
const GLOBAL_TYPE_KEY = 'global';

export default function ProductionPipelineSettingsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const [companies, setCompanies] = useState([]);
  const [settingsCompanyId, setSettingsCompanyId] = useState('');
  const [stages, setStages] = useState([]);
  const [workflowStages, setWorkflowStages] = useState([]);
  const [crmStages, setCrmStages] = useState([]);
  const [workshopTypes, setWorkshopTypes] = useState([]);
  const [selectedTypeKey, setSelectedTypeKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [typesLoading, setTypesLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedingDefault, setSeedingDefault] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: '', color: COLORS[0], icon: '📋', is_active: true,
    is_handover_to_logistics: false, crm_sync_type: null, crm_target_stage_id: '',
    progress_percent: '',
  });

  const load = useCallback(async () => {
    if (!settingsCompanyId || !selectedTypeKey) {
      setStages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const pipeParams = {
        all: 'true',
        company_id: settingsCompanyId,
        workshop_type_id: selectedTypeKey,
      };
      const [pipeRes, stRes, crmRes] = await Promise.all([
        api.get('/production/pipeline-stages', { params: pipeParams }),
        api.get('/stages').catch(() => api.get('/users/stages').catch(() => ({ data: { stages: [] } }))),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
      ]);
      setStages(pipeRes.data || []);
      setWorkflowStages(stRes.data?.stages || []);
      setCrmStages((crmRes.data || []).filter((s) => s.pipeline_type === 'deal' || !s.pipeline_type));
    } catch {
      setStages([]);
    }
    setLoading(false);
  }, [settingsCompanyId, selectedTypeKey]);

  useEffect(() => { load(); }, [load]);

  const loadWorkshopTypes = useCallback(async () => {
    if (!settingsCompanyId) {
      setWorkshopTypes([]);
      return;
    }
    setTypesLoading(true);
    try {
      const { data } = await api.get('/workshop/project-types', {
        params: { company_id: settingsCompanyId, module: 'production', all: 'true' },
      });
      setWorkshopTypes(Array.isArray(data) ? data : []);
    } catch {
      setWorkshopTypes([]);
    }
    setTypesLoading(false);
  }, [settingsCompanyId]);

  useEffect(() => { loadWorkshopTypes(); }, [loadWorkshopTypes]);

  // Khôi phục lựa chọn phân loại đã lưu (theo từng công ty).
  // Khi đổi công ty: reset về '' rồi đọc lại để tránh nhầm lẫn giữa công ty cũ/mới.
  useEffect(() => {
    if (!settingsCompanyId) {
      setSelectedTypeKey('');
      return;
    }
    let saved = '';
    try {
      saved = localStorage.getItem(`${LS_SX_PIPE_TYPE}:${settingsCompanyId}`) || '';
    } catch { /* ignore */ }
    setSelectedTypeKey(saved);
  }, [settingsCompanyId]);

  // Lưu lựa chọn phân loại theo company hiện tại
  useEffect(() => {
    if (!settingsCompanyId) return;
    try {
      if (selectedTypeKey) {
        localStorage.setItem(`${LS_SX_PIPE_TYPE}:${settingsCompanyId}`, selectedTypeKey);
      } else {
        localStorage.removeItem(`${LS_SX_PIPE_TYPE}:${settingsCompanyId}`);
      }
    } catch { /* ignore */ }
  }, [settingsCompanyId, selectedTypeKey]);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'production' } }).then((r) => {
      const list = r.data?.companies || r.data || [];
      const arr = Array.isArray(list) ? list : [];
      setCompanies(arr);
      if (isAdmin) {
        try {
          const s = localStorage.getItem(LS_SX_PIPE_COMPANY);
          if (s && arr.some((c) => String(c.id) === String(s))) {
            setSettingsCompanyId(s);
            return;
          }
        } catch { /* ignore */ }
        if (arr.length) setSettingsCompanyId(String(arr[0].id));
      } else if (user?.company_id) {
        setSettingsCompanyId(String(user.company_id));
      }
    }).catch(() => setCompanies([]));
  }, [isAdmin, user?.company_id]);

  useEffect(() => {
    if (!isAdmin || !settingsCompanyId) return;
    try {
      localStorage.setItem(LS_SX_PIPE_COMPANY, settingsCompanyId);
    } catch { /* ignore */ }
  }, [isAdmin, settingsCompanyId]);

  const settingsCompanyLabel = useMemo(() => {
    if (!settingsCompanyId) return '';
    const c = companies.find((x) => String(x.id) === String(settingsCompanyId));
    return c?.short_name || c?.name || settingsCompanyId;
  }, [companies, settingsCompanyId]);

  /**
   * Mọi cột pipeline xưởng (trừ cột intake «won_pending») đều map vào
   * workflow_stage có slug='production'. Người dùng không cần tự chọn.
   */
  const productionWorkflowStageId = useMemo(() => {
    const ws = (workflowStages || []).find((w) => String(w.slug || '').toLowerCase() === 'production');
    return ws?.id || '';
  }, [workflowStages]);

  const selectedTypeLabel = useMemo(() => {
    if (!selectedTypeKey) return '';
    if (selectedTypeKey === GLOBAL_TYPE_KEY) return 'Bộ chung (mọi loại)';
    const t = workshopTypes.find((x) => String(x.id) === String(selectedTypeKey));
    return t?.name || selectedTypeKey;
  }, [workshopTypes, selectedTypeKey]);

  const stepReady = settingsCompanyId && selectedTypeKey;

  /** Giá trị workshop_type_id để gửi lên BE khi insert/update cột pipeline. */
  const currentWorkshopTypeId = useMemo(() => {
    if (!selectedTypeKey || selectedTypeKey === GLOBAL_TYPE_KEY) return null;
    return selectedTypeKey;
  }, [selectedTypeKey]);

  const hasIntake = stages.some((s) => s.bucket_slug === INTAKE);

  const startAdd = () => {
    setAdding(true);
    setEditId(null);
    setForm({
      name: '', color: COLORS[stages.length % COLORS.length], icon: ICONS[stages.length % ICONS.length],
      is_active: true, is_handover_to_logistics: false,
      crm_sync_type: null, crm_target_stage_id: '',
      progress_percent: '',
    });
  };

  const startEdit = (stage) => {
    setEditId(stage.id);
    setAdding(false);
    setForm({
      name: stage.name,
      color: stage.color || '#0f766e',
      icon: stage.icon || '📋',
      is_active: stage.is_active !== false,
      is_handover_to_logistics: stage.is_handover_to_logistics || false,
      crm_sync_type: stage.crm_sync_type || null,
      crm_target_stage_id: stage.crm_target_stage_id || '',
      progress_percent: stage.progress_percent ?? '',
    });
  };

  const saveNew = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    if (!selectedTypeKey) return alert('Hãy chọn phân loại trước');
    try {
      await api.post('/production/pipeline-stages', {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon,
        progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
        workflow_stage_id: productionWorkflowStageId || null,
        is_active: form.is_active,
        is_handover_to_logistics: form.is_handover_to_logistics,
        crm_sync_type: form.crm_target_stage_id ? null : (form.crm_sync_type || null),
        crm_target_stage_id: form.crm_target_stage_id || null,
        company_id: settingsCompanyId,
        workshop_type_id: currentWorkshopTypeId,
      });
      setAdding(false);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi tạo cột');
    }
  };

  const saveEdit = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    try {
      const intakeRow = stages.find((s) => s.id === editId)?.bucket_slug === INTAKE;
      await api.put(`/production/pipeline-stages/${editId}`, {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon,
        progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
        workflow_stage_id: intakeRow ? null : (productionWorkflowStageId || null),
        is_active: form.is_active,
        is_handover_to_logistics: intakeRow ? false : form.is_handover_to_logistics,
        crm_sync_type: intakeRow ? null : (form.crm_target_stage_id ? null : (form.crm_sync_type || null)),
        crm_target_stage_id: intakeRow ? null : (form.crm_target_stage_id || null),
      });
      setEditId(null);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    }
  };

  const del = async (id, bucket) => {
    if (bucket === INTAKE) return alert('Không xóa cột deal thắng — chỉ ẩn');
    if (!confirm('Xóa cột này?')) return;
    try {
      await api.delete(`/production/pipeline-stages/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa');
    }
  };

  const toggleActive = async (stage) => {
    try {
      await api.put(`/production/pipeline-stages/${stage.id}`, { is_active: !stage.is_active });
      load();
    } catch {
      alert('Lỗi');
    }
  };

  const seedDefaultKitchenGlass = async () => {
    if (!settingsCompanyId) return alert('Hãy chọn công ty trước');
    if (!confirm('Tạo 2 phân loại «Tủ bếp» + «Cánh kính» và 22 cột pipeline mặc định cho công ty này? (Phần đã có sẽ bỏ qua)')) return;
    setSeedingDefault(true);
    try {
      const { data } = await api.post('/production/pipeline-stages/seed-default-kitchen-glass', {
        company_id: settingsCompanyId,
      });
      const parts = [];
      if (data?.types?.created > 0) parts.push(`+${data.types.created} phân loại mới`);
      if (data?.stages?.inserted > 0) parts.push(`+${data.stages.inserted} cột mới`);
      if (data?.stages?.skipped > 0) parts.push(`${data.stages.skipped} cột đã có`);
      alert(parts.length ? parts.join(' · ') : 'Đã đầy đủ — không thay đổi.');
      await loadWorkshopTypes();
      load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    } finally {
      setSeedingDefault(false);
    }
  };

  const seedSampleColumns = async () => {
    if (!selectedTypeKey) return alert('Hãy chọn phân loại trước');
    if (!confirm('Thêm 5 cột mẫu? Cột đã có sẽ bỏ qua.')) return;
    setSeeding(true);
    try {
      const { data } = await api.post('/production/pipeline-stages/seed-samples', {
        company_id: settingsCompanyId,
        workshop_type_id: currentWorkshopTypeId,
      });
      const parts = [];
      if (data.inserted > 0) parts.push(`+${data.inserted} cột mới`);
      if (data.skipped > 0) parts.push(`${data.skipped} cột đã có`);
      if (parts.length) alert(parts.join(' · '));
      load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    } finally {
      setSeeding(false);
    }
  };

  const moveStage = async (stage, dir) => {
    if (stage.bucket_slug === INTAKE) return; // Cột deal-thắng luôn đứng đầu
    const list = [...stages].sort((a, b) => a.order_index - b.order_index);
    const idx = list.findIndex((s) => s.id === stage.id);
    if (idx < 0 || (dir === -1 && idx === 0) || (dir === 1 && idx === list.length - 1)) return;
    // Không cho nhảy lên trước cột INTAKE
    if (dir === -1 && list[idx - 1]?.bucket_slug === INTAKE) return;
    const newList = [...list];
    [newList[idx], newList[idx + dir]] = [newList[idx + dir], newList[idx]];
    const reorder = newList.map((s, i) => ({ id: s.id, order_index: i + 1 }));
    try {
      await api.put('/production/pipeline-stages-reorder', { stages: reorder });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi sắp xếp');
    }
  };

  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
  const editingIntake = editId && sorted.find((s) => s.id === editId)?.bucket_slug === INTAKE;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Factory className="h-7 w-7 text-teal-600" />
          <h1 className="text-xl font-bold text-gray-900">Pipeline xưởng</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/sx/task-templates"
            className="text-sm font-medium text-teal-700 hover:text-teal-900 border border-teal-200 rounded-lg px-3 py-2 bg-white inline-flex items-center gap-1.5"
            title="Bộ mẫu nhiệm vụ"
          >
            <ListChecks className="h-4 w-4" /> Bộ mẫu nhiệm vụ
          </Link>
          <Link
            to="/sx/dashboard"
            className="text-sm font-medium text-teal-700 hover:text-teal-900 border border-teal-200 rounded-lg px-3 py-2 bg-white"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* Stepper: Công ty → Phân loại → Pipeline */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${settingsCompanyId ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
          1. Công ty {settingsCompanyId ? '✓' : '·'}
        </span>
        <span className="text-gray-300">→</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
          !settingsCompanyId
            ? 'bg-gray-50 text-gray-400 border border-gray-200'
            : selectedTypeKey
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
        }`}>
          2. Phân loại {selectedTypeKey ? '✓' : '·'}
        </span>
        <span className="text-gray-300">→</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${stepReady ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-400 border border-gray-200'}`}>
          3. Pipeline
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-teal-200 bg-white shadow-sm">
        <Building2 className="h-5 w-5 text-teal-600 shrink-0" />
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

      {/* Bước 2: Chọn Phân loại */}
      {settingsCompanyId && (
        <div className="rounded-xl border border-teal-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-teal-50/60">
            <Tags className="h-4 w-4 text-teal-700" />
            <p className="text-sm font-semibold text-teal-900">Phân loại</p>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('sx-workshop-type-section');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="ml-auto h-7 px-2.5 border border-gray-200 bg-white text-gray-700 rounded-md text-[11px] font-medium hover:bg-gray-50 inline-flex items-center gap-1.5 cursor-pointer"
              title="Thêm / sửa / xóa phân loại"
            >
              <Settings className="h-3 w-3" /> Quản lý phân loại
            </button>
            <button
              type="button"
              onClick={seedDefaultKitchenGlass}
              disabled={seedingDefault}
              className="h-7 px-2.5 border border-teal-200 bg-white text-teal-700 rounded-md text-[11px] font-medium hover:bg-teal-50 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Tạo 2 phân loại Tủ bếp / Cánh kính + bộ pipeline mặc định"
            >
              {seedingDefault ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Tủ bếp + Cánh kính
            </button>
          </div>
          <div className="p-3">
            {typesLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải…
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTypeKey(GLOBAL_TYPE_KEY)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    selectedTypeKey === GLOBAL_TYPE_KEY
                      ? 'bg-teal-600 text-white border-teal-600 ring-2 ring-teal-300'
                      : 'bg-white text-teal-700 border-teal-200 hover:bg-teal-50'
                  }`}
                  title="Áp dụng cho mọi loại"
                >
                  <Globe className="h-3.5 w-3.5" /> Bộ chung
                </button>
                {workshopTypes.length === 0 && (
                  <span className="text-xs text-gray-400 self-center">Chưa có loại — tạo bên dưới.</span>
                )}
                {workshopTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTypeKey(String(t.id))}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      String(selectedTypeKey) === String(t.id)
                        ? 'bg-teal-600 text-white border-teal-600 ring-2 ring-teal-300'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-teal-50 hover:text-teal-800'
                    } ${t.is_active === false ? 'opacity-60' : ''}`}
                  >
                    <span>{t.icon || '📦'}</span>
                    <span>{t.name}</span>
                    {t.is_active === false && <span className="text-[10px] font-normal opacity-80">(ẩn)</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!settingsCompanyId ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          Chọn <strong>Công ty</strong> phía trên.
        </div>
      ) : !selectedTypeKey ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-4 py-10 text-center text-sm text-amber-800">
          Chọn <strong>Phân loại</strong> để cấu hình pipeline.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-teal-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm bg-teal-600">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                  Cột Kanban
                  {selectedTypeKey === GLOBAL_TYPE_KEY ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-100 text-teal-800 border border-teal-200">
                      <Globe className="h-2.5 w-2.5" /> Bộ chung
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                      <Tags className="h-2.5 w-2.5" /> {selectedTypeLabel}
                    </span>
                  )}
                </h2>
                <p className="text-[10px] text-gray-500">{sorted.length} cột</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={seedSampleColumns}
                disabled={seeding}
                className="h-8 px-3 border border-teal-200 bg-white text-teal-800 rounded-lg text-xs hover:bg-teal-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Tạo nhanh 5 cột mẫu"
              >
                {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span aria-hidden>📦</span>}
                Cột mẫu
              </button>
              <button
                type="button"
                onClick={startAdd}
                className="h-8 px-3 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Thêm cột
              </button>
            </div>
          </div>

          <div className="p-4 border-b">
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {sorted.map((s, i) => (
                <div key={s.id} className="flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-2 transition-all ${
                      !s.is_active ? 'opacity-40 border-dashed' : 'border-transparent'
                    } ${editId === s.id ? 'ring-2 ring-teal-500' : ''}`}
                    style={{
                      backgroundColor: `${s.color || '#0f766e'}20`,
                      color: s.color || '#0f766e',
                      borderColor: editId === s.id ? '#0d9488' : 'transparent',
                    }}
                  >
                    {s.icon && <span className="mr-1">{s.icon}</span>}
                    {s.name}
                    {s.bucket_slug === INTAKE && <span className="ml-1 text-[10px] font-normal">(deal thắng)</span>}
                  </button>
                  {i < sorted.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300 mx-0.5 shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t">
            {sorted.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-gray-50 ${!s.is_active ? 'opacity-50' : ''}`}
              >
                <div className="flex flex-col gap-0.5">
                  <button type="button" onClick={() => moveStage(s, -1)}
                    disabled={i === 0 || s.bucket_slug === INTAKE || sorted[i - 1]?.bucket_slug === INTAKE}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▲</button>
                  <button type="button" onClick={() => moveStage(s, 1)}
                    disabled={i === sorted.length - 1 || s.bucket_slug === INTAKE}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▼</button>
                </div>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: s.color || '#0f766e' }}
                >
                  {s.order_index}
                </div>
                <span className="text-lg shrink-0">{s.icon || '📋'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                    {s.name}
                    {!s.workshop_type_id ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-200">
                        <Globe className="h-2.5 w-2.5" /> Bộ chung
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Tags className="h-2.5 w-2.5" />
                        {workshopTypes.find((t) => String(t.id) === String(s.workshop_type_id))?.name || 'Loại đã xóa'}
                      </span>
                    )}
                    {s.crm_target_stage && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                        📋 → CRM: {s.crm_target_stage.icon ? `${s.crm_target_stage.icon} ` : ''}{s.crm_target_stage.name}
                      </span>
                    )}
                    {!s.crm_target_stage && s.crm_sync_type === 'production' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                        📋 → CRM Sản xuất
                      </span>
                    )}
                    {s.is_handover_to_logistics && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
                        <Truck className="h-2.5 w-2.5" /> Bàn giao VC
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {s.bucket_slug === INTAKE ? 'Deal thắng · chờ vào xưởng' : 'Cột pipeline xưởng'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => toggleActive(s)} className="p-1.5 rounded hover:bg-gray-100 cursor-pointer text-[10px] text-gray-500" title={s.is_active ? 'Ẩn' : 'Hiện'}>
                    {s.is_active ? 'Ẩn' : 'Hiện'}
                  </button>
                  <button type="button" onClick={() => startEdit(s)} className="p-1.5 rounded hover:bg-teal-50 text-teal-600 cursor-pointer">
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => del(s.id, s.bucket_slug)} className="p-1.5 rounded hover:bg-red-50 text-red-500 cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {(adding || editId) && (
            <div className="p-4 border-t bg-teal-50/50 space-y-3">
              <div>
                <label className="text-[10px] font-medium text-gray-500 block mb-1">Tên cột *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full h-8 px-3 border rounded-lg text-sm"
                  placeholder="VD: Gia công CNC"
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
                      className={`w-8 h-8 rounded text-sm cursor-pointer ${form.icon === ic ? 'bg-teal-100 ring-2 ring-teal-500' : 'bg-gray-50 hover:bg-gray-100'}`}
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
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  Hiển thị trên Kanban
                </label>
                {!editingIntake && (
                  <div className="w-full space-y-1">
                    <label className="text-[10px] font-medium text-blue-700 block">
                      📋 Đồng bộ CRM khi vào cột:
                    </label>
                    <select
                      value={form.crm_target_stage_id || ''}
                      onChange={(e) => setForm((f) => ({ ...f, crm_target_stage_id: e.target.value, crm_sync_type: e.target.value ? null : f.crm_sync_type }))}
                      className="w-full h-8 px-2 border rounded-lg text-sm bg-white border-blue-200 focus:border-blue-400"
                    >
                      <option value="">— Không —</option>
                      {crmStages.filter((cs) => !cs.is_lost && !cs.is_won).map((cs) => (
                        <option key={cs.id} value={cs.id}>
                          {cs.icon ? `${cs.icon} ` : ''}{cs.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {!editingIntake && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_handover_to_logistics}
                      onChange={(e) => setForm((f) => ({ ...f, is_handover_to_logistics: e.target.checked }))}
                      className="rounded border-orange-400 accent-orange-500"
                    />
                    <span className="flex items-center gap-1 font-medium text-orange-700">
                      <Truck className="h-3.5 w-3.5" /> Bàn giao VC
                    </span>
                  </label>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={editId ? saveEdit : saveNew}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 cursor-pointer"
                >
                  Lưu
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setEditId(null); }}
                  className="px-4 py-2 border rounded-lg text-sm cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          {!adding && !editId && !hasIntake && (
            <div className="p-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
              Chưa có cột «deal thắng» — cần tạo cột với <code>bucket_slug: &apos;won_pending&apos;</code>.
            </div>
          )}
        </div>
      )}

      {!loading && (
        <div id="sx-workshop-type-section" className="scroll-mt-20">
          <WorkshopTypeSettingsSection
            moduleContext="production"
            accent="teal"
            {...(isAdmin ? { companyId: settingsCompanyId, onCompanyIdChange: setSettingsCompanyId } : {})}
          />
        </div>
      )}
    </div>
  );
}
