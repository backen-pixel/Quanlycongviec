import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { Settings, Plus, Trash2, Save, ChevronRight, ChevronDown, Loader2, Factory, Truck, Building2, ListChecks, Tags, Globe, Clock, Trophy, CheckCircle2, UserCircle, Banknote, Hammer, ArrowRightLeft, Search, Wrench, Eye, EyeOff } from 'lucide-react';
import WorkshopTypeSettingsSection from '../components/WorkshopTypeSettingsSection';
import { isPipelineStageSlaDisabled } from '../lib/crmPipelineSla';

const INTAKE = 'won_pending';
const LS_SX_PIPE_COMPANY = 'sx_pipeline_settings_company_id';
const LS_SX_PIPE_TYPE = 'sx_pipeline_settings_type_key';
const COLORS = ['#0f766e', '#14b8a6', '#5eead4', '#64748b', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981'];
const ICONS = ['🏭', '🚚', '🤝', '⏳', '📋', '✅', '🎯', '🔧', '📦'];
const GLOBAL_TYPE_KEY = 'global';
const STALE_PIPELINE_STAGE_MSG = 'Cột pipeline không còn tồn tại (cấu hình đã đổi). Danh sách sẽ được tải lại.';

function isMissingProductionStage(e) {
  return e?.response?.status === 404;
}

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
  const [saving, setSaving] = useState(false);
  const deletingStageIdsRef = useRef(new Set());
  const [reorderBusy, setReorderBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedingDefault, setSeedingDefault] = useState(false);
  const [editId, setEditId] = useState(null);
  const [bulkSelected, setBulkSelected] = useState(() => new Set());
  const [bulkTargetCrm, setBulkTargetCrm] = useState('');
  const [bulkTargetWorkshopType, setBulkTargetWorkshopType] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [handoverData, setHandoverData] = useState(null);
  const [intakeAssigneeId, setIntakeAssigneeId] = useState('');
  const [deliveryConfirmUserId, setDeliveryConfirmUserId] = useState('');
  const [intakeAssigneeLoading, setIntakeAssigneeLoading] = useState(false);
  const [typeStaffDefaults, setTypeStaffDefaults] = useState({});
  const [typeStaffPrimary, setTypeStaffPrimary] = useState({});
  const [typeStaffUsers, setTypeStaffUsers] = useState([]);
  const [typeStaffLoading, setTypeStaffLoading] = useState(false);
  const [typeStaffSaving, setTypeStaffSaving] = useState(false);
  const [staffConfigOpen, setStaffConfigOpen] = useState(false);
  const [stageStaffFilterCompanyId, setStageStaffFilterCompanyId] = useState('');
  const [stageStaffFilterDivisionId, setStageStaffFilterDivisionId] = useState('');
  const [stageStaffDivisions, setStageStaffDivisions] = useState([]);
  const [stageStaffAllCompanies, setStageStaffAllCompanies] = useState([]);
  const [stageStaffPickerCompanies, setStageStaffPickerCompanies] = useState([]);
  const [stageStaffBrowseUsers, setStageStaffBrowseUsers] = useState([]);
  const [stageStaffBrowseLoading, setStageStaffBrowseLoading] = useState(false);
  const [stageStaffSearch, setStageStaffSearch] = useState('');
  const [stageStaffSelectedMeta, setStageStaffSelectedMeta] = useState([]);
  const [form, setForm] = useState({
    name: '', color: COLORS[0], icon: '📋', is_active: true,
    is_handover_to_logistics: false,
    is_switch_workshop_type: false,
    target_workshop_type_id: '',
    crm_sync_type: null, crm_target_stage_id: '',
    progress_percent: '',
    default_probability: '',
    sla_days: '',
    counts_as_won_revenue: false,
    counts_as_completed_revenue: false,
    counts_as_collected_revenue: false,
    requires_deadline: false,
    auto_add_members_on_enter: false,
    stage_staff_user_ids: [],
    stage_staff_primary_user_id: '',
    stage_logistics_person_id: '',
    stage_installer_person_id: '',
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
        strict_company: 'true',
        workshop_type_id: selectedTypeKey,
        _ts: Date.now(),
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

  const recoverMissingStage = useCallback(async () => {
    setEditId(null);
    setAdding(false);
    setBulkSelected(new Set());
    await load();
    alert(STALE_PIPELINE_STAGE_MSG);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  const loadHandoverSettings = useCallback(async () => {
    if (!settingsCompanyId) {
      setHandoverData(null);
      setIntakeAssigneeId('');
      setDeliveryConfirmUserId('');
      return;
    }
    setIntakeAssigneeLoading(true);
    try {
      const { data } = await api.get(`/production/handover-settings/${settingsCompanyId}`);
      setHandoverData(data);
      setIntakeAssigneeId(data?.settings?.responsible_user_id ? String(data.settings.responsible_user_id) : '');
      setDeliveryConfirmUserId(data?.settings?.delivery_confirm_user_id ? String(data.settings.delivery_confirm_user_id) : '');
    } catch {
      setHandoverData(null);
      setIntakeAssigneeId('');
      setDeliveryConfirmUserId('');
    }
    setIntakeAssigneeLoading(false);
  }, [settingsCompanyId]);

  useEffect(() => {
    void loadHandoverSettings();
  }, [loadHandoverSettings]);

  const loadTypeStaffDefaults = useCallback(async () => {
    if (!settingsCompanyId) {
      setTypeStaffDefaults({});
      setTypeStaffPrimary({});
      setTypeStaffUsers([]);
      return;
    }
    setTypeStaffLoading(true);
    try {
      const { data } = await api.get(`/production/workshop-type-staff-defaults/${settingsCompanyId}`);
      setTypeStaffUsers(data?.users || []);
      const staff = {};
      const primary = {};
      for (const [typeId, val] of Object.entries(data?.defaults || {})) {
        if (Array.isArray(val)) {
          staff[typeId] = val.map(String);
        } else {
          staff[typeId] = (val.user_ids || []).map(String);
          if (val.primary_user_id) primary[typeId] = String(val.primary_user_id);
        }
      }
      setTypeStaffDefaults(staff);
      setTypeStaffPrimary(primary);
      if (data?.fallback_responsible_user_id != null) {
        setIntakeAssigneeId(data.fallback_responsible_user_id ? String(data.fallback_responsible_user_id) : '');
      }
      if (data?.delivery_confirm_user_id != null) {
        setDeliveryConfirmUserId(data.delivery_confirm_user_id ? String(data.delivery_confirm_user_id) : '');
      }
    } catch {
      setTypeStaffDefaults({});
      setTypeStaffPrimary({});
      setTypeStaffUsers([]);
    }
    setTypeStaffLoading(false);
  }, [settingsCompanyId]);

  useEffect(() => {
    void loadTypeStaffDefaults();
  }, [loadTypeStaffDefaults]);

  const toggleTypeStaffUser = (typeId, userId) => {
    const key = String(typeId);
    const uid = String(userId);
    setTypeStaffDefaults((prev) => {
      const current = Array.isArray(prev[key]) ? [...prev[key]] : [];
      const idx = current.indexOf(uid);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(uid);
      return { ...prev, [key]: current };
    });
    setTypeStaffPrimary((prev) => {
      if (prev[key] !== uid) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setTypeStaffPrimaryForType = (typeId, userId) => {
    const key = String(typeId);
    const uid = userId ? String(userId) : '';
    setTypeStaffPrimary((prev) => {
      const next = { ...prev };
      if (uid) next[key] = uid;
      else delete next[key];
      return next;
    });
    if (uid) {
      setTypeStaffDefaults((prev) => {
        const current = Array.isArray(prev[key]) ? [...prev[key]] : [];
        if (current.includes(uid)) return prev;
        return { ...prev, [key]: [...current, uid] };
      });
    }
  };

  const typeStaffUserList = useMemo(
    () => (typeStaffUsers.length ? typeStaffUsers : handoverData?.users || []),
    [typeStaffUsers, handoverData?.users],
  );

  const toggleStageStaffUser = (userId, userMeta = null) => {
    const uid = String(userId);
    setForm((prev) => {
      const current = Array.isArray(prev.stage_staff_user_ids) ? [...prev.stage_staff_user_ids] : [];
      const idx = current.indexOf(uid);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(uid);
      const next = { ...prev, stage_staff_user_ids: current };
      if (String(prev.stage_staff_primary_user_id) === uid && idx >= 0) {
        next.stage_staff_primary_user_id = '';
      }
      return next;
    });
    setStageStaffSelectedMeta((prev) => {
      const exists = prev.some((u) => String(u.id) === uid);
      if (exists) return prev.filter((u) => String(u.id) !== uid);
      if (userMeta?.id) return [...prev, userMeta];
      return prev;
    });
  };

  const setStageStaffPrimary = (userId) => {
    const uid = userId ? String(userId) : '';
    setForm((prev) => {
      const next = { ...prev, stage_staff_primary_user_id: uid };
      if (uid) {
        const current = Array.isArray(prev.stage_staff_user_ids) ? [...prev.stage_staff_user_ids] : [];
        if (!current.includes(uid)) {
          next.stage_staff_user_ids = [...current, uid];
        }
      }
      return next;
    });
  };

  const stageStaffPayloadFromForm = () => ({
    auto_add_members_on_enter: !!form.auto_add_members_on_enter,
    default_staff: {
      user_ids: (form.stage_staff_user_ids || []).map(String),
      primary_user_id: form.stage_staff_primary_user_id || null,
      logistics_person_id: form.stage_logistics_person_id || null,
      installer_person_id: form.stage_installer_person_id || null,
    },
  });

  const stageStaffHasAnyConfig = () => (
    (form.stage_staff_user_ids || []).length > 0
    || !!form.stage_logistics_person_id
    || !!form.stage_installer_person_id
  );

  const stageStaffPickerCompaniesSorted = useMemo(
    () => [...stageStaffPickerCompanies].sort((a, b) => String(a.short_name || a.name || '').localeCompare(String(b.short_name || b.name || ''), 'vi')),
    [stageStaffPickerCompanies],
  );

  const stageStaffDivisionLabel = useMemo(() => {
    if (!stageStaffFilterDivisionId) return '';
    const d = stageStaffDivisions.find((x) => String(x.id) === String(stageStaffFilterDivisionId));
    return d?.short_name || d?.name || '';
  }, [stageStaffDivisions, stageStaffFilterDivisionId]);

  const stageStaffCompanyLabel = useMemo(() => {
    if (!stageStaffFilterCompanyId) return '';
    const c = stageStaffAllCompanies.find((x) => String(x.id) === String(stageStaffFilterCompanyId));
    return c?.short_name || c?.name || '';
  }, [stageStaffAllCompanies, stageStaffFilterCompanyId]);

  const stageStaffSelectedUsers = useMemo(() => {
    const byId = new Map();
    for (const u of stageStaffSelectedMeta) {
      if (u?.id) byId.set(String(u.id), u);
    }
    for (const u of stageStaffBrowseUsers) {
      if (u?.id) byId.set(String(u.id), u);
    }
    return (form.stage_staff_user_ids || [])
      .map((id) => byId.get(String(id)))
      .filter(Boolean);
  }, [form.stage_staff_user_ids, stageStaffSelectedMeta, stageStaffBrowseUsers]);

  const stageStaffFilteredBrowseUsers = useMemo(() => {
    const q = stageStaffSearch.trim().toLowerCase();
    const byId = new Map();
    for (const u of stageStaffBrowseUsers) {
      if (u?.id) byId.set(String(u.id), u);
    }
    for (const u of stageStaffSelectedMeta) {
      if (u?.id) byId.set(String(u.id), u);
    }
    return [...byId.values()].filter((u) => {
      if (!q) return true;
      const name = String(u.full_name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [stageStaffBrowseUsers, stageStaffSearch, stageStaffSelectedMeta]);

  useEffect(() => {
    if (!stageStaffFilterCompanyId || !(adding || editId) || !form.auto_add_members_on_enter) {
      setStageStaffBrowseLoading(false);
      if (!form.auto_add_members_on_enter) {
        setStageStaffBrowseUsers([]);
      }
      return undefined;
    }
    let cancelled = false;
    setStageStaffBrowseLoading(true);
    api.get('/crm/employees-by-company', {
      params: { company_id: stageStaffFilterCompanyId, for_module: 'all' },
    })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.users || r.data || [];
        setStageStaffBrowseUsers(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setStageStaffBrowseUsers([]);
      })
      .finally(() => {
        if (!cancelled) setStageStaffBrowseLoading(false);
      });
    return () => { cancelled = true; };
  }, [stageStaffFilterCompanyId, adding, editId, form.auto_add_members_on_enter]);

  useEffect(() => {
    api.get('/divisions').catch(() => ({ data: { divisions: [] } })).then((divRes) => {
      setStageStaffDivisions(divRes.data?.divisions || []);
    });
    api.get('/companies').catch(() => ({ data: { companies: [] } })).then((coRes) => {
      const list = coRes.data?.companies || coRes.data || [];
      setStageStaffAllCompanies(Array.isArray(list) ? list : []);
      setStageStaffPickerCompanies(Array.isArray(list) ? list : []);
    });
  }, []);

  useEffect(() => {
    const params = stageStaffFilterDivisionId
      ? { division_unit_id: stageStaffFilterDivisionId }
      : {};
    api.get('/companies', { params })
      .catch(() => ({ data: { companies: [] } }))
      .then((coRes) => {
        const list = coRes.data?.companies || coRes.data || [];
        setStageStaffPickerCompanies(Array.isArray(list) ? list : []);
      });
  }, [stageStaffFilterDivisionId]);

  useEffect(() => {
    if (!stageStaffFilterDivisionId || !stageStaffFilterCompanyId) return;
    if (!stageStaffPickerCompanies.length) return;
    const ok = stageStaffPickerCompanies.some((c) => String(c.id) === String(stageStaffFilterCompanyId));
    if (!ok) setStageStaffFilterCompanyId('');
  }, [stageStaffFilterDivisionId, stageStaffFilterCompanyId, stageStaffPickerCompanies]);

  const ensureStageStaffDefaultCompany = useCallback(() => {
    if (!settingsCompanyId || stageStaffFilterCompanyId) return;
    setStageStaffFilterCompanyId(String(settingsCompanyId));
  }, [settingsCompanyId, stageStaffFilterCompanyId]);

  const setTypeStaffForType = (typeId, userIds) => {
    const key = String(typeId);
    setTypeStaffDefaults((prev) => ({ ...prev, [key]: userIds.map(String) }));
    setTypeStaffPrimary((prev) => {
      if (!prev[key] || userIds.map(String).includes(String(prev[key]))) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const selectAllTypeStaffForType = (typeId) => {
    setTypeStaffForType(typeId, typeStaffUserList.map((u) => u.id));
  };

  const clearTypeStaffForType = (typeId) => {
    const key = String(typeId);
    setTypeStaffDefaults((prev) => ({ ...prev, [key]: [] }));
    setTypeStaffPrimary((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const selectAllTypeStaffEverywhere = () => {
    const allIds = typeStaffUserList.map((u) => String(u.id));
    setTypeStaffDefaults((prev) => {
      const next = { ...prev };
      for (const t of workshopTypes) {
        next[String(t.id)] = [...allIds];
      }
      return next;
    });
    setTypeStaffPrimary((prev) => {
      const next = { ...prev };
      for (const t of workshopTypes) {
        const key = String(t.id);
        if (next[key] && !allIds.includes(String(next[key]))) {
          delete next[key];
        }
      }
      return next;
    });
  };

  const clearAllTypeStaff = () => {
    setTypeStaffDefaults({});
    setTypeStaffPrimary({});
  };

  const saveTypeStaffDefaults = async () => {
    if (!settingsCompanyId) return;
    setTypeStaffSaving(true);
    try {
      const defaults = (workshopTypes.length ? workshopTypes : []).map((t) => ({
        workshop_type_id: t.id,
        user_ids: typeStaffDefaults[String(t.id)] || [],
        primary_user_id: typeStaffPrimary[String(t.id)] || null,
      }));
      await api.put(`/production/workshop-type-staff-defaults/${settingsCompanyId}`, {
        defaults,
        fallback_responsible_user_id: intakeAssigneeId || null,
        delivery_confirm_user_id: deliveryConfirmUserId || null,
      });
      await loadTypeStaffDefaults();
      await loadHandoverSettings();
      alert('Đã lưu nhân viên mặc định theo phân loại.');
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    }
    setTypeStaffSaving(false);
  };

  // Reset bulk selection khi đổi công ty / phân loại
  useEffect(() => {
    setBulkSelected(new Set());
    setBulkTargetCrm('');
    setBulkTargetWorkshopType('');
  }, [settingsCompanyId, selectedTypeKey]);

  const toggleBulk = (id) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkApplyCrmTarget = async () => {
    if (!bulkSelected.size || !bulkTargetCrm) return;
    setBulkSaving(true);
    try {
      await api.post(`/crm/pipeline-stages/${bulkTargetCrm}/assign-production-columns`, {
        production_pipeline_stage_ids: Array.from(bulkSelected),
        replace_existing: false,
      });
      setBulkSelected(new Set());
      setBulkTargetCrm('');
      await load();
    } catch (e) {
      alert('Lỗi gán: ' + (e.response?.data?.error || e.message));
    } finally {
      setBulkSaving(false);
    }
  };

  const bulkClearCrmTarget = async () => {
    if (!bulkSelected.size) return;
    if (!confirm(`Bỏ liên kết CRM cho ${bulkSelected.size} cột đã chọn?`)) return;
    setBulkSaving(true);
    try {
      await Promise.all(
        Array.from(bulkSelected).map((id) =>
          api.put(`/production/pipeline-stages/${id}`, { crm_target_stage_id: null }),
        ),
      );
      setBulkSelected(new Set());
      await load();
    } catch (e) {
      if (isMissingProductionStage(e)) {
        await recoverMissingStage();
        return;
      }
      alert('Lỗi bỏ gán: ' + (e.response?.data?.error || e.message));
    } finally {
      setBulkSaving(false);
    }
  };

  // Đánh dấu các cột đã chọn là «trigger SX» (crm_sync_type='production').
  // Khi project chạm cột này → CRM tự đẩy deal về cột có sync_role='sx_production'
  // (theo pipeline của deal) — không cần map thủ công từng cột.
  const bulkSetTrigger = async () => {
    if (!bulkSelected.size) return;
    setBulkSaving(true);
    try {
      await Promise.all(
        Array.from(bulkSelected).map((id) =>
          api.put(`/production/pipeline-stages/${id}`, {
            crm_sync_type: 'production',
            crm_target_stage_id: null,
          }),
        ),
      );
      setBulkSelected(new Set());
      await load();
    } catch (e) {
      if (isMissingProductionStage(e)) {
        await recoverMissingStage();
        return;
      }
      alert('Lỗi đặt trigger: ' + (e.response?.data?.error || e.message));
    } finally {
      setBulkSaving(false);
    }
  };

  const bulkUnsetTrigger = async () => {
    if (!bulkSelected.size) return;
    if (!confirm(`Bỏ trigger SX cho ${bulkSelected.size} cột đã chọn?`)) return;
    setBulkSaving(true);
    try {
      await Promise.all(
        Array.from(bulkSelected).map((id) =>
          api.put(`/production/pipeline-stages/${id}`, {
            crm_sync_type: null,
          }),
        ),
      );
      setBulkSelected(new Set());
      await load();
    } catch (e) {
      if (isMissingProductionStage(e)) {
        await recoverMissingStage();
        return;
      }
      alert('Lỗi bỏ trigger: ' + (e.response?.data?.error || e.message));
    } finally {
      setBulkSaving(false);
    }
  };

  const bulkMoveWorkshopType = async () => {
    if (!bulkSelected.size || !bulkTargetWorkshopType) return;
    const targetLabel = bulkTargetWorkshopType === GLOBAL_TYPE_KEY
      ? 'Bộ chung'
      : (workshopTypes.find((t) => String(t.id) === String(bulkTargetWorkshopType))?.name || bulkTargetWorkshopType);
    const targetKey = bulkTargetWorkshopType;
    const targetId = targetKey === GLOBAL_TYPE_KEY ? null : targetKey;
    const count = bulkSelected.size;
    if (!confirm(`Chuyển ${count} cột đã chọn sang phân loại «${targetLabel}»?`)) return;
    setBulkSaving(true);
    try {
      await Promise.all(
        Array.from(bulkSelected).map((id) =>
          api.put(`/production/pipeline-stages/${id}`, { workshop_type_id: targetId }),
        ),
      );
      setBulkSelected(new Set());
      setBulkTargetWorkshopType('');
      await load();
      const switchHint = targetKey !== GLOBAL_TYPE_KEY
        && String(targetKey) !== String(selectedTypeKey)
        ? `\n\nBấm tab «${targetLabel}» ở khối Phân loại để xem các cột vừa chuyển.`
        : '';
      alert(`Đã chuyển ${count} cột sang «${targetLabel}».${switchHint}`);
    } catch (e) {
      if (isMissingProductionStage(e)) {
        await recoverMissingStage();
        return;
      }
      alert('Lỗi chuyển phân loại: ' + (e.response?.data?.error || e.message));
    } finally {
      setBulkSaving(false);
    }
  };

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

  // Gỡ phân loại đã xóa khỏi localStorage (tránh POST pipeline với workshop_type_id không tồn tại → lỗi FK).
  useEffect(() => {
    if (!settingsCompanyId || typesLoading) return;
    setSelectedTypeKey((prev) => {
      if (prev === GLOBAL_TYPE_KEY) return prev;
      if (prev && workshopTypes.some((t) => String(t.id) === String(prev))) return prev;
      if (workshopTypes.length > 0) return String(workshopTypes[0].id);
      return '';
    });
  }, [workshopTypes, settingsCompanyId, typesLoading]);

  // Khôi phúc lựa chọn phân loại đã lưu (theo từng công ty).
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

  const kpiPayloadFromForm = () => ({
    default_probability: form.default_probability === '' ? null : form.default_probability,
    sla_days: form.sla_days === '' || form.sla_days == null ? null : Number(form.sla_days),
    counts_as_won_revenue: !!form.counts_as_won_revenue,
    counts_as_completed_revenue: !!form.counts_as_completed_revenue,
    counts_as_collected_revenue: !!form.counts_as_collected_revenue,
    requires_deadline: !!form.requires_deadline,
  });

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
    setStageStaffFilterCompanyId(settingsCompanyId ? String(settingsCompanyId) : '');
    setStageStaffFilterDivisionId('');
    setStageStaffBrowseUsers([]);
    setStageStaffSearch('');
    setStageStaffSelectedMeta([]);
    setForm({
      name: '', color: COLORS[stages.length % COLORS.length], icon: ICONS[stages.length % ICONS.length],
      is_active: true, is_handover_to_logistics: false,
      is_switch_workshop_type: false, target_workshop_type_id: '',
      crm_sync_type: null, crm_target_stage_id: '',
      progress_percent: '',
      default_probability: '',
      sla_days: '',
      counts_as_won_revenue: false,
      counts_as_completed_revenue: false,
      counts_as_collected_revenue: false,
      requires_deadline: false,
      auto_add_members_on_enter: false,
      stage_staff_user_ids: [],
      stage_staff_primary_user_id: '',
      stage_logistics_person_id: '',
      stage_installer_person_id: '',
    });
  };

  const startEdit = (stage) => {
    setEditId(stage.id);
    setAdding(false);
    setStageStaffFilterCompanyId(settingsCompanyId ? String(settingsCompanyId) : '');
    setStageStaffFilterDivisionId('');
    setStageStaffSearch('');
    setStageStaffSelectedMeta([
      ...(Array.isArray(stage.default_staff?.users) ? stage.default_staff.users : []),
      stage.default_staff?.logistics_person,
      stage.default_staff?.installer_person,
    ].filter(Boolean));
    setForm({
      name: stage.name,
      color: stage.color || '#0f766e',
      icon: stage.icon || '📋',
      is_active: stage.is_active !== false,
      is_handover_to_logistics: stage.is_handover_to_logistics || false,
      is_switch_workshop_type: stage.is_switch_workshop_type || false,
      target_workshop_type_id: stage.target_workshop_type_id || '',
      crm_sync_type: stage.crm_sync_type || null,
      crm_target_stage_id: stage.crm_target_stage_id || '',
      progress_percent: stage.progress_percent ?? '',
      default_probability: stage.default_probability != null && stage.default_probability !== '' ? String(stage.default_probability) : '',
      sla_days: stage.sla_days != null && stage.sla_days !== '' ? String(stage.sla_days) : '',
      counts_as_won_revenue: !!stage.counts_as_won_revenue,
      counts_as_completed_revenue: !!stage.counts_as_completed_revenue,
      counts_as_collected_revenue: !!stage.counts_as_collected_revenue,
      requires_deadline: !!stage.requires_deadline,
      auto_add_members_on_enter: !!stage.auto_add_members_on_enter,
      stage_staff_user_ids: (stage.default_staff?.user_ids || []).map(String),
      stage_staff_primary_user_id: stage.default_staff?.primary_user_id ? String(stage.default_staff.primary_user_id) : '',
      stage_logistics_person_id: stage.default_staff?.logistics_person_id ? String(stage.default_staff.logistics_person_id) : '',
      stage_installer_person_id: stage.default_staff?.installer_person_id ? String(stage.default_staff.installer_person_id) : '',
    });
  };

  const saveNew = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    if (!selectedTypeKey) return alert('Hãy chọn phân loại trước');
    if (form.is_switch_workshop_type && !form.target_workshop_type_id) {
      return alert('Chọn phân loại đích khi bật «Chuyển phân loại»');
    }
    if (form.auto_add_members_on_enter && !stageStaffHasAnyConfig()) {
      return alert('Chọn ít nhất 1 NV sản xuất, phụ trách vận chuyển hoặc người lắp đặt');
    }
    setSaving(true);
    try {
      const { data } = await api.post('/production/pipeline-stages', {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon,
        progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
        workflow_stage_id: productionWorkflowStageId || null,
        is_active: form.is_active,
        is_handover_to_logistics: form.is_handover_to_logistics,
        is_switch_workshop_type: form.is_switch_workshop_type,
        target_workshop_type_id: form.is_switch_workshop_type ? (form.target_workshop_type_id || null) : null,
        crm_sync_type: (form.is_handover_to_logistics || form.is_switch_workshop_type) ? null : (form.crm_target_stage_id ? null : (form.crm_sync_type || null)),
        crm_target_stage_id: (form.is_handover_to_logistics || form.is_switch_workshop_type) ? null : (form.crm_target_stage_id || null),
        company_id: settingsCompanyId,
        workshop_type_id: currentWorkshopTypeId,
        ...kpiPayloadFromForm(),
        ...stageStaffPayloadFromForm(),
      });
      setAdding(false);
      setEditId(null);
      await load();
      alert(`Đã tạo cột «${data?.name || form.name.trim()}».`);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi tạo cột');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    if (form.is_switch_workshop_type && !form.target_workshop_type_id) {
      return alert('Chọn phân loại đích khi bật «Chuyển phân loại»');
    }
    if (form.auto_add_members_on_enter && !stageStaffHasAnyConfig()) {
      return alert('Chọn ít nhất 1 NV sản xuất, phụ trách vận chuyển hoặc người lắp đặt');
    }
    if (!stages.some((s) => s.id === editId)) {
      await recoverMissingStage();
      return;
    }
    setSaving(true);
    try {
      const intakeRow = stages.find((s) => s.id === editId)?.bucket_slug === INTAKE;
      const handover = !intakeRow && form.is_handover_to_logistics;
      const switchType = !intakeRow && !handover && form.is_switch_workshop_type;
      await api.put(`/production/pipeline-stages/${editId}`, {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon,
        progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
        workflow_stage_id: intakeRow ? null : (productionWorkflowStageId || null),
        is_active: form.is_active,
        is_handover_to_logistics: handover,
        is_switch_workshop_type: switchType,
        target_workshop_type_id: switchType ? (form.target_workshop_type_id || null) : null,
        crm_sync_type: intakeRow || handover || switchType ? null : (form.crm_target_stage_id ? null : (form.crm_sync_type || null)),
        crm_target_stage_id: intakeRow || handover || switchType ? null : (form.crm_target_stage_id || null),
        ...(intakeRow ? {} : { ...kpiPayloadFromForm(), ...stageStaffPayloadFromForm() }),
      });
      setEditId(null);
      setAdding(false);
      await load();
    } catch (e) {
      if (isMissingProductionStage(e)) {
        await recoverMissingStage();
        return;
      }
      alert(e.response?.data?.error || 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id, bucket) => {
    if (bucket === INTAKE) return alert('Không xóa cột deal thắng — chỉ ẩn');
    if (deletingStageIdsRef.current.has(id)) return;
    if (!confirm('Xóa cột này?')) return;
    deletingStageIdsRef.current.add(id);
    if (editId === id) {
      setEditId(null);
      setAdding(false);
    }
    setBulkSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setStages((prev) => prev.filter((s) => s.id !== id));
    try {
      const { data } = await api.delete(`/production/pipeline-stages/${id}`);
      if (data?.already_deleted) {
        await load();
        return;
      }
      await load();
    } catch (e) {
      const alreadyGone = e.response?.status === 404
        || e.response?.data?.already_deleted === true;
      if (alreadyGone) {
        await load();
        return;
      }
      await load();
      alert(e.response?.data?.error || 'Lỗi xóa');
    } finally {
      deletingStageIdsRef.current.delete(id);
    }
  };

  const toggleActive = async (stage) => {
    const next = stage.is_active === false;
    setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, is_active: next } : s)));
    try {
      await api.put(`/production/pipeline-stages/${stage.id}`, { is_active: next });
      await load();
    } catch (e) {
      setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, is_active: stage.is_active } : s)));
      if (isMissingProductionStage(e)) {
        await recoverMissingStage();
        return;
      }
      alert(e?.response?.data?.error || e?.message || 'Không cập nhật được trạng thái cột');
    }
  };

  const toggleSlaColumn = async (stage) => {
    const turningOff = !isPipelineStageSlaDisabled(stage.sla_days);
    try {
      await api.put(`/production/pipeline-stages/${stage.id}`, {
        sla_days: turningOff ? 0 : null,
      });
      load();
    } catch (e) {
      if (isMissingProductionStage(e)) {
        await recoverMissingStage();
        return;
      }
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const toggleRequiresDeadlineColumn = async (stage) => {
    try {
      await api.put(`/production/pipeline-stages/${stage.id}`, {
        requires_deadline: !stage.requires_deadline,
      });
      load();
    } catch (e) {
      if (isMissingProductionStage(e)) {
        await recoverMissingStage();
        return;
      }
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const toggleCompletedRevenueColumn = async (stage) => {
    try {
      await api.put(`/production/pipeline-stages/${stage.id}`, {
        counts_as_completed_revenue: !stage.counts_as_completed_revenue,
      });
      load();
    } catch (e) {
      if (isMissingProductionStage(e)) {
        await recoverMissingStage();
        return;
      }
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const toggleCollectedRevenueColumn = async (stage) => {
    try {
      await api.put(`/production/pipeline-stages/${stage.id}`, {
        counts_as_collected_revenue: !stage.counts_as_collected_revenue,
      });
      load();
    } catch (e) {
      if (isMissingProductionStage(e)) {
        await recoverMissingStage();
        return;
      }
      const msg = e.response?.data?.error || e.message || 'Lỗi';
      alert(msg.includes('counts_as_collected') || msg.includes('296')
        ? `${msg}\n\nChạy migration database/296_production_pipeline_collected_revenue.sql trên Supabase.`
        : msg);
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
      await api.put('/production/pipeline-stages-reorder', { stages: reorder });
      await load();
    } catch (err) {
      setStages(prevStages);
      if (isMissingProductionStage(err)) {
        await recoverMissingStage();
        return;
      }
      alert('Lỗi sắp xếp: ' + (err.response?.data?.error || err.message));
      await load();
    } finally {
      setReorderBusy(false);
    }
  };

  const moveStage = async (stage, dir) => {
    if (reorderBusy) return;
    if (stage.bucket_slug === INTAKE) return; // Cột deal-thắng luôn đứng đầu
    const list = [...stages].sort((a, b) => a.order_index - b.order_index);
    const idx = list.findIndex((s) => s.id === stage.id);
    if (idx < 0 || (dir === -1 && idx === 0) || (dir === 1 && idx === list.length - 1)) return;
    // Không cho nhảy lên trước cột INTAKE
    if (dir === -1 && list[idx - 1]?.bucket_slug === INTAKE) return;
    const newList = [...list];
    [newList[idx], newList[idx + dir]] = [newList[idx + dir], newList[idx]];
    await persistStagesReorder(newList);
  };

  /** Kéo thả sắp xếp pipeline xưởng — cùng phân loại đang chọn. */
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

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
    if (!sourceId || sourceId === stage.id) return;
    if (stage.bucket_slug === INTAKE) return; // Không drop lên cột intake
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
    if (!sourceId || sourceId === target.id) return;
    if (target.bucket_slug === INTAKE) return;

    const list = [...stages].sort((a, b) => a.order_index - b.order_index);
    const fromIdx = list.findIndex((s) => s.id === sourceId);
    const toIdx = list.findIndex((s) => s.id === target.id);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    if (list[fromIdx]?.bucket_slug === INTAKE) return;

    const newList = [...list];
    const [moved] = newList.splice(fromIdx, 1);
    // Drop lên 1 dòng nghĩa là đặt trước dòng target để thao tác trực quan hơn.
    const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    newList.splice(insertIdx, 0, moved);
    await persistStagesReorder(newList);
  };

  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
  const editingIntake = editId && sorted.find((s) => s.id === editId)?.bucket_slug === INTAKE;

  return (
    <div className="space-y-4 w-full max-w-[1400px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Factory className="h-7 w-7 text-teal-600" />
          <h1 className="text-xl font-bold text-gray-900">Pipeline xưởng</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/sx/task-templates"
            className="text-sm font-medium text-teal-700 hover:text-teal-900 border border-teal-200 rounded-lg px-3 py-2 bg-white inline-flex items-center gap-1.5 shadow-sm"
            title="Bộ mẫu nhiệm vụ"
          >
            <ListChecks className="h-4 w-4" /> Bộ mẫu nhiệm vụ
          </Link>
          <Link
            to="/sx/dashboard"
            className="text-sm font-medium text-teal-700 hover:text-teal-900 border border-teal-200 rounded-lg px-3 py-2 bg-white shadow-sm"
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

      {settingsCompanyId && (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 to-white p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <UserCircle className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-bold text-gray-900">Nhân viên mặc định theo phân loại</h2>
                <p className="text-[11px] text-gray-600 mt-0.5 leading-snug max-w-2xl">
                  Mỗi phân loại có <strong className="font-semibold text-indigo-800">phụ trách chính riêng</strong> và danh sách NV tham gia.
                  Khi dự án vào xưởng, hệ thống gán đúng đội theo phân loại — phụ trách chính hiển thị trên dự án và deal CRM.
                  Nếu phân loại chưa cấu hình, dùng người dự phòng bên dưới.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0 items-center">
              <Link
                to="/sx/regions"
                className="text-[11px] font-medium text-indigo-700 hover:text-indigo-900 border border-indigo-200 rounded-lg px-2.5 py-1.5 bg-white"
              >
                Khu vực →
              </Link>
              <Link
                to="/sx/handover-settings"
                className="text-[11px] font-medium text-indigo-700 hover:text-indigo-900 border border-indigo-200 rounded-lg px-2.5 py-1.5 bg-white"
              >
                Đội SX & phân công mẫu →
              </Link>
              <button
                type="button"
                onClick={() => setStaffConfigOpen((v) => !v)}
                className="text-[11px] font-semibold text-indigo-800 border border-indigo-300 rounded-lg px-2.5 py-1.5 bg-white hover:bg-indigo-50 inline-flex items-center gap-1 cursor-pointer"
              >
                {staffConfigOpen ? 'Thu gọn' : 'Cấu hình NV'}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${staffConfigOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {staffConfigOpen && (
          <>
          {(typeStaffLoading || intakeAssigneeLoading) ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải nhân sự…
            </div>
          ) : (
            <>
              {(workshopTypes.length === 0) ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Chưa có phân loại xưởng — thêm phân loại ở cột phải hoặc bấm «Tủ bếp + Cánh kính».
                </p>
              ) : (
                <div className="space-y-3">
                  {typeStaffUserList.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={selectAllTypeStaffEverywhere}
                        className="text-[11px] font-medium text-indigo-700 hover:text-indigo-900 border border-indigo-200 rounded-lg px-2.5 py-1 bg-white cursor-pointer"
                      >
                        Chọn tất cả (mọi phân loại)
                      </button>
                      <button
                        type="button"
                        onClick={clearAllTypeStaff}
                        className="text-[11px] font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1 bg-white cursor-pointer"
                      >
                        Bỏ chọn tất cả
                      </button>
                    </div>
                  )}
                  {typeStaffUserList.length === 0 ? (
                    <p className="text-xs text-gray-500">Chưa có nhân viên thuộc công ty này.</p>
                  ) : (
                    workshopTypes.map((t) => {
                      const users = typeStaffUserList;
                      const selected = typeStaffDefaults[String(t.id)] || [];
                      const primaryId = typeStaffPrimary[String(t.id)] || '';
                      const primaryOptions = selected.length
                        ? users.filter((u) => selected.includes(String(u.id)))
                        : users;
                      const allSelected = users.length > 0 && users.every((u) => selected.includes(String(u.id)));
                      return (
                        <div key={t.id} className="rounded-lg border border-indigo-100 bg-white/80 p-3">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <p className="text-xs font-bold text-gray-800 flex items-center gap-2 min-w-0">
                              <Tags className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                              {t.name}
                              {selected.length > 0 && (
                                <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                  {selected.length}/{users.length} NV
                                </span>
                              )}
                            </p>
                            <button
                              type="button"
                              onClick={() => (allSelected ? clearTypeStaffForType(t.id) : selectAllTypeStaffForType(t.id))}
                              className="ml-auto text-[10px] font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-0.5 bg-indigo-50/50 cursor-pointer shrink-0"
                            >
                              {allSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
                            </button>
                          </div>
                          <label className="flex flex-col gap-1 mb-2 max-w-sm">
                            <span className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">Phụ trách chính ★</span>
                            <select
                              value={primaryId}
                              onChange={(e) => setTypeStaffPrimaryForType(t.id, e.target.value)}
                              className="h-8 px-2 border border-indigo-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-300"
                            >
                              <option value="">— Chọn phụ trách cho {t.name} —</option>
                              {primaryOptions.map((u) => (
                                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                              ))}
                            </select>
                          </label>
                          <p className="text-[10px] text-gray-500 mb-1.5">Đội tham gia (chọn nhiều):</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-32 overflow-y-auto">
                            {users.map((u) => {
                              const checked = selected.includes(String(u.id));
                              const isPrimary = String(u.id) === String(primaryId);
                              return (
                                <label
                                  key={`${t.id}-${u.id}`}
                                  className={`inline-flex items-center gap-1.5 text-xs cursor-pointer select-none px-2 py-1 rounded-md border transition-colors ${
                                    isPrimary
                                      ? 'bg-amber-50 border-amber-300 text-amber-900 ring-1 ring-amber-200'
                                      : checked
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                        : 'bg-gray-50/50 border-transparent text-gray-700 hover:bg-gray-100'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={checked}
                                    onChange={() => toggleTypeStaffUser(t.id, u.id)}
                                  />
                                  <span>{u.full_name || u.email}{isPrimary ? ' ★' : ''}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-indigo-100">
                <label className="flex flex-col gap-1 flex-1 min-w-[240px] max-w-md">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Dự phòng (khi phân loại chưa gán NV)</span>
                  <select
                    value={intakeAssigneeId}
                    onChange={(e) => setIntakeAssigneeId(e.target.value)}
                    className="h-9 px-2.5 border border-gray-200 rounded-lg text-sm bg-white"
                  >
                    <option value="">— Chưa chọn (admin công ty) —</option>
                    {(typeStaffUserList).map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 flex-1 min-w-[240px] max-w-md">
                  <span className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide">Quản lý giao hàng (xác nhận bàn giao VC)</span>
                  <select
                    value={deliveryConfirmUserId}
                    onChange={(e) => setDeliveryConfirmUserId(e.target.value)}
                    className="h-9 px-2.5 border border-violet-200 rounded-lg text-sm bg-white"
                  >
                    <option value="">— Dùng phụ trách SX của dự án —</option>
                    {(typeStaffUserList).map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-gray-500">Người được bấm «Xác nhận» phía Xưởng trên thẻ bàn giao VC/LĐ.</span>
                </label>
                <button
                  type="button"
                  disabled={typeStaffSaving}
                  onClick={() => saveTypeStaffDefaults()}
                  className="h-9 px-3.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {typeStaffSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Lưu cấu hình NV
                </button>
              </div>
            </>
          )}
          </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] gap-4 items-start">
      <div className="space-y-4 min-w-0">

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
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                el?.classList.add('ring-2', 'ring-teal-400', 'rounded-xl');
                setTimeout(() => el?.classList.remove('ring-2', 'ring-teal-400'), 1200);
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
              className="h-7 px-2.5 border border-teal-200 bg-teal-600 text-white rounded-md text-[11px] font-medium hover:bg-teal-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                  <span className="text-xs text-gray-400 self-center">Chưa có loại — tạo ở cột phải.</span>
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
      ) : !workshopTypes.length ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-4 py-10 text-center text-sm text-amber-800 space-y-2">
          <p>Công ty này <strong>chưa có phân loại dự án</strong> (Tủ bếp, B2B, …).</p>
          <p className="text-xs text-amber-700">Tạo phân loại ở cột phải, rồi chọn phân loại để thêm/sửa/xóa cột pipeline.</p>
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
                    onClick={() => requestEdit(s)}
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

          {/* Thanh hành động hàng loạt — đặt nhiều cột pipeline SX là «trigger» (crm_sync_type='production').
              Khi project chạm cột trigger → CRM tự đẩy deal về cột có sync_role='sx_production' của
              pipeline tương ứng. Không cần map từng cột → từng cột CRM nữa. */}
          {sorted.filter((s) => s.bucket_slug !== INTAKE).length > 0 && (() => {
            const eligibleCols = sorted.filter((s) => s.bucket_slug !== INTAKE);
            const eligibleIds = eligibleCols.map((s) => s.id);
            const allSelected = eligibleIds.length > 0 && eligibleIds.every((id) => bulkSelected.has(id));
            const someSelected = eligibleIds.some((id) => bulkSelected.has(id));
            const sxRoleStages = crmStages.filter((cs) => !cs.is_lost && !cs.is_won && cs.sync_role === 'sx_production');
            const triggerCount = eligibleCols.filter((s) => s.crm_sync_type === 'production').length;
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
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700 border border-orange-200"
                  title="Số cột đang là «trigger SX» — chạm cột này CRM sẽ tự nhảy về cột Sản xuất"
                >
                  🔥 {triggerCount} cột trigger
                </span>
                {bulkSelected.size > 0 && (
                  <>
                    <span className="text-xs text-gray-400">→</span>
                    <select
                      value={bulkTargetWorkshopType}
                      onChange={(e) => setBulkTargetWorkshopType(e.target.value)}
                      className="h-8 px-2 border rounded-lg text-xs bg-white border-indigo-200 max-w-[200px]"
                      title="Chọn phân loại đích để chuyển các cột đã tick"
                    >
                      <option value="">— Phân loại đích —</option>
                      <option value={GLOBAL_TYPE_KEY}>🌐 Bộ chung</option>
                      {workshopTypes.map((t) => (
                        <option key={t.id} value={String(t.id)}>
                          {t.icon ? `${t.icon} ` : ''}{t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={bulkMoveWorkshopType}
                      disabled={!bulkTargetWorkshopType || bulkSaving}
                      title="Chuyển các cột đã chọn sang phân loại khác (Tủ bếp, Cánh kính, B2B, …)"
                      className="h-8 px-3 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      {bulkSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tags className="h-3.5 w-3.5" />}
                      Chuyển {bulkSelected.size} cột → phân loại
                    </button>
                    <span className="w-px h-6 bg-gray-300 mx-1" />
                    <button
                      type="button"
                      onClick={bulkSetTrigger}
                      disabled={bulkSaving || sxRoleStages.length === 0}
                      title={sxRoleStages.length === 0
                        ? 'Chưa có cột CRM nào tích sync_role=sx_production — vào Cài đặt CRM gán trước'
                        : 'Đặt các cột đã chọn làm «trigger SX». Khi project chạm 1 trong các cột này, CRM tự đẩy deal về cột Sản xuất của pipeline.'}
                      className="h-8 px-3 bg-orange-600 text-white rounded-lg text-xs font-semibold hover:bg-orange-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      {bulkSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '🔥'}
                      Đặt {bulkSelected.size} cột → Trigger SX
                    </button>
                    <button
                      type="button"
                      onClick={bulkUnsetTrigger}
                      disabled={bulkSaving}
                      className="h-8 px-3 bg-white border border-orange-300 text-orange-700 rounded-lg text-xs font-semibold hover:bg-orange-50 disabled:opacity-50 cursor-pointer"
                      title="Bỏ trigger SX (đặt crm_sync_type = null) cho các cột đã chọn"
                    >
                      Bỏ trigger SX
                    </button>
                    <span className="w-px h-6 bg-gray-300 mx-1" />
                    <details className="relative">
                      <summary className="h-8 px-2 inline-flex items-center text-[11px] text-gray-500 hover:text-gray-700 cursor-pointer list-none">
                        Nâng cao ▾
                      </summary>
                      <div className="absolute left-0 top-9 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex flex-wrap items-center gap-2 min-w-[320px]">
                        <span className="text-[10px] text-gray-500 w-full">
                          Gán cứng → 1 cột CRM cụ thể (1-1, ít dùng):
                        </span>
                        <select
                          value={bulkTargetCrm}
                          onChange={(e) => setBulkTargetCrm(e.target.value)}
                          className="h-8 px-2 border rounded-lg text-xs bg-white border-blue-200 max-w-[240px]"
                        >
                          <option value="">— Chọn cột CRM —</option>
                          {sxRoleStages.length === 0 ? (
                            <option value="" disabled>Chưa có cột CRM tích sync_role=sx_production</option>
                          ) : sxRoleStages.map((cs) => (
                            <option key={cs.id} value={cs.id}>
                              {cs.icon ? `${cs.icon} ` : ''}{cs.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={bulkApplyCrmTarget}
                          disabled={!bulkTargetCrm || bulkSaving}
                          className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                        >
                          Gán cứng
                        </button>
                        <button
                          type="button"
                          onClick={bulkClearCrmTarget}
                          disabled={bulkSaving}
                          className="h-8 px-3 bg-white border border-red-300 text-red-700 rounded-lg text-xs hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                        >
                          Bỏ gán cứng
                        </button>
                      </div>
                    </details>
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
                    Tick các cột → <strong>chuyển phân loại</strong> (Tủ bếp, Cánh kính, …) hoặc <strong>đặt Trigger SX</strong> (CRM tự nhảy về cột Sản xuất khi project chạm cột trigger).
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
                    ${isDragging ? 'opacity-40 bg-teal-50' : 'hover:bg-gray-50'}
                    ${isDragOver ? 'border-t-2 border-t-teal-500 bg-teal-50/50' : ''}
                    ${bulkSelected.has(s.id) ? 'bg-blue-50/60' : ''}
                    ${s.is_active === false ? 'bg-orange-50/50 border-l-4 border-l-orange-400' : ''}`}
                >
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      draggable={!isIntake}
                      onDragStart={(e) => handleDragStart(e, s)}
                      onDragEnd={handleDragEnd}
                      className={`select-none px-0.5 text-gray-400 ${isIntake ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing hover:text-gray-700'}`}
                      title={isIntake ? 'Cột chờ vào xưởng cố định ở đầu' : 'Kéo để sắp xếp lại'}
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
                    style={{ backgroundColor: s.color || '#0f766e' }}
                  >
                    {i + 1}
                  </div>
                  {!isIntake && (
                    <input
                      type="checkbox"
                      checked={bulkSelected.has(s.id)}
                      onChange={() => toggleBulk(s.id)}
                      className="rounded border-gray-300 cursor-pointer"
                      title="Chọn để chuyển phân loại hoặc gán trigger CRM hàng loạt"
                    />
                  )}
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
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200"
                          title="Cột TRIGGER SX — khi project chạm cột này, CRM tự đẩy deal về cột «Sản xuất» của pipeline tương ứng"
                        >
                          🔥 Trigger SX → CRM
                        </span>
                      )}
                      {s.is_handover_to_logistics && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
                          <Truck className="h-2.5 w-2.5" /> Bàn giao VC
                        </span>
                      )}
                      {s.is_switch_workshop_type && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 border border-violet-200">
                          <ArrowRightLeft className="h-2.5 w-2.5" />
                          → {s.target_workshop_type?.name || workshopTypes.find((t) => String(t.id) === String(s.target_workshop_type_id))?.name || 'Phân loại đích'}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                      {isIntake ? 'Deal thắng · chờ vào xưởng' : 'Cột pipeline xưởng'}
                      {s.is_active === false && (
                        <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 border border-orange-300 px-1.5 py-0.5 rounded font-semibold">
                          <EyeOff className="h-2.5 w-2.5" />
                          Đang ẩn trên Kanban
                        </span>
                      )}
                      {!isIntake && s.default_probability != null && s.default_probability !== '' && (
                        <span className="text-violet-600 font-medium">◎ {s.default_probability}% mặc định</span>
                      )}
                      {!isIntake && isPipelineStageSlaDisabled(s.sla_days) && (
                        <span className="bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded font-medium">
                          ⏱ Bỏ quá hạn cột
                        </span>
                      )}
                      {!isIntake && !isPipelineStageSlaDisabled(s.sla_days) && (
                        <span className="text-gray-500">
                          SLA {s.sla_days != null && s.sla_days !== '' ? `${s.sla_days} ngày` : '7 ngày (mặc định)'}
                        </span>
                      )}
                      {!isIntake && s.counts_as_won_revenue && (
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                          🏆 DT thắng
                        </span>
                      )}
                      {!isIntake && s.counts_as_completed_revenue && (
                        <span className="bg-teal-50 text-teal-800 border border-teal-200 px-1.5 py-0.5 rounded font-medium">
                          ✓ Đã công
                        </span>
                      )}
                      {!isIntake && s.counts_as_collected_revenue && (
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                          💰 Đã thu tiền
                        </span>
                      )}
                      {!isIntake && s.requires_deadline && (
                        <span className="bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded font-medium">
                          ⏰ DL bắt buộc
                        </span>
                      )}
                      {!isIntake && s.auto_add_members_on_enter && (
                        <span className="bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded font-medium">
                          👥 Tự thêm NV
                          {(() => {
                            const names = [
                              ...(Array.isArray(s.default_staff?.users) ? s.default_staff.users : []),
                              s.default_staff?.logistics_person,
                              s.default_staff?.installer_person,
                            ].filter(Boolean).map((u) => u.full_name || u.email).filter(Boolean);
                            if (!names.length) return '';
                            const preview = names.slice(0, 3).join(', ');
                            return `: ${preview}${names.length > 3 ? ` +${names.length - 3}` : ''}`;
                          })()}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!isIntake && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleCompletedRevenueColumn(s)}
                          className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                            s.counts_as_completed_revenue
                              ? 'bg-teal-100 text-teal-800 border-teal-300'
                              : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-teal-300 hover:text-teal-700'
                          }`}
                          title={s.counts_as_completed_revenue ? 'Đang tính «Đã công» / công nợ — nhấn để tắt' : 'Bật tính «Đã công» / công nợ cho cột này'}
                        >
                          <Hammer className="h-3 w-3" />
                          {s.counts_as_completed_revenue ? 'Đã công' : 'Công'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCollectedRevenueColumn(s)}
                          className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                            s.counts_as_collected_revenue
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-emerald-300 hover:text-emerald-700'
                          }`}
                          title={s.counts_as_collected_revenue ? 'Đang tính «Đã thu tiền» — nhấn để tắt' : 'Bật tính «Đã thu tiền» cho cột này'}
                        >
                          <Banknote className="h-3 w-3" />
                          {s.counts_as_collected_revenue ? 'Đã thu' : 'Thu tiền'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleRequiresDeadlineColumn(s)}
                          className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                            s.requires_deadline
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-rose-300 hover:text-rose-700'
                          }`}
                          title={
                            s.requires_deadline
                              ? 'Đang bắt buộc đặt deadline khi kéo thẻ tới cột này. Nhấn để tắt.'
                              : 'Bật để mỗi lần thẻ chuyển vào cột này hiện hộp chọn deadline.'
                          }
                        >
                          <Clock className="h-3 w-3" />
                          {s.requires_deadline ? 'DL bắt buộc' : 'Deadline'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSlaColumn(s)}
                        className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                          isPipelineStageSlaDisabled(s.sla_days)
                            ? 'bg-gray-200 text-gray-700 border-gray-300'
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-700'
                        }`}
                        title={isPipelineStageSlaDisabled(s.sla_days) ? 'Đang bỏ quá hạn cột — nhấn để bật SLA' : 'Bỏ ghi nhận quá hạn cột'}
                      >
                        <Clock className="h-3 w-3" />
                        {isPipelineStageSlaDisabled(s.sla_days) ? 'Đã bỏ QH' : 'Bỏ quá hạn'}
                      </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleActive(s)}
                      className={`h-7 px-2.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border shadow-sm transition-colors ${
                        s.is_active === false
                          ? 'bg-orange-100 text-orange-800 border-orange-300 ring-1 ring-orange-200 hover:bg-orange-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-orange-50 hover:text-orange-800 hover:border-orange-300'
                      }`}
                      title={s.is_active === false ? 'Hiện lại cột trên Kanban' : 'Ẩn cột trên Kanban'}
                    >
                      {s.is_active === false
                        ? <Eye className="h-3.5 w-3.5" />
                        : <EyeOff className="h-3.5 w-3.5" />}
                      {s.is_active === false ? 'Hiện' : 'Ẩn'}
                    </button>
                    <button type="button" onClick={() => requestEdit(s)} className="p-1.5 rounded hover:bg-teal-50 text-teal-600 cursor-pointer">
                      <Save className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => del(s.id, s.bucket_slug)} className="p-1.5 rounded hover:bg-red-50 text-red-500 cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  </div>
                </div>
              );
            })}
          </div>

          {(adding || editId) && (
            <div className="p-4 border-t bg-teal-50/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-gray-900">
                  {adding ? (
                    <span className="inline-flex items-center gap-1.5 text-teal-800">
                      <Plus className="h-4 w-4" /> Thêm cột mới
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-indigo-800">
                      <Save className="h-4 w-4" /> Sửa cột: {form.name || '…'}
                    </span>
                  )}
                </p>
                {adding && (
                  <span className="text-[10px] text-teal-700 bg-teal-100 border border-teal-200 px-2 py-0.5 rounded-full">
                    Nhấn «Tạo cột» để thêm — không phải «Lưu» cột cũ
                  </span>
                )}
              </div>
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
              {!editingIntake && (
                <>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 block mb-1">
                      Xác suất mặc định theo cột (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.default_probability ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, default_probability: e.target.value }))}
                      className="w-full max-w-[140px] h-8 px-3 border rounded-lg text-sm"
                      placeholder="Để trống = không fallback"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                      Khi dự án/deal chưa có % riêng, dashboard SX dùng % này cho giá trị có trọng số.
                    </p>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <label className="text-[10px] font-medium text-gray-500">SLA giai đoạn (ngày)</label>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({
                          ...f,
                          sla_days: isPipelineStageSlaDisabled(f.sla_days) ? '' : '0',
                        }))}
                        className={`h-7 px-2.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                          isPipelineStageSlaDisabled(form.sla_days)
                            ? 'bg-violet-100 text-violet-900 border-violet-300'
                            : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {isPipelineStageSlaDisabled(form.sla_days) ? 'Đã bỏ quá hạn cột' : 'Bỏ quá hạn cột'}
                      </button>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      disabled={isPipelineStageSlaDisabled(form.sla_days)}
                      value={isPipelineStageSlaDisabled(form.sla_days) ? '' : (form.sla_days ?? '')}
                      onChange={(e) => setForm((f) => ({ ...f, sla_days: e.target.value }))}
                      className="w-full max-w-[140px] h-8 px-3 border rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400"
                      placeholder={isPipelineStageSlaDisabled(form.sla_days) ? 'SLA tắt' : 'Trống = 7 ngày'}
                    />
                    <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                      Dự án không chuyển cột quá số ngày SLA → quá hạn trên Kanban SX. Trống = 7 ngày.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs cursor-pointer text-rose-900 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
                      <input
                        type="checkbox"
                        checked={!!form.requires_deadline}
                        onChange={(e) => setForm((f) => ({ ...f, requires_deadline: e.target.checked }))}
                        className="rounded border-rose-400"
                      />
                      <Clock className="h-3.5 w-3.5 text-rose-600" /> Bắt buộc đặt deadline khi kéo thẻ tới cột
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer text-amber-900 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                      <input
                        type="checkbox"
                        checked={!!form.counts_as_won_revenue}
                        onChange={(e) => setForm((f) => ({ ...f, counts_as_won_revenue: e.target.checked }))}
                        className="rounded border-amber-400"
                      />
                      <Trophy className="h-3.5 w-3.5 text-amber-600" /> Tính vào «Doanh thu thắng»
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer text-teal-900 bg-teal-50 px-2 py-1 rounded-lg border border-teal-200">
                      <input
                        type="checkbox"
                        checked={!!form.counts_as_completed_revenue}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          counts_as_completed_revenue: e.target.checked,
                          ...(e.target.checked ? { requires_deadline: false } : {}),
                        }))}
                        className="rounded border-teal-400"
                      />
                      <Hammer className="h-3.5 w-3.5 text-teal-600" /> Tính vào «Đã công» (công nợ nếu chưa thu)
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer text-emerald-900 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                      <input
                        type="checkbox"
                        checked={!!form.counts_as_collected_revenue}
                        onChange={(e) => setForm((f) => ({ ...f, counts_as_collected_revenue: e.target.checked }))}
                        className="rounded border-emerald-400"
                      />
                      <Banknote className="h-3.5 w-3.5 text-emerald-600" /> Tính vào «Đã thu tiền»
                    </label>
                  </div>
                </>
              )}
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
                  <div className="w-full space-y-2 p-2.5 rounded-lg bg-orange-50 border border-orange-200">
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.crm_sync_type === 'production'}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          crm_sync_type: e.target.checked ? 'production' : null,
                        }))}
                        className="mt-0.5 rounded border-orange-400 accent-orange-500"
                      />
                      <span>
                        <span className="flex items-center gap-1 font-semibold text-orange-700">
                          🔥 Cột Trigger SX → CRM
                        </span>
                        <span className="block text-[10px] text-orange-600 mt-0.5 leading-snug">
                          Khi project chạm cột này → CRM tự đẩy deal về cột có
                          <code className="mx-1 px-1 bg-white/70 rounded">sync_role=sx_production</code>
                          của pipeline tương ứng (auto multi-pipeline, multi-company).
                        </span>
                      </span>
                    </label>
                  </div>
                )}
                {!editingIntake && (
                  <details className="w-full">
                    <summary className="text-[10px] font-medium text-gray-500 cursor-pointer hover:text-gray-700">
                      📋 Nâng cao: Gán cứng → 1 cột CRM cụ thể
                    </summary>
                    <div className="mt-1 space-y-1">
                      <label className="text-[10px] font-medium text-blue-700 block">
                        Đồng bộ CRM khi vào cột:
                      </label>
                      <select
                        value={form.crm_target_stage_id || ''}
                        onChange={(e) => setForm((f) => ({ ...f, crm_target_stage_id: e.target.value, crm_sync_type: e.target.value ? null : f.crm_sync_type }))}
                        className="w-full h-8 px-2 border rounded-lg text-sm bg-white border-blue-200 focus:border-blue-400"
                      >
                        <option value="">— Không —</option>
                        {(() => {
                          const sxStages = crmStages.filter(
                            (cs) => !cs.is_lost && !cs.is_won && cs.sync_role === 'sx_production',
                          );
                          if (sxStages.length === 0) {
                            return (
                              <option value="" disabled>
                                Chưa có cột CRM nào tích «Sản xuất» — vào Cài đặt CRM gán sync_role=sx_production
                              </option>
                            );
                          }
                          return sxStages.map((cs) => (
                            <option key={cs.id} value={cs.id}>
                              {cs.icon ? `${cs.icon} ` : ''}{cs.name}
                            </option>
                          ));
                        })()}
                      </select>
                      <p className="text-[10px] text-gray-500 leading-snug">
                        Chỉ dùng khi cần đẩy về <em>chính xác 1 cột</em> (override checkbox trigger ở trên).
                      </p>
                    </div>
                  </details>
                )}
                {!editingIntake && (
                  <label
                    className="flex items-start gap-2 text-xs cursor-pointer"
                    title="Khi thẻ vào cột này có thể bàn giao sang module Lắp đặt."
                  >
                    <input
                      type="checkbox"
                      checked={form.is_handover_to_logistics}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setForm((f) => ({
                          ...f,
                          is_handover_to_logistics: on,
                          ...(on ? {
                            crm_sync_type: null,
                            crm_target_stage_id: '',
                            is_switch_workshop_type: false,
                            target_workshop_type_id: '',
                          } : {}),
                        }));
                      }}
                      className="mt-0.5 rounded border-orange-400 accent-orange-500"
                    />
                    <span>
                      <span className="flex items-center gap-1 font-medium text-orange-700">
                        <Truck className="h-3.5 w-3.5" /> Bàn giao VC
                      </span>
                      <span className="block text-[10px] text-orange-600/90 mt-0.5 leading-snug">
                        Bật để hiện nút bàn giao Vận chuyển khi kéo thẻ vào cột này. Người phụ trách VC/LĐ cấu hình tại{' '}
                        <Link to="/vc/pipeline-settings" className="underline font-medium hover:text-orange-800">Pipeline VC</Link>.
                        Không đổi phụ trách CRM và SX.
                      </span>
                    </span>
                  </label>
                )}
                {!editingIntake && (
                  <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form.is_switch_workshop_type}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setForm((f) => ({
                            ...f,
                            is_switch_workshop_type: on,
                            ...(on ? {
                              is_handover_to_logistics: false,
                              crm_sync_type: null,
                              crm_target_stage_id: '',
                            } : { target_workshop_type_id: '' }),
                          }));
                        }}
                        className="mt-0.5 rounded border-violet-400 accent-violet-600"
                      />
                      <span>
                        <span className="flex items-center gap-1 font-medium text-violet-800">
                          <ArrowRightLeft className="h-3.5 w-3.5" /> Chuyển phân loại
                        </span>
                        <span className="block text-[10px] text-violet-700/90 mt-0.5 leading-snug">
                          Khi kéo thẻ vào cột này, hiện hộp xác nhận chuyển sang phân loại khác (vd: Data đầu vào → Data đầu ra, cột đầu pipeline).
                        </span>
                      </span>
                    </label>
                    {form.is_switch_workshop_type && (
                      <div>
                        <label className="text-[10px] font-medium text-violet-700 block mb-1">Phân loại đích *</label>
                        <select
                          value={form.target_workshop_type_id}
                          onChange={(e) => setForm((f) => ({ ...f, target_workshop_type_id: e.target.value }))}
                          className="w-full max-w-sm h-8 px-2 border border-violet-200 rounded-lg text-xs bg-white"
                        >
                          <option value="">— Chọn phân loại đích —</option>
                          {workshopTypes
                            .filter((t) => String(t.id) !== String(currentWorkshopTypeId || ''))
                            .map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
                {!editingIntake && (
                  <div className="w-full space-y-2 p-3 rounded-lg border border-indigo-200 bg-indigo-50/50">
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form.auto_add_members_on_enter}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm((f) => ({ ...f, auto_add_members_on_enter: checked }));
                          if (checked) ensureStageStaffDefaultCompany();
                        }}
                        className="mt-0.5 rounded border-indigo-400 accent-indigo-600"
                      />
                      <span>
                        <span className="flex items-center gap-1 font-semibold text-indigo-800">
                          <UserCircle className="h-3.5 w-3.5" /> Tự thêm thành viên khi kéo vào cột
                        </span>
                        <span className="block text-[10px] text-indigo-700/90 mt-0.5 leading-snug">
                          Mỗi lần dự án chuyển vào cột này, hệ thống gộp NV đã chọn vào tab Thành viên deal.
                          Có thể cấu hình đội SX, phụ trách vận chuyển và người lắp đặt — <strong className="font-semibold">không ghi đè</strong> phụ trách CRM/SX/VC đã có.
                        </span>
                      </span>
                    </label>
                    {form.auto_add_members_on_enter && (
                      <div className="space-y-2 pl-1">
                        {stageStaffSelectedUsers.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {stageStaffSelectedUsers.map((u) => (
                              <span
                                key={`picked-${u.id}`}
                                className="inline-flex items-center gap-1 max-w-[180px] truncate rounded-full bg-white border border-indigo-200 px-2 py-0.5 text-[10px] text-indigo-800"
                                title={u.full_name || u.email}
                              >
                                {u.full_name || u.email}
                                {String(u.id) === String(form.stage_staff_primary_user_id) ? ' ★' : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="grid gap-2 sm:grid-cols-3 max-w-3xl">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1">
                              <Globe className="h-3 w-3" /> Khối
                            </span>
                            <select
                              value={stageStaffFilterDivisionId}
                              onChange={(e) => {
                                setStageStaffFilterDivisionId(e.target.value);
                                setStageStaffPickerCompanies([]);
                              }}
                              className="h-8 px-2 border border-indigo-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-300"
                            >
                              <option value="">— Mọi khối —</option>
                              {stageStaffDivisions.map((d) => (
                                <option key={d.id} value={d.id}>{d.short_name || d.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> Công ty
                            </span>
                            <select
                              value={stageStaffFilterCompanyId}
                              onChange={(e) => setStageStaffFilterCompanyId(e.target.value)}
                              className="h-8 px-2 border border-indigo-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-300"
                            >
                              <option value="">— Chọn công ty —</option>
                              {stageStaffPickerCompaniesSorted.map((c) => (
                                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1">
                              <Search className="h-3 w-3" /> Tìm tên
                            </span>
                            <input
                              value={stageStaffSearch}
                              disabled={!stageStaffFilterCompanyId}
                              onChange={(e) => setStageStaffSearch(e.target.value)}
                              placeholder="Tên hoặc email…"
                              className="h-8 px-2 border border-indigo-200 rounded-lg text-xs bg-white disabled:bg-gray-100"
                            />
                          </label>
                        </div>
                        {!stageStaffFilterCompanyId ? (
                          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                            Chọn khối (tuỳ chọn) rồi chọn công ty — có thể chọn NV từ khối/công ty khác công ty pipeline.
                          </p>
                        ) : stageStaffBrowseLoading ? (
                          <p className="text-[10px] text-gray-500 flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin" /> Đang tải nhân viên…
                          </p>
                        ) : (
                          <>
                            <div className="grid gap-2 sm:grid-cols-2 max-w-2xl">
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold text-orange-700 uppercase tracking-wide flex items-center gap-1">
                                  <Truck className="h-3 w-3" /> Phụ trách vận chuyển
                                </span>
                                <select
                                  value={form.stage_logistics_person_id || ''}
                                  onChange={(e) => setForm((f) => ({ ...f, stage_logistics_person_id: e.target.value }))}
                                  className="h-8 px-2 border border-orange-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-orange-300"
                                >
                                  <option value="">— Không gán —</option>
                                  {stageStaffFilteredBrowseUsers.map((u) => (
                                    <option key={`log-${u.id}`} value={u.id}>{u.full_name || u.email}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                                  <Wrench className="h-3 w-3" /> Người lắp đặt
                                </span>
                                <select
                                  value={form.stage_installer_person_id || ''}
                                  onChange={(e) => setForm((f) => ({ ...f, stage_installer_person_id: e.target.value }))}
                                  className="h-8 px-2 border border-amber-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-amber-300"
                                >
                                  <option value="">— Không gán —</option>
                                  {stageStaffFilteredBrowseUsers.map((u) => (
                                    <option key={`ins-${u.id}`} value={u.id}>{u.full_name || u.email}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <label className="flex flex-col gap-1 max-w-sm">
                              <span className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">Phụ trách SX ★ (chỉ khi dự án chưa có)</span>
                              <select
                                value={form.stage_staff_primary_user_id || ''}
                                onChange={(e) => setStageStaffPrimary(e.target.value)}
                                className="h-8 px-2 border border-indigo-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-300"
                              >
                                <option value="">— Chọn phụ trách —</option>
                                {(stageStaffSelectedUsers.length ? stageStaffSelectedUsers : stageStaffFilteredBrowseUsers).map((u) => (
                                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                                ))}
                              </select>
                            </label>
                            <p className="text-[10px] text-gray-500">Đội sản xuất (chọn nhiều):</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-36 overflow-y-auto rounded border border-indigo-100 bg-white p-2">
                              {!stageStaffFilteredBrowseUsers.length ? (
                                <p className="text-[10px] text-gray-400 px-1 py-2">Không có nhân viên phù hợp.</p>
                              ) : stageStaffFilteredBrowseUsers.map((u) => {
                                const checked = (form.stage_staff_user_ids || []).includes(String(u.id));
                                const isPrimary = String(u.id) === String(form.stage_staff_primary_user_id);
                                return (
                                  <label
                                    key={`stage-staff-${u.id}`}
                                    className={`inline-flex items-center gap-1.5 text-xs cursor-pointer select-none px-2 py-1 rounded-md border transition-colors ${
                                      isPrimary
                                        ? 'bg-amber-50 border-amber-300 text-amber-900 ring-1 ring-amber-200'
                                        : checked
                                          ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                          : 'bg-gray-50/50 border-transparent text-gray-700 hover:bg-gray-100'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                      checked={checked}
                                      onChange={() => toggleStageStaffUser(u.id, u)}
                                    />
                                    <span>{u.full_name || u.email}{isPrimary ? ' ★' : ''}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={adding ? saveNew : saveEdit}
                  disabled={saving}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
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

          {!adding && !editId && !hasIntake && (
            <div className="p-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
              Chưa có cột «deal thắng» — cần tạo cột với <code>bucket_slug: &apos;won_pending&apos;</code>.
            </div>
          )}
        </div>
      )}

      </div>{/* /left column */}

      <aside className="xl:sticky xl:top-3 space-y-3 min-w-0">
        <div id="sx-workshop-type-section" className="scroll-mt-4 transition shadow-sm rounded-xl">
          <WorkshopTypeSettingsSection
            moduleContext="production"
            accent="teal"
            layout="sidebar"
            onTypesChanged={loadWorkshopTypes}
            {...(isAdmin ? { companyId: settingsCompanyId, onCompanyIdChange: setSettingsCompanyId } : {})}
          />
        </div>
      </aside>
      </div>{/* /grid */}
    </div>
  );
}
