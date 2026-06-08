import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { Settings, Plus, Trash2, Save, GripVertical, ChevronRight, Trophy, XCircle, Eye, EyeOff, MessageCircle, Loader2, Calendar, CheckCircle2, Clock, Factory, Search, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { resolveDefaultCrmAdminCompanyId, setStoredCrmFilterCompanyId } from '../lib/crmCompanyFilter';
import { isPipelineStageSlaDisabled } from '../lib/crmPipelineSla';

/** Hai mẫu theo tài liệu Zalo / ví dụ template ngắn — ID chỉ để thử form; OA thật cần template_id của bạn */
const ZALO_TEST_PRESETS = [
  {
    key: 'won566121',
    label: 'Deal Thắng (566121 — mặc định)',
    phone: '84987654321',
    templateId: '566121',
    templateJson: `{
  "ten_san_pham": "Tủ bếp nhôm cánh kính",
  "order_code": "BG-002",
  "date": "13/04/2026",
  "ten_khach_hang": "Tên"
}`,
  },
  {
    key: 'won565773',
    label: 'Mẫu 3 biến (565773)',
    phone: '84987654321',
    templateId: '565773',
    templateJson: `{
  "ten_san_pham": "Tủ bếp acrylic",
  "order_code": "DEAL-0001",
  "ten_khach_hang": "Nguyễn Văn A"
}`,
  },
  {
    key: 'doc',
    label: 'Mẫu tài liệu Zalo',
    phone: '84987654321',
    templateId: '7895417a7d3f9461cd2e',
    templateJson: `{
  "ky": "1",
  "thang": "4/2020",
  "start_date": "20/03/2020",
  "end_date": "20/04/2020",
  "customer": "Nguyễn Thị Hoàng Anh",
  "cid": "PE010299485",
  "address": "VNG Campus, TP.HCM",
  "amount": "100",
  "total": "100000"
}`,
  },
];

const ZALO_TEST_DEFAULT = ZALO_TEST_PRESETS[0];

/** Key gửi lên Zalo — value rỗng; server điền từ deal. Lưu qua API, dùng cho nút «Gửi Zalo» trên chi tiết deal. */
const DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY = `{
  "ten_san_pham": "",
  "order_code": "",
  "date": "",
  "ten_khach_hang": ""
}`;

const COLORS = ['#94A3B8','#3B82F6','#8B5CF6','#F59E0B','#F97316','#10B981','#EF4444','#EC4899','#06B6D4','#6366F1'];
const ICONS = ['🆕','📞','💬','📋','📧','⏳','🤝','💰','📝','✅','❌','🎯','🔥','⭐','🏆'];

export default function PipelineSettingsPage() {
  const { user } = useAuth();
  const [stages, setStages] = useState([]);
  const [sxStages, setSxStages] = useState([]);
  const [vcStages, setVcStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [activeType, setActiveType] = useState('lead');
  const [adding, setAdding] = useState(null);
  // Modal «Gán cột SX» cho stage CRM có sync_role=sx_production (cross-company)
  const [sxAssignModal, setSxAssignModal] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    color: '#94A3B8',
    icon: '🆕',
    description: '',
    is_won: false,
    is_lost: false,
    counts_as_won_revenue: false,
    counts_as_completed_revenue: false,
    send_zalo_on_enter: false,
    create_event_on_enter: false,
    sync_role: '',
    default_probability: '',
    requires_deadline: false,
  });
  const isAdmin = isAdminLike(user);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [zaloExpanded, setZaloExpanded] = useState(false);
  const [zaloPipelineExpanded, setZaloPipelineExpanded] = useState(false);

  const [zaloSettings, setZaloSettings] = useState(null);
  const [zaloLoading, setZaloLoading] = useState(false);
  const [zaloTestPhone, setZaloTestPhone] = useState(ZALO_TEST_DEFAULT.phone);
  const [zaloTestJson, setZaloTestJson] = useState(ZALO_TEST_DEFAULT.templateJson);
  const [zaloTestToken, setZaloTestToken] = useState('');
  const [zaloTestTemplateId, setZaloTestTemplateId] = useState(ZALO_TEST_DEFAULT.templateId);
  const [zaloTestSending, setZaloTestSending] = useState(false);
  const [zaloTestResult, setZaloTestResult] = useState(null);

  const [pipelines, setPipelines] = useState([]);
  /** Lỗi tải /crm/pipelines (VD thiếu bảng trên Supabase) */
  const [pipelinesLoadError, setPipelinesLoadError] = useState(null);
  const [zaloPlId, setZaloPlId] = useState('');
  const [zaloPlDetail, setZaloPlDetail] = useState(null);
  const [zaloPlTemplateId, setZaloPlTemplateId] = useState('');
  const [zaloPlMergeJson, setZaloPlMergeJson] = useState('{}');
  const [zaloPlSaving, setZaloPlSaving] = useState(false);
  const [zaloStructureJson, setZaloStructureJson] = useState(DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY);

  // Copy pipeline (admin)
  const [copyFromId, setCopyFromId] = useState('');
  const [copyToCompanyId, setCopyToCompanyId] = useState('');
  const [copyName, setCopyName] = useState('');
  const [copySetDefault, setCopySetDefault] = useState(false);
  const [copying, setCopying] = useState(false);

  // Lead/Deal types (company-scoped)
  const [leadTypes, setLeadTypes] = useState([]);
  const [leadTypesLoading, setLeadTypesLoading] = useState(false);
  const [leadTypeNew, setLeadTypeNew] = useState({
    name: '',
    applies_to: 'both',
    is_active: true,
    workshop_production_templates: false,
    default_production_company_id: '',
  });
  const [productionCompaniesForSx, setProductionCompaniesForSx] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pipelinesRes, companiesRes] = await Promise.all([
        api.get('/crm/pipelines').catch(() => ({ data: [] })),
        api.get('/companies', { params: { for_module: 'crm' } }).catch(() => ({ data: { companies: [] } })),
      ]);
      const pls = Array.isArray(pipelinesRes.data) ? pipelinesRes.data : [];
      setPipelines(pls);
      const cos = companiesRes.data?.companies || companiesRes.data || [];
      setCompanies(Array.isArray(cos) ? cos : []);

      // Resolve selectedCompanyId (admin: keep existing; non-admin: lock to user.company_id)
      const lockedCompanyId = !isAdmin ? (user?.company_id ? String(user.company_id) : '') : '';
      const companyIdToUse = lockedCompanyId || selectedCompanyId || (isAdmin ? '' : '');
      const cidWx = companyIdToUse || (isAdmin && cos[0]?.id ? String(cos[0].id) : '');
      const wxParams = { all: 'true', ...(cidWx ? { company_id: cidWx } : {}) };
      const [sxRes, vcRes] = await Promise.all([
        api.get('/production/pipeline-stages', { params: wxParams }).catch(() => ({ data: [] })),
        api.get('/logistics/pipeline-stages', { params: wxParams }).catch(() => ({ data: [] })),
      ]);
      if (!lockedCompanyId && selectedCompanyId === '' && isAdmin && cos?.length) {
        const def = resolveDefaultCrmAdminCompanyId(Array.isArray(cos) ? cos : []);
        if (def) setSelectedCompanyId(def);
      }
      if (lockedCompanyId) setSelectedCompanyId(lockedCompanyId);

      const pipelinesForCompany =
        (companyIdToUse ? pls.filter((p) => String(p.company_id || '') === String(companyIdToUse)) : pls);
      const defaultPipeline =
        pipelinesForCompany.find((p) => p.is_default) || pipelinesForCompany[0] || null;
      const pipelineIdToUse = selectedPipelineId && pipelinesForCompany.some((p) => p.id === selectedPipelineId)
        ? selectedPipelineId
        : (defaultPipeline?.id || '');

      // Admin chọn công ty nhưng công ty chưa có pipeline → không load stages (tránh fallback load tất cả stage)
      if (isAdmin && companyIdToUse && !pipelineIdToUse) {
        setSelectedPipelineId('');
        setStages([]);
      } else {
        if (pipelineIdToUse && pipelineIdToUse !== selectedPipelineId) setSelectedPipelineId(pipelineIdToUse);
        const crmRes = await api.get('/crm/pipeline-stages', {
          params: { all: 'true', ...(pipelineIdToUse ? { pipeline_id: pipelineIdToUse } : {}) },
        }).catch(() => ({ data: [] }));
        setStages(crmRes.data || []);
      }
      setSxStages((sxRes.data || []).filter((s) => s.bucket_slug !== 'won_pending'));
      setVcStages((vcRes.data || []).filter((s) => s.bucket_slug !== 'delivery_pending'));
    } catch {}
    setLoading(false);
  }, [isAdmin, selectedCompanyId, selectedPipelineId, user?.company_id]);

  // Load Lead/Deal types for selected company
  useEffect(() => {
    const cid = selectedCompanyId || user?.company_id;
    if (!cid) {
      setLeadTypes([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLeadTypesLoading(true);
      try {
        const { data } = await api.get('/crm/lead-types', { params: { company_id: cid, all: 'true' } });
        if (!cancelled) setLeadTypes(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setLeadTypes([]);
      } finally {
        if (!cancelled) setLeadTypesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId, user?.company_id]);

  useEffect(() => {
    api
      .get('/companies', { params: { for_module: 'production' } })
      .then((r) => {
        const cos = r.data?.companies || r.data || [];
        setProductionCompaniesForSx(Array.isArray(cos) ? cos : []);
      })
      .catch(() => setProductionCompaniesForSx([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadZalo = async () => {
    setZaloLoading(true);
    try {
      const { data } = await api.get('/crm/zalo-notify-settings');
      setZaloSettings(data || {});
      const ts = data?.template_structure;
      if (ts && typeof ts === 'object' && !Array.isArray(ts) && Object.keys(ts).length > 0) {
        setZaloStructureJson(JSON.stringify(ts, null, 2));
      } else {
        setZaloStructureJson(DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY);
      }
    } catch {
      setZaloSettings({ enabled: false, template_id: '', sending_mode: '1', has_token: false, merge_template_data: {}, template_structure: null });
      setZaloStructureJson(DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY);
    }
    setZaloLoading(false);
  };
  useEffect(() => { loadZalo(); }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get('/crm/pipelines');
        if (cancel) return;
        const list = Array.isArray(data) ? data : [];
        setPipelinesLoadError(null);
        setPipelines(list);
        setZaloPlId((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          return list[0]?.id || '';
        });
        setCopyFromId((prev) => (prev && list.some((p) => p.id === prev) ? prev : (list[0]?.id || '')));
      } catch (e) {
        if (cancel) return;
        const d = e.response?.data;
        const code = d?.code;
        const msg = d?.error || e.message || 'Không tải được danh sách pipeline';
        setPipelines([]);
        setPipelinesLoadError(
          code === 'CRM_PIPELINES_TABLE_MISSING'
            ? { code, message: msg }
            : { code: code || 'UNKNOWN', message: msg },
        );
      }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (!zaloPlId) {
      setZaloPlDetail(null);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get(`/crm/pipelines/${zaloPlId}`);
        if (cancel) return;
        setZaloPlDetail(data || null);
      } catch {
        if (!cancel) setZaloPlDetail(null);
      }
    })();
    return () => { cancel = true; };
  }, [zaloPlId]);

  useEffect(() => {
    if (!zaloPlDetail) return;
    setZaloPlTemplateId(zaloPlDetail.zalo_template_id != null ? String(zaloPlDetail.zalo_template_id) : '');
    const m = zaloPlDetail.zalo_merge_template_data;
    const obj = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
    setZaloPlMergeJson(JSON.stringify(obj, null, 2));
  }, [zaloPlDetail]);

  const savePipelineZalo = async () => {
    if (!zaloPlId) return;
    let merge = {};
    try {
      merge = zaloPlMergeJson.trim() ? JSON.parse(zaloPlMergeJson) : {};
      if (typeof merge !== 'object' || merge === null || Array.isArray(merge)) {
        throw new Error('merge phải là object JSON (không phải mảng)');
      }
    } catch (e) {
      alert(e.message || 'JSON không hợp lệ');
      return;
    }
    setZaloPlSaving(true);
    try {
      await api.put(`/crm/pipelines/${zaloPlId}`, {
        zalo_template_id: zaloPlTemplateId.trim() || null,
        zalo_merge_template_data: merge,
      });
      const { data } = await api.get(`/crm/pipelines/${zaloPlId}`);
      setZaloPlDetail(data || null);
      alert('Đã lưu Zalo cho pipeline này');
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    } finally {
      setZaloPlSaving(false);
    }
  };

  const saveZaloMaster = async (patch) => {
    try {
      const { data } = await api.put('/crm/zalo-notify-settings', patch);
      setZaloSettings(data);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu Zalo');
      loadZalo();
    }
  };

  const saveZaloForm = async () => {
    let template_structure;
    try {
      const raw = zaloStructureJson.trim();
      if (!raw) {
        template_structure = null;
      } else {
        const parsed = JSON.parse(raw);
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Cấu trúc template phải là object JSON (không phải mảng)');
        }
        template_structure = Object.keys(parsed).length ? parsed : null;
      }
    } catch (e) {
      alert(e.message || 'JSON cấu trúc template không hợp lệ');
      return;
    }
    try {
      const body = {
        enabled: !!zaloSettings?.enabled,
        template_id: zaloSettings?.template_id || '',
        sending_mode: zaloSettings?.sending_mode || '1',
        merge_template_data: zaloSettings?.merge_template_data || {},
        template_structure,
      };
      if (zaloTestToken.trim()) body.access_token = zaloTestToken.trim();
      const { data } = await api.put('/crm/zalo-notify-settings', body);
      setZaloSettings(data);
      const ts = data?.template_structure;
      if (ts && typeof ts === 'object' && !Array.isArray(ts) && Object.keys(ts).length > 0) {
        setZaloStructureJson(JSON.stringify(ts, null, 2));
      } else {
        setZaloStructureJson(DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY);
      }
      setZaloTestToken('');
      alert('Đã lưu cấu hình Zalo OA');
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const applyZaloTestPreset = (preset) => {
    setZaloTestPhone(preset.phone);
    setZaloTestTemplateId(preset.templateId);
    setZaloTestJson(preset.templateJson);
    setZaloTestResult(null);
  };

  const runZaloTest = async () => {
    let template_data;
    try {
      template_data = JSON.parse(zaloTestJson || '{}');
    } catch {
      return alert('template_data không phải JSON hợp lệ');
    }
    setZaloTestSending(true);
    setZaloTestResult(null);
    try {
      const { data } = await api.post('/crm/zalo-notify-test', {
        phone: zaloTestPhone.trim(),
        template_data,
        ...(zaloTestToken.trim() ? { access_token: zaloTestToken.trim() } : {}),
        ...(zaloTestTemplateId.trim() ? { template_id: zaloTestTemplateId.trim() } : {}),
      });
      setZaloTestResult(data);
    } catch (e) {
      setZaloTestResult({ ok: false, error: e.response?.data?.error || e.message });
    }
    setZaloTestSending(false);
  };

  const toggleZaloColumn = async (stage) => {
    if (stage.pipeline_type !== 'deal') return;
    try {
      await api.put(`/crm/pipeline-stages/${stage.id}`, { send_zalo_on_enter: !stage.send_zalo_on_enter });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const toggleCreateEventColumn = async (stage) => {
    if (stage.pipeline_type !== 'deal') return;
    try {
      await api.put(`/crm/pipeline-stages/${stage.id}`, { create_event_on_enter: !stage.create_event_on_enter });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  /**
   * Bật/tắt nhanh “Cột Thắng” (is_won) cho stage deal. Mỗi pipeline chỉ nên có một
   * cột Thắng — KPI “Doanh thu thắng” cộng đúng theo cột này.
   */
  /**
   * Bật/tắt nhanh "Cột Mất" (is_lost) cho stage deal/lead. Lead/Deal nằm ở cột này sẽ
   * bị KPI bỏ qua: không tính SLA, không tính trễ NV, không cộng/trừ điểm.
   */
  const toggleLostColumn = async (stage) => {
    const turningOn = !stage.is_lost;
    try {
      await api.put(`/crm/pipeline-stages/${stage.id}`, {
        is_lost: turningOn,
        is_won: turningOn ? false : stage.is_won,
      });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  /** Bật/tắt bắt buộc đặt deadline khi kéo thẻ tới cột này. */
  const toggleRequiresDeadlineColumn = async (stage) => {
    if (stage.is_won || stage.is_lost) return;
    try {
      await api.put(`/crm/pipeline-stages/${stage.id}`, { requires_deadline: !stage.requires_deadline });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  /** Bật/tắt ghi nhận quá hạn khi lead/deal không chuyển tiếp khỏi cột (sla_days=0). */
  const toggleSlaColumn = async (stage) => {
    if (stage.is_won || stage.is_lost) return;
    const turningOff = !isPipelineStageSlaDisabled(stage.sla_days);
    try {
      await api.put(`/crm/pipeline-stages/${stage.id}`, {
        sla_days: turningOff ? 0 : null,
      });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const toggleWonColumn = async (stage) => {
    if (stage.pipeline_type !== 'deal') return;
    const turningOn = !stage.is_won;
    if (turningOn) {
      const others = (stages || []).filter(
        (s) => s.pipeline_id === stage.pipeline_id && s.id !== stage.id && s.is_won,
      );
      if (others.length) {
        const ok = confirm(
          `Pipeline đang có ${others.length} cột khác đang đánh dấu Thắng. Tắt các cột đó và đặt "${stage.name}" làm cột Thắng duy nhất?`,
        );
        if (!ok) return;
      }
    }
    try {
      if (turningOn) {
        const others = (stages || []).filter(
          (s) => s.pipeline_id === stage.pipeline_id && s.id !== stage.id && s.is_won,
        );
        for (const o of others) {
          await api.put(`/crm/pipeline-stages/${o.id}`, { is_won: false });
        }
      }
      await api.put(`/crm/pipeline-stages/${stage.id}`, {
        is_won: turningOn,
        is_lost: turningOn ? false : stage.is_lost,
      });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const visiblePipelines = useMemo(() => {
    if (!isAdmin) return pipelines || [];
    if (!selectedCompanyId) return pipelines || [];
    return (pipelines || []).filter((p) => String(p.company_id || '') === String(selectedCompanyId));
  }, [pipelines, isAdmin, selectedCompanyId]);

  useEffect(() => {
    if (!zaloPlId) return;
    if (!zaloPipelineExpanded) return;
    const ok = visiblePipelines.some((p) => p.id === zaloPlId);
    if (!ok) setZaloPlId(visiblePipelines[0]?.id || '');
  }, [zaloPlId, visiblePipelines, zaloPipelineExpanded]);

  const filtered = stages.filter(s => s.pipeline_type === activeType).sort((a, b) => a.order_index - b.order_index);
  const otherType = activeType === 'lead' ? 'deal' : 'lead';
  const otherFiltered = stages.filter(s => s.pipeline_type === otherType).sort((a, b) => a.order_index - b.order_index);

  const startAdd = (type) => {
    setAdding(type);
    setEditId(null);
    setForm({
      name: '',
      color: COLORS[filtered.length % COLORS.length],
      icon: '🆕',
      description: '',
      is_won: false,
      is_lost: false,
      counts_as_won_revenue: false,
      counts_as_completed_revenue: false,
      send_zalo_on_enter: false,
      create_event_on_enter: false,
      sync_role: '',
      default_probability: '',
      sla_days: '',
      requires_deadline: false,
    });
  };

  const startEdit = (stage) => {
    setEditId(stage.id);
    setAdding(null);
    setForm({
      name: stage.name,
      color: stage.color,
      icon: stage.icon || '',
      description: stage.description != null ? String(stage.description) : '',
      is_won: stage.is_won,
      is_lost: stage.is_lost,
      counts_as_won_revenue: !!stage.counts_as_won_revenue,
      counts_as_completed_revenue: !!stage.counts_as_completed_revenue,
      send_zalo_on_enter: !!stage.send_zalo_on_enter,
      create_event_on_enter: !!stage.create_event_on_enter,
      sync_role: stage.sync_role || '',
      default_probability: stage.default_probability != null && stage.default_probability !== '' ? String(stage.default_probability) : '',
      sla_days: stage.sla_days != null && stage.sla_days !== '' ? String(stage.sla_days) : '',
      requires_deadline: !!stage.requires_deadline,
    });
  };

  const saveNew = async () => {
    if (!form.name.trim()) return alert('Nhập tên giai đoạn');
    try {
      if (!selectedPipelineId) return alert('Chọn pipeline trước');
      const payload = { ...form, pipeline_type: adding, pipeline_id: selectedPipelineId };
      if (payload.default_probability === '') delete payload.default_probability;
      if (payload.sla_days === '' || payload.sla_days == null) delete payload.sla_days;
      else payload.sla_days = Number(payload.sla_days);
      await api.post('/crm/pipeline-stages', payload);
      setAdding(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const saveEdit = async () => {
    if (!form.name.trim()) return alert('Nhập tên giai đoạn');
    try {
      const payload = { ...form };
      if (payload.default_probability === '') payload.default_probability = null;
      if (payload.sla_days === '' || payload.sla_days == null) payload.sla_days = null;
      else payload.sla_days = Number(payload.sla_days);
      await api.put(`/crm/pipeline-stages/${editId}`, payload);
      setEditId(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const del = async (id) => {
    if (!confirm('Xóa giai đoạn này?')) return;
    try {
      await api.delete(`/crm/pipeline-stages/${id}`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const toggleActive = async (stage) => {
    try {
      await api.put(`/crm/pipeline-stages/${stage.id}`, { is_active: !stage.is_active });
      load();
    } catch (e) { alert('Lỗi'); }
  };

  const moveStage = async (stage, dir) => {
    // Dùng đúng type của stage (không phụ thuộc activeType) để tránh nhầm list
    const list = stages
      .filter((s) => s.pipeline_type === stage.pipeline_type)
      .sort((a, b) => a.order_index - b.order_index);
    const idx = list.findIndex((s) => s.id === stage.id);
    if (idx < 0 || (dir === -1 && idx === 0) || (dir === 1 && idx === list.length - 1)) return;
    const newList = [...list];
    [newList[idx], newList[idx + dir]] = [newList[idx + dir], newList[idx]];
    const reorder = newList.map((s, i) => ({ id: s.id, order_index: i + 1 }));
    try {
      await api.put('/crm/pipeline-stages-reorder', { stages: reorder });
      load();
    } catch (e) { alert('Lỗi sắp xếp: ' + (e.response?.data?.error || e.message)); }
  };

  // ─── Kéo thả sắp xếp stage ─────────────────────────────────────────────────
  const handleDragStart = (e, stage) => {
    setDraggingId(stage.id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', stage.id); } catch (_) {}
  };
  const handleDragEnd = () => { setDraggingId(null); setDragOverId(null); };
  const handleDragOver = (e, stage) => {
    if (!draggingId || draggingId === stage.id) return;
    const dragging = stages.find((s) => s.id === draggingId);
    if (!dragging || dragging.pipeline_type !== stage.pipeline_type) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== stage.id) setDragOverId(stage.id);
  };
  const handleDrop = async (e, target) => {
    e.preventDefault();
    const sourceId = draggingId || e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === target.id) return;
    const source = stages.find((s) => s.id === sourceId);
    if (!source || source.pipeline_type !== target.pipeline_type) return;

    const list = stages
      .filter((s) => s.pipeline_type === target.pipeline_type)
      .sort((a, b) => a.order_index - b.order_index);
    const fromIdx = list.findIndex((s) => s.id === source.id);
    const toIdx   = list.findIndex((s) => s.id === target.id);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const newList = [...list];
    const [moved] = newList.splice(fromIdx, 1);
    newList.splice(toIdx, 0, moved);
    const reorder = newList.map((s, i) => ({ id: s.id, order_index: i + 1 }));

    // Optimistic update
    setStages((prev) => prev.map((s) => {
      const idx = newList.findIndex((x) => x.id === s.id);
      return idx >= 0 ? { ...s, order_index: idx + 1 } : s;
    }));
    try {
      await api.put('/crm/pipeline-stages-reorder', { stages: reorder });
      load();
    } catch (err) {
      alert('Lỗi sắp xếp: ' + (err.response?.data?.error || err.message));
      load();
    }
  };

  /** Cập nhật crm_target_stage_id trên SX hoặc VC stage từ phía CRM */
  const setModuleStageTarget = async (moduleStage, moduleType, targetCrmStageId) => {
    const endpoint = moduleType === 'sx'
      ? `/production/pipeline-stages/${moduleStage.id}`
      : `/logistics/pipeline-stages/${moduleStage.id}`;
    try {
      await api.put(endpoint, { crm_target_stage_id: targetCrmStageId || null });
      load();
    } catch (e) {
      alert('Lỗi cập nhật: ' + (e.response?.data?.error || e.message));
    }
  };

  /** Gán role auto-sync cho cột VC/LĐ (delivery|installation) cho từng cột. */
  const setVcSyncType = async (moduleStage, syncType) => {
    if (!moduleStage?.id) return;
    const nextType = moduleStage.crm_sync_type === syncType ? null : syncType;
    try {
      await api.put(`/logistics/pipeline-stages/${moduleStage.id}`, {
        crm_sync_type: nextType,
        ...(nextType ? { crm_target_stage_id: null } : {}),
      });
      load();
    } catch (e) {
      alert('Lỗi cập nhật role VC/LĐ: ' + (e.response?.data?.error || e.message));
    }
  };

  /** Gán role auto-sync VC/LĐ hàng loạt cho nhiều cột đã chọn. */
  const bulkSetVcSyncType = async (stageIds = [], syncType = null) => {
    const ids = Array.from(new Set((stageIds || []).filter(Boolean)));
    if (!ids.length) return;
    try {
      await Promise.all(
        ids.map((id) => api.put(`/logistics/pipeline-stages/${id}`, {
          crm_sync_type: syncType,
          ...(syncType ? { crm_target_stage_id: null } : {}),
        })),
      );
      load();
    } catch (e) {
      alert('Lỗi gán trigger VC/LĐ hàng loạt: ' + (e.response?.data?.error || e.message));
    }
  };

  const renderPipeline = (type, list) => (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${type === 'lead' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
            {type === 'lead' ? '🎯' : '💰'}
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Pipeline {type === 'lead' ? 'Lead' : 'Deal'}</h2>
            <p className="text-[10px] text-gray-500">
              {list.length} giai đoạn — «Bỏ quá hạn» khi lead/deal đứng cột lâu không cần tính trễ SLA
            </p>
          </div>
        </div>
        <button onClick={() => startAdd(type)}
          className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer">
          <Plus className="h-3.5 w-3.5" /> Thêm
        </button>
      </div>

      {/* Pipeline Visual */}
      <div className="p-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {list.map((s, i) => (
            <div key={s.id} className="flex items-center shrink-0">
              <div
                onClick={() => startEdit(s)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:scale-105 border-2 ${
                  !s.is_active ? 'opacity-40 border-dashed' : 'border-transparent'
                } ${editId === s.id ? 'ring-2 ring-blue-500' : ''}`}
                style={{ backgroundColor: s.color + '20', color: s.color, borderColor: editId === s.id ? '#3B82F6' : s.is_active ? 'transparent' : s.color }}
              >
                {s.icon && <span className="mr-1">{s.icon}</span>}
                {s.name}
                {s.is_won && <Trophy className="inline h-3 w-3 ml-1" />}
                {s.is_lost && <XCircle className="inline h-3 w-3 ml-1" />}
              </div>
              {i < list.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300 mx-0.5 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Stages List */}
      <div className="border-t">
        {list.map((s, i) => {
          const linkedSx = sxStages.filter((sx) => sx.crm_target_stage_id === s.id);
          const linkedVc = vcStages.filter((vc) => vc.crm_target_stage_id === s.id);
          const syncRoleLabels = {
            sx_production: '🏭 SX', vc_delivery: '🚚 VC Giao', vc_installation: '🔧 VC Lắp', vc_customer_care: '🤝 VC CSKH',
          };
          const isDragging = draggingId === s.id;
          const isDragOver = dragOverId === s.id;
          return (
          <div
            key={s.id}
            draggable
            onDragStart={(e) => handleDragStart(e, s)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, s)}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e) => handleDrop(e, s)}
            className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 transition-all
              ${isDragging ? 'opacity-40 bg-blue-50' : 'hover:bg-gray-50'}
              ${isDragOver ? 'border-t-2 border-t-blue-500 bg-blue-50/50' : ''}
              ${!s.is_active ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-1">
              <span className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 select-none px-0.5"
                title="Kéo để sắp xếp lại">⋮⋮</span>
              <div className="flex flex-col gap-0.5">
                <button type="button" onClick={() => moveStage(s, -1)} disabled={i === 0}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]"
                  title="Lên 1 vị trí">▲</button>
                <button type="button" onClick={() => moveStage(s, 1)} disabled={i === list.length - 1}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]"
                  title="Xuống 1 vị trí">▼</button>
              </div>
            </div>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: s.color }}>
              {s.order_index}
            </div>
            <span className="text-lg shrink-0">{s.icon || '📋'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{s.name}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 flex-wrap mt-0.5">
                {s.is_won && <span className="text-emerald-600 font-bold">✅ Thắng</span>}
                {s.is_lost && <span className="text-red-500 font-bold">❌ Thua</span>}
                {!s.is_active && <span className="text-orange-500">Ẩn</span>}
                {s.default_probability != null && s.default_probability !== '' && (
                  <span className="text-violet-600 font-medium">◎ {s.default_probability}% mặc định</span>
                )}
                {!s.is_won && !s.is_lost && isPipelineStageSlaDisabled(s.sla_days) && (
                  <span className="bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded font-medium">
                    ⏱ Bỏ quá hạn cột
                  </span>
                )}
                {!s.is_won && !s.is_lost && !isPipelineStageSlaDisabled(s.sla_days) && (
                  <span className="text-gray-500">
                    SLA {s.sla_days != null && s.sla_days !== '' ? `${s.sla_days} ngày` : '7 ngày (mặc định)'}
                  </span>
                )}
                {s.sync_role && (
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-medium">
                    {syncRoleLabels[s.sync_role] || s.sync_role}
                  </span>
                )}
                {s.requires_deadline && !s.is_won && !s.is_lost && (
                  <span className="bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded font-medium">
                    ⏰ Bắt buộc deadline
                  </span>
                )}
                {linkedSx.map((sx) => (
                  <span key={sx.id} className="bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded font-medium">
                    🏭 {sx.icon || ''}{sx.name}
                  </span>
                ))}
                {linkedVc.map((vc) => (
                  <span key={vc.id} className="bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded font-medium">
                    🚚 {vc.icon || ''}{vc.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {s.pipeline_type === 'deal' && s.sync_role === 'sx_production' && (
                <button
                  type="button"
                  onClick={() => setSxAssignModal({ stageId: s.id, stageName: s.name })}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer border bg-teal-600 text-white border-teal-700 hover:bg-teal-700 shadow-sm"
                  title="Gán nhiều cột pipeline Sản xuất (đa công ty / đa phân loại) cùng map về cột CRM này"
                >
                  <Factory className="h-3.5 w-3.5" /> Gán cột SX
                  <span className="bg-white/20 px-1 rounded">{linkedSx.length}</span>
                </button>
              )}
              {!s.is_won && !s.is_lost && (
                <>
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
                        : 'Bật để mỗi lần thẻ chuyển vào cột này hiện hộp chọn deadline + lý do.'
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
                    title={
                      isPipelineStageSlaDisabled(s.sla_days)
                        ? 'Đang bỏ ghi nhận quá hạn khi lead/deal không chuyển tiếp khỏi cột này (Kanban, SLA watchlist, KPI A6). NV có ngày hẹn riêng vẫn hiện trên Kanban. Nhấn để bật lại SLA (mặc định 7 ngày).'
                        : 'Bỏ ghi nhận quá hạn nếu deal/lead đứng cột quá hạn mà không chuyển tiếp — dùng cho cột chờ KH, chờ duyệt… NV có hạn riêng vẫn tính.'
                    }
                  >
                    <Clock className="h-3 w-3" />
                    {isPipelineStageSlaDisabled(s.sla_days) ? 'Đã bỏ QH' : 'Bỏ quá hạn'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => toggleLostColumn(s)}
                className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                  s.is_lost
                    ? 'bg-red-600 text-white border-red-700'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-red-300 hover:text-red-700'
                }`}
                title={s.is_lost
                  ? 'Đang là cột Mất (lost). Lead/Deal ở cột này KPI bỏ qua: không tính SLA, không cộng/trừ điểm trễ nhiệm vụ. Nhấn để bỏ.'
                  : 'Đánh dấu là cột Mất (lost) — KPI sẽ bỏ qua lead/deal ở cột này: SLA và nhiệm vụ trễ KHÔNG tính điểm trừ/cộng'}
              >
                <XCircle className="h-3 w-3" />
                {s.is_lost ? 'Cột Mất' : 'Mất'}
              </button>
              {s.pipeline_type === 'deal' && (
                <>
                  <button
                    type="button"
                    onClick={() => toggleWonColumn(s)}
                    className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                      s.is_won
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-emerald-300 hover:text-emerald-700'
                    }`}
                    title={s.is_won
                      ? 'Đang là cột Thắng (doanh thu thắng). Nhấn để bỏ.'
                      : 'Đánh dấu là cột Thắng — KPI Doanh thu thắng sẽ cộng đúng theo cột này'}
                  >
                    <Trophy className="h-3 w-3" />
                    {s.is_won ? 'Cột Thắng' : 'Thắng'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCreateEventColumn(s)}
                    className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                      s.create_event_on_enter
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-emerald-200'
                    }`}
                    title="Khi deal chuyển vào cột này: mở bảng chọn giờ rồi tạo sự kiện (nội dung lấy từ deal)"
                  >
                    <Calendar className="h-3 w-3" />
                    Sự kiện
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleZaloColumn(s)}
                    className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                      s.send_zalo_on_enter
                        ? 'bg-sky-100 text-sky-800 border-sky-300'
                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-sky-200'
                    }`}
                    title="Khi deal kéo vào cột này: gửi tin Zalo OA (khuyến nghị chỉ bật trên cột tên «Hoàn thành»; cần bật OA + token/template)"
                  >
                    <MessageCircle className="h-3 w-3" />
                    Zalo
                  </button>
                </>
              )}
              <button onClick={() => toggleActive(s)} className="p-1.5 rounded hover:bg-gray-100 cursor-pointer" title={s.is_active ? 'Ẩn' : 'Hiện'}>
                {s.is_active ? <Eye className="h-3.5 w-3.5 text-gray-400" /> : <EyeOff className="h-3.5 w-3.5 text-orange-400" />}
              </button>
              <button onClick={() => startEdit(s)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 cursor-pointer">
                <Save className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => del(s.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500 cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          );
        })}
      </div>

      {/* Add Form */}
      {adding === type && (
        <div className="p-4 border-t bg-blue-50/50">
          <StageForm form={form} setForm={setForm} onSave={saveNew} onCancel={() => setAdding(null)} pipelineType={type} />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cài đặt Pipeline</h1>
            <p className="text-sm text-gray-500">
              Bấm <strong>Sửa</strong> trên từng giai đoạn và điền <strong>Mô tả cột Kanban</strong> — lưu vào database và hiện ngay dưới tên cột trên Kanban CRM.
            </p>
          </div>
        </div>
      </div>

      {/* Company + Pipeline selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        {isAdmin ? (
          <label className="flex flex-col gap-1 text-[11px] text-gray-700 min-w-[260px]">
            <span className="font-semibold">Công ty</span>
            <select
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
              value={selectedCompanyId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedCompanyId(v);
                if (v) setStoredCrmFilterCompanyId(v);
                setSelectedPipelineId('');
                setAdding(null);
                setEditId(null);
              }}
            >
              {companies.length === 0 && <option value="">— Chưa có công ty —</option>}
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            Đang quản lý pipeline của công ty bạn
          </div>
        )}

        <label className="flex flex-col gap-1 text-[11px] text-gray-700 min-w-[320px] flex-1">
          <span className="font-semibold">Pipeline CRM (thuộc công ty đang chọn)</span>
          <select
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
            value={selectedPipelineId}
            onChange={(e) => { setSelectedPipelineId(e.target.value); setAdding(null); setEditId(null); }}
          >
            {visiblePipelines.length === 0 && <option value="">— Chưa có pipeline —</option>}
            {visiblePipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.is_default ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => load()}
          className="h-9 px-4 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 cursor-pointer"
          title="Tải lại stages theo pipeline đang chọn"
        >
          Tải lại
        </button>
      </div>
      {isAdmin && selectedCompanyId && visiblePipelines.length === 0 && (
        <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Công ty này chưa có pipeline CRM. Hãy tạo pipeline mới hoặc copy từ công ty khác.
        </div>
      )}

      {/* Lead/Deal types */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Settings className="h-4 w-4 text-indigo-600" />
            Phân loại Lead/Deal (theo công ty)
          </h2>
          {leadTypesLoading && <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />}
        </div>

        <p className="text-[11px] text-gray-600">
          Mỗi công ty có danh mục riêng. Khi tạo Lead/Deal, hệ thống sẽ chỉ cho chọn loại thuộc đúng công ty đó.
          Với Deal: có thể bật «SX mẫu» để khi tạo deal loại đó, hệ thống tự sinh nhiệm vụ pipeline SX (sx_*) theo bộ mẫu xưởng của công ty (công ty phải thuộc module Sản xuất).
          Cột «Công ty SX mặc định»: khi deal loại đó chuyển <strong>Thắng</strong> hoặc cột <strong>Sản xuất</strong> (chưa có dự án), hệ thống dùng công ty xưởng này nếu không chọn tay — có thể bỏ trống để luôn hỏi khi kéo Kanban.
        </p>

        {/* Add new type */}
        <div className="grid gap-2 sm:grid-cols-4 items-end">
          <label className="flex flex-col gap-1 text-[11px] text-gray-700 sm:col-span-2">
            <span className="font-semibold">Tên loại</span>
            <input
              value={leadTypeNew.name}
              onChange={(e) => setLeadTypeNew((v) => ({ ...v, name: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
              placeholder="VD: Chung cư, Nhà phố, Dự án lớn..."
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-gray-700">
            <span className="font-semibold">Áp dụng</span>
            <select
              value={leadTypeNew.applies_to}
              onChange={(e) => setLeadTypeNew((v) => ({ ...v, applies_to: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
            >
              <option value="both">Lead + Deal</option>
              <option value="lead">Chỉ Lead</option>
              <option value="deal">Chỉ Deal</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!selectedCompanyId || !leadTypeNew.name.trim()}
            onClick={async () => {
              try {
                const { data } = await api.post('/crm/lead-types', {
                  company_id: selectedCompanyId || null,
                  name: leadTypeNew.name.trim(),
                  applies_to: leadTypeNew.applies_to,
                  is_active: leadTypeNew.is_active !== false,
                  workshop_production_templates: !!leadTypeNew.workshop_production_templates,
                  default_production_company_id: leadTypeNew.default_production_company_id || null,
                });
                setLeadTypes((prev) => [data, ...(prev || [])]);
                setLeadTypeNew({
                  name: '',
                  applies_to: 'both',
                  is_active: true,
                  workshop_production_templates: false,
                  default_production_company_id: '',
                });
              } catch (e) {
                alert(e.response?.data?.error || 'Lỗi tạo loại');
              }
            }}
            className="h-9 px-4 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-800 disabled:opacity-50 cursor-pointer"
            title={!selectedCompanyId ? 'Chọn công ty trước' : ''}
          >
            + Thêm loại
          </button>
        </div>
        <label className="flex items-start gap-2 text-[11px] text-teal-900 bg-teal-50/80 border border-teal-100 rounded-lg px-3 py-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-teal-400 text-teal-700"
            checked={!!leadTypeNew.workshop_production_templates}
            onChange={(e) => setLeadTypeNew((v) => ({ ...v, workshop_production_templates: e.target.checked }))}
          />
          <span>
            <strong>Deal Sản xuất:</strong> khi tạo Deal chọn loại này, tự tạo nhiệm vụ SX theo bộ mẫu đã cấu hình cho công ty (workshop — khu vực Sản xuất).
          </span>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-gray-700 max-w-md">
          <span className="font-semibold">Công ty SX mặc định (khi chốt deal loại mới)</span>
          <select
            value={leadTypeNew.default_production_company_id || ''}
            onChange={(e) => setLeadTypeNew((v) => ({ ...v, default_production_company_id: e.target.value }))}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
          >
            <option value="">— Chưa gán —</option>
            {productionCompaniesForSx.map((c) => (
              <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
            ))}
          </select>
        </label>

        {/* List */}
        {leadTypes.length === 0 ? (
          <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            Chưa có loại nào cho công ty này.
          </div>
        ) : (
          <div className="space-y-2">
            {leadTypes
              .slice()
              .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
              .map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                  <input
                    value={t.name || ''}
                    onChange={(e) => setLeadTypes((prev) => (prev || []).map((x) => x.id === t.id ? { ...x, name: e.target.value } : x))}
                    className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <select
                    value={t.applies_to || 'both'}
                    onChange={(e) => setLeadTypes((prev) => (prev || []).map((x) => x.id === t.id ? { ...x, applies_to: e.target.value } : x))}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                    title="Áp dụng"
                  >
                    <option value="both">Lead+Deal</option>
                    <option value="lead">Lead</option>
                    <option value="deal">Deal</option>
                  </select>
                  <input
                    type="number"
                    value={t.order_index ?? 0}
                    onChange={(e) => setLeadTypes((prev) => (prev || []).map((x) => x.id === t.id ? { ...x, order_index: parseInt(e.target.value || '0', 10) } : x))}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    title="Thứ tự"
                  />
                  <label className="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={t.is_active !== false}
                      onChange={(e) => setLeadTypes((prev) => (prev || []).map((x) => x.id === t.id ? { ...x, is_active: e.target.checked } : x))}
                    />
                    Hiện
                  </label>
                  <label
                    className="flex items-center gap-1.5 text-[10px] text-teal-800 cursor-pointer select-none shrink-0"
                    title="Tạo nhiệm vụ sx_* từ bộ mẫu xưởng khi tạo Deal loại này"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-teal-400"
                      checked={!!t.workshop_production_templates}
                      onChange={(e) => setLeadTypes((prev) => (prev || []).map((x) => x.id === t.id ? { ...x, workshop_production_templates: e.target.checked } : x))}
                    />
                    SX mẫu
                  </label>
                  <select
                    value={t.default_production_company_id || ''}
                    onChange={(e) =>
                      setLeadTypes((prev) =>
                        (prev || []).map((x) =>
                          x.id === t.id ? { ...x, default_production_company_id: e.target.value || null } : x,
                        ),
                      )
                    }
                    className="min-w-[140px] max-w-[200px] border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] bg-white"
                    title="Công ty xưởng mặc định khi chốt deal (Thắng / Sản xuất)"
                  >
                    <option value="">SX mặc định…</option>
                    {productionCompaniesForSx.map((c) => (
                      <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const payload = {
                          name: (t.name || '').trim(),
                          applies_to: t.applies_to,
                          order_index: t.order_index ?? 0,
                          is_active: t.is_active !== false,
                          workshop_production_templates: !!t.workshop_production_templates,
                          default_production_company_id: t.default_production_company_id || null,
                        };
                        const { data } = await api.put(`/crm/lead-types/${t.id}`, payload);
                        setLeadTypes((prev) => (prev || []).map((x) => x.id === t.id ? data : x));
                      } catch (e) {
                        alert(e.response?.data?.error || 'Lỗi lưu');
                      }
                    }}
                    className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-black cursor-pointer"
                  >
                    Lưu
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Xóa loại này?')) return;
                      try {
                        await api.delete(`/crm/lead-types/${t.id}`);
                        setLeadTypes((prev) => (prev || []).filter((x) => x.id !== t.id));
                      } catch (e) {
                        alert(e.response?.data?.error || 'Lỗi xóa');
                      }
                    }}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 cursor-pointer"
                    title="Xóa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Zalo OA — bật/tắt + test gửi tin */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-sky-900 flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> Zalo OA — tin qua SĐT
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZaloExpanded((v) => !v)}
              className="text-[10px] px-2 py-1 rounded-md border border-sky-200 bg-white/70 text-sky-900 hover:bg-white cursor-pointer"
            >
              {zaloExpanded ? 'Thu gọn' : 'Mở cấu hình'}
            </button>
            {zaloLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            ) : (
              <label className="flex items-center gap-2 text-xs font-medium text-sky-900 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!zaloSettings?.enabled}
                  onChange={(e) => {
                    saveZaloMaster({ enabled: e.target.checked });
                  }}
                  className="rounded border-sky-400"
                />
                Bật gửi Zalo khi deal vào cột đã tích «Zalo»
              </label>
            )}
          </div>
        </div>
        {!zaloExpanded && (
          <p className="text-[11px] text-sky-900/70">
            (Đang thu gọn) Bấm <strong>Mở cấu hình</strong> để xem token, template, test gửi.
          </p>
        )}
        {zaloExpanded && (
          <>
            <p className="text-[11px] text-sky-800 leading-relaxed">
              Lưu <strong>access_token</strong> từ Zalo Cloud. <strong>template_id</strong> là mẫu “tin qua SĐT” của OA bạn — để trống thì hệ thống dùng mặc định <strong>566121</strong> (biến{' '}
              <code className="text-[10px] bg-white/80 px-0.5 rounded">ten_san_pham</code>,{' '}
              <code className="text-[10px] bg-white/80 px-0.5 rounded">order_code</code>,{' '}
              <code className="text-[10px] bg-white/80 px-0.5 rounded">date</code>,{' '}
              <code className="text-[10px] bg-white/80 px-0.5 rounded">ten_khach_hang</code> — tự lấy từ deal/khách khi deal vào cột <strong>Hoàn thành</strong>). Ở pipeline <strong>Deal</strong>, thêm cột tên «Hoàn thành» (nếu chưa có), rồi bấm <strong>Zalo</strong> trên đúng cột đó để bật tự gửi (mỗi deal + cột tối đa một lần gửi thành công). Chế độ <strong>3</strong> chỉ khi OA được whitelist vượt hạn mức.
            </p>
            <div className="rounded-lg border border-sky-200 bg-white/90 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-[10px] font-semibold text-sky-800 uppercase">Cấu trúc template_data (key = biến OA)</label>
            <button
              type="button"
              onClick={() => setZaloStructureJson(DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY)}
              className="text-[10px] px-2 py-1 rounded-md border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 cursor-pointer"
            >
              Mặc định 4 biến
            </button>
          </div>
          <p className="text-[10px] text-sky-800 leading-relaxed">
            Chỉnh các <strong>key</strong> cho khớp template trên Zalo Cloud. Nút <strong>Gửi Zalo</strong> trên chi tiết deal đọc cấu hình này từ server — không cần chỉnh trình duyệt. Xóa hết nội dung ô rồi lưu = dùng lại mặc định 4 biến phía server.
          </p>
          <textarea
            value={zaloStructureJson}
            onChange={(e) => setZaloStructureJson(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full font-mono text-[11px] border border-sky-200 rounded-lg px-2 py-1.5 bg-white"
          />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-sky-800 uppercase">Template ID</label>
            <input
              value={zaloSettings?.template_id || ''}
              onChange={(e) => setZaloSettings((p) => ({ ...(p || {}), template_id: e.target.value }))}
              className="w-full h-8 px-2 rounded-lg border border-sky-200 text-xs bg-white"
              placeholder="566121 hoặc ID mẫu OA — để trống = 566121"
            />
            <label className="text-[10px] font-semibold text-sky-800 uppercase">Chế độ gửi</label>
            <select
              value={zaloSettings?.sending_mode || '1'}
              onChange={(e) => setZaloSettings((p) => ({ ...(p || {}), sending_mode: e.target.value }))}
              className="w-full h-8 px-2 rounded-lg border border-sky-200 text-xs bg-white"
            >
              <option value="1">1 — Gửi thường</option>
              <option value="3">3 — Vượt hạn mức (OA whitelist)</option>
            </select>
            <label className="text-[10px] font-semibold text-sky-800 uppercase">Access token (để trống nếu giữ token đã lưu)</label>
            <input
              type="password"
              value={zaloTestToken}
              onChange={(e) => setZaloTestToken(e.target.value)}
              className="w-full h-8 px-2 rounded-lg border border-sky-200 text-xs bg-white"
              placeholder={zaloSettings?.has_token ? '•••• đã lưu — nhập mới để thay' : 'Dán access_token'}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={saveZaloForm}
              className="h-8 px-3 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 cursor-pointer"
            >
              Lưu cấu hình Zalo
            </button>
            <p className="text-[10px] text-sky-700">Token đã lưu: {zaloSettings?.has_token ? 'Có' : 'Chưa'}</p>
          </div>
          <div className="space-y-2 bg-white/80 rounded-lg p-3 border border-sky-100">
            <p className="text-[10px] font-bold text-gray-700 uppercase">Gửi thử API</p>
            <div className="flex flex-wrap gap-1.5">
              {ZALO_TEST_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyZaloTestPreset(p)}
                  className="text-[10px] px-2 py-1 rounded-md border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              value={zaloTestPhone}
              onChange={(e) => setZaloTestPhone(e.target.value)}
              className="w-full h-8 px-2 rounded border text-xs"
              placeholder="SĐT (VD 0987654321 hoặc 84987654321)"
            />
            <input
              value={zaloTestTemplateId}
              onChange={(e) => setZaloTestTemplateId(e.target.value)}
              className="w-full h-8 px-2 rounded border text-xs"
              placeholder="Template ID (tuỳ chọn, mặc định lấy từ cấu hình)"
            />
            <textarea
              value={zaloTestJson}
              onChange={(e) => setZaloTestJson(e.target.value)}
              rows={8}
              className="w-full px-2 py-1.5 rounded border text-[11px] font-mono leading-snug"
              spellCheck={false}
            />
            <button
              type="button"
              disabled={zaloTestSending}
              onClick={runZaloTest}
              className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 cursor-pointer disabled:opacity-50 flex items-center gap-1"
            >
              {zaloTestSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Gửi thử
            </button>
            {zaloTestResult && (
              <>
                <pre className="text-[10px] bg-gray-900 text-green-200 p-2 rounded overflow-x-auto max-h-40">
                  {JSON.stringify(zaloTestResult, null, 2)}
                </pre>
                {!zaloTestResult.ok && zaloTestResult.hint_vi && (
                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 leading-snug">
                    {zaloTestResult.hint_vi}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
          </>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-violet-600" />
          Zalo OA theo từng pipeline CRM
        </h2>
        {pipelinesLoadError && (
          <div
            className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
              pipelinesLoadError.code === 'CRM_PIPELINES_TABLE_MISSING'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <p className="font-semibold mb-1">
              {pipelinesLoadError.code === 'CRM_PIPELINES_TABLE_MISSING'
                ? 'Chưa có bảng crm_pipelines trên database'
                : 'Không tải pipeline'}
            </p>
            <p className="whitespace-pre-wrap">{pipelinesLoadError.message}</p>
          </div>
        )}
        <p className="text-[11px] text-gray-600 leading-relaxed">
          Deal có trường <strong>pipeline</strong>: khi gửi Zalo (deal ở cột «Hoàn thành»), hệ thống lấy{' '}
          <strong>template_id</strong> và <strong>merge_template_data</strong> của pipeline đó; nếu để trống thì dùng cấu hình chung ở khối «Zalo OA — tin qua SĐT» phía trên. Merge của pipeline <strong>ghi đè</strong> key trùng với merge chung.
        </p>
        <button
          type="button"
          onClick={() => setZaloPipelineExpanded((v) => !v)}
          className="h-7 px-3 rounded-lg bg-violet-50 border border-violet-200 text-violet-900 text-xs font-semibold hover:bg-violet-100 cursor-pointer"
        >
          {zaloPipelineExpanded ? 'Thu gọn' : 'Mở cấu hình'}
        </button>
        {!zaloPipelineExpanded && (
          <p className="text-[11px] text-gray-500">(Đang thu gọn) Bấm <strong>Mở cấu hình</strong> để chỉnh theo từng pipeline.</p>
        )}
        {zaloPipelineExpanded && (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1 text-[11px] text-gray-700 min-w-[220px] flex-1">
                <span className="font-semibold">Chọn pipeline</span>
                <select
                  className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
                  value={zaloPlId}
                  onChange={(e) => setZaloPlId(e.target.value)}
                >
                  {visiblePipelines.length === 0 && <option value="">— Chưa có pipeline —</option>}
                  {visiblePipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.company?.name ? ` — ${p.company.name}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {zaloPlId && (
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <label className="flex flex-col gap-1 text-[11px]">
                  <span className="text-gray-700 font-semibold">Template ID (riêng pipeline)</span>
                  <input
                    value={zaloPlTemplateId}
                    onChange={(e) => setZaloPlTemplateId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm"
                    placeholder="VD 566121 — để trống: dùng template chung / mặc định"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px]">
                  <span className="text-gray-700 font-semibold">merge_template_data (JSON object, tùy chọn)</span>
                  <textarea
                    value={zaloPlMergeJson}
                    onChange={(e) => setZaloPlMergeJson(e.target.value)}
                    rows={6}
                    className="w-full font-mono text-[11px] border border-gray-200 rounded-lg px-2 py-1.5"
                    spellCheck={false}
                  />
                </label>
                <button
                  type="button"
                  disabled={zaloPlSaving}
                  onClick={savePipelineZalo}
                  className="h-9 px-4 rounded-lg bg-violet-700 text-white text-sm font-medium hover:bg-violet-800 disabled:opacity-50 cursor-pointer"
                >
                  {zaloPlSaving ? 'Đang lưu…' : 'Lưu Zalo cho pipeline này'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {isAdminLike(user) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Settings className="h-4 w-4 text-emerald-600" />
            Copy pipeline CRM giữa công ty
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[11px] text-gray-700">
              <span className="font-semibold">Pipeline nguồn</span>
              <select
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
                value={copyFromId}
                onChange={(e) => setCopyFromId(e.target.value)}
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.company?.name ? ` — ${p.company.name}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-gray-700">
              <span className="font-semibold">Công ty đích (ID)</span>
              <input
                value={copyToCompanyId}
                onChange={(e) => setCopyToCompanyId(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
                placeholder="UUID company_id"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-gray-700">
              <span className="font-semibold">Tên pipeline mới</span>
              <input
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
                placeholder="Để trống: tự đặt (Copy)"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-700">
            <input
              type="checkbox"
              checked={copySetDefault}
              onChange={(e) => setCopySetDefault(e.target.checked)}
            />
            Đặt làm pipeline mặc định của công ty đích
          </label>
          <button
            type="button"
            disabled={copying || !copyFromId || !copyToCompanyId.trim()}
            onClick={async () => {
              setCopying(true);
              try {
                await api.post(`/crm/pipelines/${copyFromId}/copy`, {
                  target_company_id: copyToCompanyId.trim(),
                  name: copyName.trim() || null,
                  set_default: copySetDefault,
                });
                alert('Đã copy pipeline');
                // reload pipelines list
                const { data } = await api.get('/crm/pipelines');
                setPipelines(Array.isArray(data) ? data : []);
              } catch (e) {
                alert(e.response?.data?.error || 'Lỗi copy pipeline');
              } finally {
                setCopying(false);
              }
            }}
            className="h-9 px-4 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
          >
            {copying ? 'Đang copy…' : 'Copy pipeline'}
          </button>
          <p className="text-[11px] text-gray-500 leading-snug">
            Ghi chú: hiện form nhận <strong>company_id</strong> dạng UUID. Nếu bạn muốn chọn từ danh sách công ty thay vì nhập UUID, mình có thể bổ sung dropdown lấy từ API /companies.
          </p>
        </div>
      )}

      {/* Edit Form (floating) */}
      {editId && (
        <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-lg">
          <h3 className="text-sm font-bold text-gray-800 mb-3">✏️ Sửa giai đoạn</h3>
          <StageForm
            form={form}
            setForm={setForm}
            onSave={saveEdit}
            onCancel={() => setEditId(null)}
            pipelineType={stages.find((s) => s.id === editId)?.pipeline_type || 'lead'}
            editingStageId={editId}
            sxStages={sxStages}
            vcStages={vcStages}
            onSetModuleTarget={setModuleStageTarget}
            onSetVcSyncType={setVcSyncType}
            onBulkSetVcSyncType={bulkSetVcSyncType}
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderPipeline('lead', stages.filter(s => s.pipeline_type === 'lead').sort((a, b) => a.order_index - b.order_index))}
          {renderPipeline('deal', stages.filter(s => s.pipeline_type === 'deal').sort((a, b) => a.order_index - b.order_index))}
        </div>
      )}

      {sxAssignModal && (
        <SxAssignModal
          stageId={sxAssignModal.stageId}
          stageName={sxAssignModal.stageName}
          onClose={() => setSxAssignModal(null)}
          onSaved={() => { setSxAssignModal(null); load(); }}
        />
      )}
    </div>
  );
}

function StageForm({
  form, setForm, onSave, onCancel, pipelineType = 'lead', editingStageId,
  sxStages = [], vcStages = [], onSetModuleTarget, onSetVcSyncType, onBulkSetVcSyncType,
}) {
  const [bulkVcSelected, setBulkVcSelected] = useState(() => new Set());
  useEffect(() => { setBulkVcSelected(new Set()); }, [editingStageId]);

  const vcIds = vcStages.map((vc) => vc.id);
  const vcAllSelected = vcIds.length > 0 && vcIds.every((id) => bulkVcSelected.has(id));
  const vcSomeSelected = vcIds.some((id) => bulkVcSelected.has(id));

  const toggleBulkVc = (id) => {
    setBulkVcSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-[10px] font-medium text-gray-500 block mb-1">
            Mô tả cột Kanban (tùy chọn — hiển thị nhỏ dưới tên cột trên CRM)
          </label>
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg text-sm resize-y min-h-[2.75rem]"
            placeholder="VD: Gọi lại trong 24h — chốt lịch khảo sát."
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-1">Tên giai đoạn *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full h-8 px-3 border rounded-lg text-sm" placeholder="VD: Đang tư vấn" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-1">Icon</label>
          <div className="flex flex-wrap gap-1">
            {ICONS.map(ic => (
              <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))}
                className={`w-7 h-7 rounded text-sm cursor-pointer ${form.icon === ic ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}>
                {ic}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-medium text-gray-500 block mb-1">Màu</label>
        <div className="flex gap-1.5">
          {COLORS.map(c => (
            <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
              className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>

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
          Khi lead/deal chưa có % riêng (trống), KPI và giá trị có trọng số dùng % này. Để trống nếu không muốn áp dụng.
        </p>
      </div>

      {!form.is_won && !form.is_lost && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <label className="text-[10px] font-medium text-gray-500">
              SLA giai đoạn (ngày)
            </label>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  sla_days: isPipelineStageSlaDisabled(f.sla_days) ? '' : '0',
                }))
              }
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
            Lead/deal không chuyển tiếp khỏi cột quá số ngày SLA → quá hạn (Kanban, watchlist SLA, KPI).
            Ưu tiên <strong>ngày hẹn NV CRM mở mới nhất</strong> trên Kanban. Nút «Bỏ quá hạn cột» → không ghi trễ SLA cột.
            Để trống ô số → <strong>7 ngày</strong> mặc định.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={form.is_won} onChange={e => setForm(f => ({ ...f, is_won: e.target.checked, is_lost: false }))}
            className="rounded" />
          <Trophy className="h-3.5 w-3.5 text-emerald-500" /> Giai đoạn Thắng
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={form.is_lost} onChange={e => setForm(f => ({ ...f, is_lost: e.target.checked, is_won: false }))}
            className="rounded" />
          <XCircle className="h-3.5 w-3.5 text-red-500" /> Giai đoạn Thua/Mất
        </label>
        {pipelineType === 'deal' && !form.is_lost && (
          <label
            className="flex items-center gap-2 text-xs cursor-pointer text-amber-900 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200"
            title="Tick các cột muốn cộng vào ô 'Doanh thu thắng' trên CRM dashboard. Nếu không tick cột nào, dashboard tự dùng cờ 'Giai đoạn Thắng' (is_won)."
          >
            <input
              type="checkbox"
              checked={!!form.counts_as_won_revenue}
              onChange={(e) => setForm((f) => ({ ...f, counts_as_won_revenue: e.target.checked }))}
              className="rounded border-amber-400"
            />
            <Trophy className="h-3.5 w-3.5 text-amber-600" /> Tính vào «Doanh thu thắng»
          </label>
        )}
        {pipelineType === 'deal' && !form.is_lost && (
          <label
            className="flex items-center gap-2 text-xs cursor-pointer text-teal-900 bg-teal-50 px-2 py-1 rounded-lg border border-teal-200"
            title="Tick các cột muốn cộng vào ô 'Doanh thu đã hoàn thành' trên CRM dashboard. Nếu không tick cột nào, dashboard tự dò theo canonical 'completed' / bucket 'completed' / tên chứa 'Hoàn thành'."
          >
            <input
              type="checkbox"
              checked={!!form.counts_as_completed_revenue}
              onChange={(e) => setForm((f) => ({ ...f, counts_as_completed_revenue: e.target.checked }))}
              className="rounded border-teal-400"
            />
            <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" /> Tính vào «Doanh thu đã hoàn thành»
          </label>
        )}
        {pipelineType === 'deal' && (
          <label className="flex items-center gap-2 text-xs cursor-pointer text-sky-800 bg-sky-50 px-2 py-1 rounded-lg border border-sky-200">
            <input
              type="checkbox"
              checked={!!form.send_zalo_on_enter}
              onChange={(e) => setForm((f) => ({ ...f, send_zalo_on_enter: e.target.checked }))}
              className="rounded border-sky-400"
            />
            <MessageCircle className="h-3.5 w-3.5" /> Tự gửi Zalo OA khi deal vào cột này
          </label>
        )}
        {pipelineType === 'deal' && (
          <label className="flex items-center gap-2 text-xs cursor-pointer text-emerald-900 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
            <input
              type="checkbox"
              checked={!!form.create_event_on_enter}
              onChange={(e) => setForm((f) => ({ ...f, create_event_on_enter: e.target.checked }))}
              className="rounded border-emerald-400"
            />
            <Calendar className="h-3.5 w-3.5 shrink-0" /> Hỏi tạo sự kiện khi deal chuyển vào cột này (chỉ chọn giờ)
          </label>
        )}
        {!form.is_won && !form.is_lost && (
          <label className="flex items-start gap-2 text-xs cursor-pointer text-rose-900 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
            <input
              type="checkbox"
              checked={!!form.requires_deadline}
              onChange={(e) => setForm((f) => ({ ...f, requires_deadline: e.target.checked }))}
              className="mt-0.5 rounded border-rose-400 accent-rose-500"
            />
            <span>
              <span className="flex items-center gap-1 font-semibold">
                <Clock className="h-3.5 w-3.5 shrink-0" /> Bắt buộc đặt deadline khi kéo thẻ tới cột này
              </span>
              <span className="block text-[10px] text-rose-600 mt-0.5 leading-snug">
                Mỗi lần thẻ chuyển vào cột này sẽ hiện hộp chọn deadline + lý do và ghi nhận vào lịch sử.
              </span>
            </span>
          </label>
        )}
      </div>

      {pipelineType === 'deal' && !form.is_won && !form.is_lost && (
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-1">
            Vai trò đồng bộ (sync_role) — fallback khi không cài direct target
          </label>
          <select
            value={form.sync_role || ''}
            onChange={(e) => setForm((f) => ({ ...f, sync_role: e.target.value }))}
            className="w-full h-8 px-2 border rounded-lg text-xs bg-white"
          >
            <option value="">— Không đồng bộ —</option>
            <optgroup label="Sản xuất (SX)">
              <option value="sx_production">🏭 Nhận deal khi SX project đến cột có trigger CRM</option>
            </optgroup>
            <optgroup label="Vận chuyển & Lắp đặt (VC)">
              <option value="vc_delivery">🚚 Nhận deal khi VC chuyển sang «Vận chuyển»</option>
              <option value="vc_installation">🔧 Nhận deal khi VC chuyển sang «Lắp đặt»</option>
              <option value="vc_customer_care">🤝 Nhận deal khi VC chuyển sang «CSKH / Bảo hành»</option>
            </optgroup>
          </select>
        </div>
      )}

      {/* Module management — chỉ hiện khi đang edit deal stage */}
      {pipelineType === 'deal' && editingStageId && !form.is_won && !form.is_lost && (
        <div className="border border-indigo-100 rounded-lg p-3 bg-indigo-50/40 space-y-2">
          <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">
            🔗 Cột module nào sẽ nhảy vào CRM cột này?
          </p>
          <p className="text-[10px] text-gray-500">
            Tick vào cột Sản xuất / Vận chuyển để khi deal SX/VC tới cột đó, CRM deal tự chuyển sang cột này.
          </p>

          {sxStages.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-teal-700 mb-1">🏭 Sản xuất (SX)</p>
              <div className="flex flex-wrap gap-1.5">
                {sxStages.map((sx) => {
                  const linked = sx.crm_target_stage_id === editingStageId;
                  return (
                    <button
                      key={sx.id}
                      type="button"
                      onClick={() => onSetModuleTarget?.(sx, 'sx', linked ? null : editingStageId)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-medium border cursor-pointer transition-all ${
                        linked
                          ? 'bg-teal-100 text-teal-800 border-teal-400 ring-1 ring-teal-400'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300 hover:text-teal-700'
                      }`}
                      style={linked ? { borderColor: sx.color } : {}}
                    >
                      {sx.icon || '📋'} {sx.name}
                      {linked && ' ✓'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {vcStages.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="text-[10px] font-semibold text-orange-700">🚚 Vận chuyển & Lắp đặt (VC)</p>
                <label className="inline-flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vcAllSelected}
                    ref={(el) => { if (el) el.indeterminate = !vcAllSelected && vcSomeSelected; }}
                    onChange={() => {
                      if (vcAllSelected) setBulkVcSelected(new Set());
                      else setBulkVcSelected(new Set(vcIds));
                    }}
                    className="rounded border-gray-300"
                  />
                  Chọn tất cả
                </label>
                {bulkVcSelected.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => onBulkSetVcSyncType?.(Array.from(bulkVcSelected), 'delivery')}
                      className="h-6 px-2 rounded border border-blue-300 bg-blue-50 text-blue-700 text-[10px] font-semibold cursor-pointer hover:bg-blue-100"
                      title="Gán trigger Vận chuyển cho tất cả cột VC đã chọn"
                    >
                      🚚 Trigger Vận chuyển
                    </button>
                    <button
                      type="button"
                      onClick={() => onBulkSetVcSyncType?.(Array.from(bulkVcSelected), 'installation')}
                      className="h-6 px-2 rounded border border-amber-300 bg-amber-50 text-amber-700 text-[10px] font-semibold cursor-pointer hover:bg-amber-100"
                      title="Gán trigger Lắp đặt cho tất cả cột VC đã chọn"
                    >
                      🔧 Trigger Lắp đặt
                    </button>
                    <button
                      type="button"
                      onClick={() => onBulkSetVcSyncType?.(Array.from(bulkVcSelected), null)}
                      className="h-6 px-2 rounded border border-gray-300 bg-white text-gray-600 text-[10px] font-semibold cursor-pointer hover:bg-gray-50"
                      title="Bỏ trigger VC/LĐ cho các cột đã chọn"
                    >
                      Bỏ trigger
                    </button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {vcStages.map((vc) => {
                  const linked = vc.crm_target_stage_id === editingStageId;
                  const isDelivery = vc.crm_sync_type === 'delivery';
                  const isInstallation = vc.crm_sync_type === 'installation';
                  const selected = bulkVcSelected.has(vc.id);
                  return (
                    <div
                      key={vc.id}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium border ${
                        linked
                          ? 'bg-orange-100 text-orange-800 border-orange-400 ring-1 ring-orange-400'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                      style={linked ? { borderColor: vc.color } : {}}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleBulkVc(vc.id)}
                        className="rounded border-gray-300"
                        title="Chọn cột này để gán trigger hàng loạt"
                      />
                      <button
                        type="button"
                        onClick={() => onSetModuleTarget?.(vc, 'vc', linked ? null : editingStageId)}
                        className="cursor-pointer hover:text-orange-700"
                        title="Map cột VC/LĐ này vào CRM stage đang sửa"
                      >
                        {vc.icon || '📋'} {vc.name}
                        {linked && ' ✓'}
                      </button>
                      <span className="w-px h-3 bg-gray-300" />
                      <button
                        type="button"
                        onClick={() => onSetVcSyncType?.(vc, 'delivery')}
                        className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                          isDelivery
                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-700'
                        }`}
                        title="Tick để khi kéo vào cột này CRM tự chuyển role «Vận chuyển»"
                      >
                        🚚
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetVcSyncType?.(vc, 'installation')}
                        className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                          isInstallation
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300 hover:text-amber-700'
                        }`}
                        title="Tick để khi kéo vào cột này CRM tự chuyển role «Lắp đặt»"
                      >
                        🔧
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="h-8 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs cursor-pointer">Hủy</button>
        <button onClick={onSave} className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 cursor-pointer flex items-center gap-1">
          <Save className="h-3.5 w-3.5" /> Lưu
        </button>
      </div>
    </div>
  );
}

/**
 * Modal «Gán cột Sản xuất» — bulk multi-select các cột production_pipeline_stages
 * (đa công ty / đa phân loại) cùng map về 1 cột CRM (sync_role=sx_production).
 */
function SxAssignModal({ stageId, stageName, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [columns, setColumns] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/crm/pipeline-stages/${stageId}/production-columns`);
        if (!alive) return;
        const cols = data?.production_columns || [];
        setColumns(cols);
        setSelected(new Set(cols.filter((c) => c.assigned).map((c) => c.id)));
      } catch (e) {
        alert('Lỗi tải cột SX: ' + (e.response?.data?.error || e.message));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [stageId]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? columns.filter((c) => (
        (c.name || '').toLowerCase().includes(q)
        || (c.company?.name || '').toLowerCase().includes(q)
        || (c.workshop_type?.name || '').toLowerCase().includes(q)
      ))
      : columns;
    const map = new Map();
    for (const c of filtered) {
      const compKey = c.company?.id || '__none__';
      const compName = c.company?.name || '— Không thuộc công ty —';
      if (!map.has(compKey)) map.set(compKey, { compName, types: new Map() });
      const grp = map.get(compKey);
      const typeKey = c.workshop_type?.id || '__none__';
      const typeName = c.workshop_type?.name || '— Chung —';
      if (!grp.types.has(typeKey)) grp.types.set(typeKey, { typeName, cols: [] });
      grp.types.get(typeKey).cols.push(c);
    }
    return Array.from(map.values()).map((g) => ({
      compName: g.compName,
      types: Array.from(g.types.values()),
    }));
  }, [columns, search]);

  const toggleGroup = (cols, on) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of cols) {
        if (on) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/crm/pipeline-stages/${stageId}/assign-production-columns`, {
        production_pipeline_stage_ids: Array.from(selected),
        replace_existing: true,
      });
      onSaved?.();
    } catch (e) {
      alert('Lỗi lưu: ' + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Factory className="h-4 w-4 text-teal-600" /> Gán cột Sản xuất
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Tích các cột pipeline SX (đa công ty) sẽ đẩy deal về cột CRM <strong>«{stageName}»</strong> khi xưởng chuyển stage.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 cursor-pointer">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="p-3 border-b bg-gray-50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên cột / công ty / phân loại…"
              className="w-full h-8 pl-8 pr-3 border rounded-lg text-sm bg-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Đang tải…
            </div>
          ) : groups.length === 0 ? (
            <p className="text-center py-10 text-gray-400 text-sm">Không có cột pipeline SX phù hợp.</p>
          ) : groups.map((g, gi) => {
            const allCompanyCols = g.types.flatMap((t) => t.cols);
            const compAllSelected = allCompanyCols.length > 0 && allCompanyCols.every((c) => selected.has(c.id));
            const compSomeSelected = allCompanyCols.some((c) => selected.has(c.id));
            return (
            <div key={gi} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-100 text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>🏢 {g.compName} <span className="text-gray-500 font-normal">({allCompanyCols.length} cột)</span></span>
                <button
                  type="button"
                  onClick={() => toggleGroup(allCompanyCols, !compAllSelected)}
                  className={`text-[10px] px-2 py-0.5 rounded border font-semibold cursor-pointer ${
                    compAllSelected
                      ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                      : compSomeSelected
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  title={compAllSelected ? 'Bỏ chọn toàn bộ công ty' : 'Chọn toàn bộ cột pipeline SX của công ty này (mọi phân loại)'}
                >
                  {compAllSelected ? '✓ Đã chọn cả công ty — bấm để bỏ' : compSomeSelected ? `Chọn nốt (${allCompanyCols.length - allCompanyCols.filter((c) => selected.has(c.id)).length})` : 'Chọn cả công ty'}
                </button>
              </div>
              {g.types.map((t, ti) => {
                const allCols = t.cols;
                const allSelected = allCols.every((c) => selected.has(c.id));
                const someSelected = allCols.some((c) => selected.has(c.id));
                return (
                  <div key={ti} className="border-t border-gray-200">
                    <div className="px-3 py-1.5 bg-teal-50/50 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-teal-800">
                        🏭 {t.typeName} <span className="text-gray-500 font-normal">({allCols.length} cột)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleGroup(allCols, !allSelected)}
                        className="text-[10px] px-2 py-0.5 rounded border border-teal-300 text-teal-700 hover:bg-teal-100 cursor-pointer"
                      >
                        {allSelected ? 'Bỏ chọn nhóm' : 'Chọn cả phân loại'}
                      </button>
                    </div>
                    <div className="p-2 grid grid-cols-2 md:grid-cols-3 gap-1.5">
                      {allCols.map((c) => {
                        const isOn = selected.has(c.id);
                        const conflicts = c.crm_target_stage_id && String(c.crm_target_stage_id) !== String(stageId);
                        return (
                          <label
                            key={c.id}
                            className={`flex items-start gap-1.5 px-2 py-1.5 rounded border text-xs cursor-pointer transition-all ${
                              isOn
                                ? 'bg-teal-50 border-teal-400 text-teal-900'
                                : 'bg-white border-gray-200 hover:border-teal-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => toggle(c.id)}
                              className="mt-0.5 rounded border-gray-300"
                            />
                            <span className="flex-1 min-w-0">
                              <span className="font-medium block truncate">
                                {c.icon || '📋'} {c.name}
                              </span>
                              {conflicts && !isOn && (
                                <span className="text-[10px] text-amber-700 block">
                                  ⚠ Đang map sang cột CRM khác — tick để chuyển về đây
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })}
        </div>

        <div className="p-3 border-t bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            Đã chọn <strong className="text-teal-700">{selected.size}</strong> cột
            <span className="text-gray-400 ml-2">(các cột không tick sẽ bị bỏ gán khỏi «{stageName}»)</span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-8 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs hover:bg-gray-200 cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={save}
              disabled={loading || saving}
              className="h-8 px-4 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700 cursor-pointer disabled:opacity-50 flex items-center gap-1"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
