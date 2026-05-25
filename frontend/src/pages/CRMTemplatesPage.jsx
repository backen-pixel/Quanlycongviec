import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../lib/api';
import { fetchPipelineStagesById } from '../lib/crmPipelineStages';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { Plus, Trash2, Save, ChevronDown, ChevronRight, Edit2, X, CheckSquare, GripVertical, Shield, Lock, Building2, Workflow, Globe, MapPin, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ═══ STAGES cố định cho chế độ "Bộ mẫu chung (Global)" — áp dụng tất cả công ty ═══
const LEAD_STAGES = [
  { slug: 'consulting', label: 'Tư vấn', icon: '💬', color: '#3B82F6' },
  { slug: 'design', label: 'Thiết kế', icon: '🎨', color: '#8B5CF6' },
  { slug: 'quotation', label: 'Báo giá', icon: '💰', color: '#F59E0B' },
  { slug: 'contract', label: 'Hợp đồng', icon: '📝', color: '#10B981' },
];

const DEAL_STAGES = [
  { slug: 'deal_new', label: 'Nhiệm vụ Deal mới', icon: '📋', color: '#3B82F6' },
  { slug: 'deal_quote_contract', label: 'Báo giá & Hợp đồng', icon: '📄', color: '#8B5CF6' },
  { slug: 'deal_ordering', label: 'Tiến hành đặt hàng', icon: '🛒', color: '#F59E0B' },
  { slug: 'deal_schedule', label: 'Hẹn ngày lắp đặt', icon: '📅', color: '#10B981' },
  { slug: 'deal_shipping', label: 'Đặt Vận chuyển', icon: '🚛', color: '#EF4444' },
  { slug: 'deal_notes', label: 'Ghi chú khác', icon: '📝', color: '#6B7280' },
];

const ALL_STAGES = [...LEAD_STAGES, ...DEAL_STAGES];

// ═══ Sortable Item component ═══
function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 50 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  );
}

export default function CRMTemplatesPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user) || user?.role === 'super_admin';
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [editingTpl, setEditingTpl] = useState(null);
  const [newItem, setNewItem] = useState({});
  const [showAddTpl, setShowAddTpl] = useState(false);
  const [newTpl, setNewTpl] = useState({ name: '', stage_slug: '', pipeline_stage_id: '' });
  const [activeTab, setActiveTab] = useState('deal');
  const [editingChecklist, setEditingChecklist] = useState({});
  const [newCheckItem, setNewCheckItem] = useState({});
  const [editingVisibility, setEditingVisibility] = useState({}); // {itemId: true/false}
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);

  // ── Chọn pipeline thật theo công ty ──
  // Mặc định: chọn công ty của user (nếu có) để page mở ra ở chế độ Pipeline ngay.
  // - saved === null  → user chưa từng chọn (lần đầu vào trang) → sẽ auto-pick công ty đầu tiên
  // - saved === ''    → user đã chủ động chọn "Bộ mẫu chung (Global)" → tôn trọng lựa chọn
  // - saved === '<id>' → giữ công ty đã chọn lần trước
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    try {
      const saved = localStorage.getItem('crm_tpl_company_id');
      if (saved !== null) return saved;
    } catch { /* ignore */ }
    return user?.company_id ? String(user.company_id) : '';
  });
  const [selectedPipelineId, setSelectedPipelineId] = useState(() => {
    try { return localStorage.getItem('crm_tpl_pipeline_id') || ''; } catch { return ''; }
  });
  const [pipelines, setPipelines] = useState([]);
  const [pipelineStages, setPipelineStages] = useState([]);          // crm_pipeline_stages của pipeline đang chọn
  // Toàn bộ pipelines + stages của công ty đã chọn → dùng cho dropdown chọn stage trong TemplateCard
  // (cho phép gắn template vào BẤT KỲ pipeline nào của công ty, không phụ thuộc pipeline đang xem ở picker trên)
  const [companyPipelinesAll, setCompanyPipelinesAll] = useState([]); // [{id,name,stages:[{id,name,icon,color,pipeline_type}]}]

  // ── Inline edit cho Pipeline Stages ──
  const [editingStageId, setEditingStageId] = useState(null);
  const [stageEditForm, setStageEditForm] = useState({ name: '', icon: '', color: '#3B82F6' });
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageForm, setNewStageForm] = useState({ name: '', icon: '📌', color: '#3B82F6' });

  // Banner cảnh báo khi DB thiếu bảng crm_pipelines (chưa chạy migration 21)
  const [pipelinesTableMissing, setPipelinesTableMissing] = useState(false);
  const [companyRegions, setCompanyRegions] = useState([]);
  const [applyingToRegions, setApplyingToRegions] = useState(false);
  const [applyRegionsResult, setApplyRegionsResult] = useState(null);

  // Ref để bỏ qua việc save vào localStorage ở lần render đầu tiên
  // (tránh đè saved=null bằng saved="" làm mất khả năng auto-pick)
  const initialMountRef = useRef(true);
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    try { localStorage.setItem('crm_tpl_company_id', selectedCompanyId || ''); } catch { /* ignore */ }
  }, [selectedCompanyId]);
  useEffect(() => {
    try { localStorage.setItem('crm_tpl_pipeline_id', selectedPipelineId || ''); } catch { /* ignore */ }
  }, [selectedPipelineId]);

  // Nếu state khởi tạo lúc user chưa load → đồng bộ lại khi có user.company_id
  useEffect(() => {
    if (!selectedCompanyId && user?.company_id) {
      setSelectedCompanyId(String(user.company_id));
    }
  }, [user?.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pick công ty đầu tiên khi user CHƯA từng chọn (admin vào lần đầu)
  // Chỉ chạy khi: chưa chọn công ty + chưa có saved trong localStorage + danh sách companies đã load.
  useEffect(() => {
    if (selectedCompanyId) return;
    let savedRaw = null;
    try { savedRaw = localStorage.getItem('crm_tpl_company_id'); } catch { /* ignore */ }
    if (savedRaw !== null) return; // user đã chủ động pick (kể cả ""), tôn trọng
    if (companies.length > 0) {
      setSelectedCompanyId(String(companies[0].id));
    }
  }, [companies, selectedCompanyId]);

  const isPipelineMode = !!selectedPipelineId;

  /** Pipeline nào dùng làm "nguồn stages" cho preview/dropdown khi Global mode (không pick pipeline cụ thể):
   *  ưu tiên pipeline mặc định của công ty, không thì pipeline đầu tiên có stages.
   */
  const fallbackCompanyPipeline = useMemo(() => {
    if (!companyPipelinesAll.length) return null;
    const withStages = (pl) => Array.isArray(pl.stages) && pl.stages.length > 0;
    const def = companyPipelinesAll.find((p) => p.is_default && withStages(p));
    if (def) return def;
    return companyPipelinesAll.find(withStages) || null;
  }, [companyPipelinesAll]);

  /** Stages hiển thị nhóm bộ mẫu:
   *  - Pipeline cụ thể đã chọn → dùng stages của pipeline đó (pipelineStages)
   *  - Chưa pick pipeline NHƯNG đã pick công ty → dùng stages của pipeline mặc định/đầu tiên của công ty
   *  - Chưa pick gì cả → fallback LEAD_STAGES / DEAL_STAGES hardcoded (chỉ khi admin chưa pick công ty)
   */
  const currentStages = useMemo(() => {
    const mapToUi = (stages) => (stages || [])
      .filter((s) => (s.pipeline_type ? s.pipeline_type === activeTab || s.pipeline_type === 'both' : true))
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map((s) => ({
        slug: s.id,
        id: s.id,
        label: s.name,
        icon: s.icon || '📌',
        color: s.color || '#6B7280',
        isPipelineStage: true,
        order_index: s.order_index,
      }));

    if (isPipelineMode) {
      return mapToUi(pipelineStages);
    }
    // Global mode but company chosen → dùng pipeline mặc định/đầu tiên của công ty
    if (selectedCompanyId && fallbackCompanyPipeline) {
      return mapToUi(fallbackCompanyPipeline.stages);
    }
    // Không có công ty nào / công ty chưa có pipeline → hardcoded slugs
    return activeTab === 'lead' ? LEAD_STAGES : DEAL_STAGES;
  }, [isPipelineMode, pipelineStages, activeTab, selectedCompanyId, fallbackCompanyPipeline]);

  /** Trạng thái thực tế của preview:
   *  - 'pipeline':  pick pipeline cụ thể → stages từ pipelineStages
   *  - 'company':   Global mode + đã pick công ty → stages từ company default pipeline
   *  - 'global':    chưa pick công ty → hardcoded slugs
   */
  const stagesSource = useMemo(() => {
    if (isPipelineMode) return 'pipeline';
    if (selectedCompanyId && fallbackCompanyPipeline) return 'company';
    return 'global';
  }, [isPipelineMode, selectedCompanyId, fallbackCompanyPipeline]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = async (opts = {}) => {
    const silent = !!opts.silent;
    if (!silent) setLoading(true);
    try {
      const tplParams = selectedPipelineId ? { pipeline_id: selectedPipelineId } : {};
      const [tplRes, compRes, deptRes] = await Promise.all([
        api.get('/crm/task-templates', { params: tplParams }),
        api.get('/companies', { params: { for_module: 'crm' } }).catch(() => ({ data: [] })),
        api.get('/departments').catch(() => ({ data: [] })),
      ]);
      setTemplates(tplRes.data || []);
      const compList = compRes.data?.companies || compRes.data || [];
      setCompanies(compList);
      setDepartments(deptRes.data?.departments || deptRes.data || []);
      // Auto-pick công ty đầu tiên cho admin → xử lý ở useEffect riêng (theo dõi companies)

      // Chỉ auto-expand bộ mẫu lần đầu thấy — giữ nguyên trạng thái expand/collapse user đã chọn.
      setExpanded((prev) => {
        const next = { ...prev };
        (tplRes.data || []).forEach((t) => {
          if (next[t.id] === undefined) next[t.id] = true;
        });
        return next;
      });
    } catch {}
    if (!silent) setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedPipelineId]);

  // ── Helpers: cập nhật state cục bộ thay vì load lại toàn trang sau mỗi thao tác CRUD ──
  const upsertTemplateLocal = (tplPartial) => {
    if (!tplPartial?.id) return;
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === tplPartial.id);
      if (idx === -1) return [...prev, { items: [], ...tplPartial }];
      const next = [...prev];
      next[idx] = { ...next[idx], ...tplPartial };
      return next;
    });
  };
  const removeTemplateLocal = (tplId) => {
    setTemplates((prev) => prev.filter((t) => t.id !== tplId));
    setExpanded((p) => { const n = { ...p }; delete n[tplId]; return n; });
  };
  const upsertItemLocal = (tplId, itemPartial) => {
    if (!itemPartial?.id) return;
    setTemplates((prev) => prev.map((t) => {
      if (t.id !== tplId) return t;
      const items = Array.isArray(t.items) ? t.items : [];
      const idx = items.findIndex((i) => i.id === itemPartial.id);
      if (idx === -1) return { ...t, items: [...items, itemPartial] };
      const nextItems = [...items];
      nextItems[idx] = { ...nextItems[idx], ...itemPartial };
      return { ...t, items: nextItems };
    }));
  };
  const removeItemLocal = (tplId, itemId) => {
    setTemplates((prev) => prev.map((t) => {
      if (t.id !== tplId) return t;
      const items = Array.isArray(t.items) ? t.items : [];
      return { ...t, items: items.filter((i) => i.id !== itemId) };
    }));
  };

  // Khu vực CRM của công ty đang chọn (để áp dụng bộ mẫu toàn công ty)
  useEffect(() => {
    let active = true;
    if (!selectedCompanyId) {
      setCompanyRegions([]);
      return undefined;
    }
    api.get('/crm/company-regions', { params: { company_id: selectedCompanyId, for_module: 'crm' } })
      .then((r) => { if (active) setCompanyRegions(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (active) setCompanyRegions([]); });
    return () => { active = false; };
  }, [selectedCompanyId]);

  // ── Load pipelines theo công ty đã chọn (+ auto-pick pipeline mặc định) ──
  useEffect(() => {
    let active = true;
    const fetchPipelines = async () => {
      if (!selectedCompanyId) {
        setPipelines([]);
        setSelectedPipelineId('');
        return;
      }
      try {
        const { data } = await api.get('/crm/pipelines');
        if (!active) return;
        setPipelinesTableMissing(false);
        const list = (data || []).filter((p) => String(p.company_id || '') === String(selectedCompanyId));
        setPipelines(list);

        // Auto-pick: ưu tiên pipeline đang chọn (nếu vẫn thuộc công ty), kế đến pipeline mặc định, cuối cùng pipeline đầu danh sách.
        if (!list.length) {
          setSelectedPipelineId('');
          return;
        }
        const current = list.find((p) => p.id === selectedPipelineId);
        if (current) return;
        const def = list.find((p) => p.is_default) || list[0];
        if (def?.id) setSelectedPipelineId(def.id);
      } catch (e) {
        if (!active) return;
        const code = e?.response?.data?.code;
        if (code === 'CRM_PIPELINES_TABLE_MISSING') {
          setPipelinesTableMissing(true);
        }
        setPipelines([]);
        setSelectedPipelineId('');
      }
    };
    fetchPipelines();
    return () => { active = false; };
  }, [selectedCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load TOÀN BỘ pipelines (+ stages) của công ty đã chọn để render dropdown TemplateCard ──
  useEffect(() => {
    let active = true;
    const fetchAll = async () => {
      if (!selectedCompanyId || !pipelines.length) {
        if (active) setCompanyPipelinesAll([]);
        return;
      }
      try {
        const results = await Promise.all(
          pipelines.map(async (p) => {
            const { stages, tableMissing } = await fetchPipelineStagesById(p.id);
            if (tableMissing && active) setPipelinesTableMissing(true);
            return {
              id: p.id,
              name: p.name,
              is_default: !!p.is_default,
              stages,
              error: tableMissing ? 'CRM_PIPELINES_TABLE_MISSING' : null,
            };
          })
        );
        if (active) setCompanyPipelinesAll(results);
      } catch {
        if (active) setCompanyPipelinesAll([]);
      }
    };
    fetchAll();
    return () => { active = false; };
  }, [selectedCompanyId, pipelines]);

  // ── Load stages thật khi pipeline được chọn ──
  useEffect(() => {
    let active = true;
    const fetchStages = async () => {
      if (!selectedPipelineId) {
        setPipelineStages([]);
        return;
      }
      try {
        const { stages, tableMissing } = await fetchPipelineStagesById(selectedPipelineId);
        if (!active) return;
        if (tableMissing) setPipelinesTableMissing(true);
        else setPipelinesTableMissing(false);
        setPipelineStages(stages);
      } catch {
        if (active) setPipelineStages([]);
      }
    };
    fetchStages();
    return () => { active = false; };
  }, [selectedPipelineId]);

  /** Lọc bộ mẫu để hiển thị:
   *  - Pipeline-specific (đã pick pipeline): chỉ template gắn vào pipeline đó
   *  - Company-default (đã pick công ty, chưa pick pipeline): template gắn vào pipeline mặc định của công ty
   *  - Pure Global (chưa pick công ty): template không gắn pipeline_stage_id, lọc theo slug
   */
  const filteredTemplates = useMemo(() => {
    // Stages "đang hoạt động" (target pipeline stages)
    const activeStages = (() => {
      if (isPipelineMode) return pipelineStages;
      if (selectedCompanyId && fallbackCompanyPipeline) return fallbackCompanyPipeline.stages || [];
      return [];
    })();
    const activeStageIds = new Set(activeStages.map((s) => s.id));

    return templates.filter((t) => {
      const hasPipelineStage = !!t.pipeline_stage_id;
      if (activeStageIds.size > 0) {
        // Chế độ Pipeline (cụ thể hoặc theo công ty mặc định)
        if (!hasPipelineStage) return false;
        if (!activeStageIds.has(t.pipeline_stage_id)) return false;
        const st = activeStages.find((s) => s.id === t.pipeline_stage_id);
        if (st?.pipeline_type && st.pipeline_type !== 'both') return st.pipeline_type === activeTab;
        return true;
      }
      // Pure Global: chưa pick công ty / công ty không có pipeline
      if (hasPipelineStage) return false;
      const isDeal = t.stage_slug?.startsWith('deal_');
      return activeTab === 'deal' ? isDeal : !isDeal;
    });
  }, [templates, isPipelineMode, pipelineStages, selectedCompanyId, fallbackCompanyPipeline, activeTab]);

  // ═══ CRUD ═══
  const createTemplate = async () => {
    if (!newTpl.name.trim()) return;
    // Cần ít nhất 1 trong 2: pipeline_stage_id hoặc stage_slug
    if (!newTpl.pipeline_stage_id && !newTpl.stage_slug) {
      alert('Chọn giai đoạn cho bộ mẫu (pipeline của công ty hoặc bộ mẫu Global)');
      return;
    }
    try {
      const payload = {
        name: newTpl.name.trim(),
        ...(newTpl.pipeline_stage_id
          ? { pipeline_stage_id: newTpl.pipeline_stage_id, stage_slug: null }
          : { stage_slug: newTpl.stage_slug, pipeline_stage_id: null }),
      };
      const { data } = await api.post('/crm/task-templates', payload);
      setNewTpl({ name: '', stage_slug: '', pipeline_stage_id: '' });
      setShowAddTpl(false);
      if (data?.id) {
        upsertTemplateLocal({ ...data, items: [] });
        setExpanded((p) => ({ ...p, [data.id]: true }));
      } else {
        load({ silent: true });
      }
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteTemplate = async (id) => {
    if (!confirm('Xóa bộ mẫu này?')) return;
    try {
      await api.delete(`/crm/task-templates/${id}`);
      removeTemplateLocal(id);
    } catch { alert('Lỗi'); }
  };

  /** Áp dụng bộ mẫu pipeline hiện tại cho mọi lead/deal thuộc tất cả khu vực của công ty. */
  const applyTemplatesToAllRegions = async () => {
    if (!selectedCompanyId) {
      alert('Chọn công ty trước');
      return;
    }
    const pipelineId = effectivePipelineIdForStageEdit;
    if (!pipelineId) {
      alert('Công ty chưa có pipeline CRM. Tạo pipeline hoặc chọn pipeline ở picker phía trên.');
      return;
    }
    if (!filteredTemplates.length) {
      alert('Chưa có bộ mẫu nào cho pipeline/tab đang xem. Tạo bộ mẫu trước khi áp dụng.');
      return;
    }

    const pipelineName = pipelines.find((p) => p.id === pipelineId)?.name
      || fallbackCompanyPipeline?.name
      || 'pipeline';
    const regionLabel = companyRegions.length
      ? `${companyRegions.length} khu vực (${companyRegions.map((r) => r.name).join(', ')})`
      : 'mọi khu vực của công ty';

    const typeLabel = activeTab === 'deal' ? 'Deal' : 'Lead';
    const ok = window.confirm(
      `Áp dụng bộ mẫu ${typeLabel} từ pipeline «${pipelineName}» cho toàn bộ ${regionLabel}?\n\n`
      + 'Hệ thống sẽ:\n'
      + '• Chỉ gen nhiệm vụ cho lead/deal CHƯA CÓ nhiệm vụ CRM (mới tạo / tab Công việc rỗng)\n'
      + '• Lead/deal cũ đã có nhiệm vụ → giữ nguyên bộ cũ (bỏ qua)\n\n'
      + 'Muốn chuyển một lead/deal cũ sang bộ mới: mở tab Công việc → 「Gen lại đúng bộ mẫu」.\n'
      + 'Tiếp tục?',
    );
    if (!ok) return;

    setApplyingToRegions(true);
    setApplyRegionsResult(null);
    try {
      const { data } = await api.post('/crm/task-templates/apply-to-company-regions', {
        company_id: selectedCompanyId,
        pipeline_id: pipelineId,
        lead_type: activeTab,
      });
      setApplyRegionsResult(data);
      const msg = [
        `Đã quét ${data.scanned} ${typeLabel}.`,
        data.applied ? `Gen mới cho ${data.applied} lead/deal (chưa có nhiệm vụ).` : null,
        data.tasks_created ? `Tạo ${data.tasks_created} nhiệm vụ.` : null,
        data.skipped_has_tasks ? `Bỏ qua ${data.skipped_has_tasks} (đã có nhiệm vụ — giữ bộ cũ).` : null,
        data.pipeline_backfilled ? `Gán pipeline cho ${data.pipeline_backfilled} lead/deal.` : null,
        data.skipped_other_pipeline ? `Bỏ qua ${data.skipped_other_pipeline} (pipeline khác).` : null,
        data.errors?.length ? `Lỗi: ${data.errors.length} bản ghi.` : null,
      ].filter(Boolean).join('\n');
      alert(msg || 'Hoàn tất');
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi áp dụng bộ mẫu');
    } finally {
      setApplyingToRegions(false);
    }
  };

  // Pipeline ID hiệu lực cho các thao tác CRUD stage:
  //  - Nếu user đã pick pipeline cụ thể → dùng nó
  //  - Nếu Global mode nhưng có công ty + có pipeline mặc định → dùng pipeline mặc định đó
  const effectivePipelineIdForStageEdit = selectedPipelineId || fallbackCompanyPipeline?.id || '';

  // ── Pipeline Stages CRUD (inline trên Stages preview) ──
  const reloadPipelineStages = async () => {
    const pid = effectivePipelineIdForStageEdit;
    if (!pid) return;
    try {
      const { stages, tableMissing } = await fetchPipelineStagesById(pid);
      if (tableMissing) setPipelinesTableMissing(true);
      if (selectedPipelineId === pid) setPipelineStages(stages);
      setCompanyPipelinesAll((prev) =>
        prev.map((pl) => (pl.id === pid ? { ...pl, stages } : pl))
      );
    } catch { /* ignore */ }
  };

  const openStageEdit = (stage) => {
    setEditingStageId(stage.id);
    setStageEditForm({
      name: stage.label || stage.name || '',
      icon: stage.icon || '📌',
      color: stage.color || '#3B82F6',
    });
  };

  const saveStageEdit = async () => {
    if (!editingStageId) return;
    if (!stageEditForm.name.trim()) { alert('Nhập tên giai đoạn'); return; }
    try {
      await api.put(`/crm/pipeline-stages/${editingStageId}`, {
        name: stageEditForm.name.trim(),
        icon: stageEditForm.icon || null,
        color: stageEditForm.color || '#94A3B8',
      });
      setEditingStageId(null);
      await reloadPipelineStages();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi cập nhật giai đoạn'); }
  };

  const deleteStage = async (stage) => {
    const usedBy = filteredTemplates.filter((t) => t.pipeline_stage_id === stage.id).length;
    const msg = usedBy > 0
      ? `Giai đoạn "${stage.label || stage.name}" đang được ${usedBy} bộ mẫu sử dụng. Xóa sẽ làm các bộ mẫu này bị mất gắn pipeline. Tiếp tục?`
      : `Xóa giai đoạn "${stage.label || stage.name}"?`;
    if (!confirm(msg)) return;
    try {
      await api.delete(`/crm/pipeline-stages/${stage.id}`);
      await reloadPipelineStages();
      // Một số template có thể bị mất pipeline_stage_id sau khi xóa stage → refresh ngầm để badge cập nhật,
      // không bật lại loading spinner toàn trang.
      load({ silent: true });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi xóa giai đoạn'); }
  };

  const createStage = async () => {
    const pid = effectivePipelineIdForStageEdit;
    if (!pid) { alert('Chưa có pipeline để thêm giai đoạn. Hãy tạo pipeline cho công ty này ở phần Cài đặt Pipeline.'); return; }
    if (!newStageForm.name.trim()) { alert('Nhập tên giai đoạn'); return; }
    try {
      await api.post('/crm/pipeline-stages', {
        pipeline_id: pid,
        pipeline_type: activeTab, // 'lead' hoặc 'deal'
        name: newStageForm.name.trim(),
        icon: newStageForm.icon || null,
        color: newStageForm.color || '#94A3B8',
      });
      setShowAddStage(false);
      setNewStageForm({ name: '', icon: '📌', color: '#3B82F6' });
      await reloadPipelineStages();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi tạo giai đoạn'); }
  };

  const addItem = async (tplId) => {
    const item = newItem[tplId];
    if (!item?.title?.trim()) return;
    try {
      const { data } = await api.post(`/crm/task-templates/${tplId}/items`, { ...item, checklist: item.checklist || [] });
      setNewItem(p => ({ ...p, [tplId]: { title: '', priority: 'medium', deadline_days: 0 } }));
      if (data?.id) upsertItemLocal(tplId, data);
      else load({ silent: true });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteItem = async (tplId, itemId) => {
    try {
      await api.delete(`/crm/task-templates/${tplId}/items/${itemId}`);
      removeItemLocal(tplId, itemId);
    } catch {}
  };

  const updateTemplateItemFields = async (tplId, itemId, body) => {
    try {
      const { data } = await api.put(`/crm/task-templates/${tplId}/items/${itemId}`, body);
      if (data?.id) upsertItemLocal(tplId, data);
      else upsertItemLocal(tplId, { id: itemId, ...body });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật mục mẫu');
      throw e;
    }
  };

  const toggleDefault = async (tpl) => {
    try {
      const { data } = await api.put(`/crm/task-templates/${tpl.id}`, { is_default: !tpl.is_default });
      if (data?.id) upsertTemplateLocal(data);
      else upsertTemplateLocal({ id: tpl.id, is_default: !tpl.is_default });
    } catch {}
  };

  const updateTemplate = async () => {
    if (!editingTpl || !editingTpl.name.trim()) return;
    try {
      const payload = { name: editingTpl.name.trim() };
      if (editingTpl.pipeline_stage_id !== undefined && editingTpl.pipeline_stage_id !== null) {
        payload.pipeline_stage_id = editingTpl.pipeline_stage_id || null;
      }
      if (editingTpl.stage_slug !== undefined) {
        payload.stage_slug = editingTpl.stage_slug || null;
      }
      const { data } = await api.put(`/crm/task-templates/${editingTpl.id}`, payload);
      const editingId = editingTpl.id;
      setEditingTpl(null);
      if (data?.id) upsertTemplateLocal(data);
      else upsertTemplateLocal({ id: editingId, ...payload });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  // ═══ Checklist CRUD ═══
  const updateItemChecklist = async (tplId, itemId, checklist) => {
    try {
      const { data } = await api.put(`/crm/task-templates/${tplId}/items/${itemId}`, { checklist });
      if (data?.id) upsertItemLocal(tplId, data);
      else upsertItemLocal(tplId, { id: itemId, checklist });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const updateItemVisibility = async (tplId, itemId, allowedCompanies, allowedDepts) => {
    try {
      const payload = {
        default_allowed_companies: allowedCompanies?.length ? allowedCompanies : null,
        default_allowed_departments: allowedDepts?.length ? allowedDepts : null,
      };
      const { data } = await api.put(`/crm/task-templates/${tplId}/items/${itemId}`, payload);
      if (data?.id) upsertItemLocal(tplId, data);
      else upsertItemLocal(tplId, { id: itemId, ...payload });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const toggleItemCompany = (tplId, itemId, companyId, item) => {
    const current = item.default_allowed_companies || [];
    const next = current.includes(companyId) ? current.filter(x => x !== companyId) : [...current, companyId];
    updateItemVisibility(tplId, itemId, next, item.default_allowed_departments);
  };

  const toggleItemDept = (tplId, itemId, deptId, item) => {
    const current = item.default_allowed_departments || [];
    const next = current.includes(deptId) ? current.filter(x => x !== deptId) : [...current, deptId];
    updateItemVisibility(tplId, itemId, item.default_allowed_companies, next);
  };

  const addChecklistItem = async (tplId, itemId) => {
    const text = newCheckItem[itemId]?.trim();
    if (!text) return;
    const tpl = templates.find(t => t.id === tplId);
    const item = tpl?.items?.find(i => i.id === itemId);
    const current = Array.isArray(item?.checklist) ? item.checklist : [];
    await updateItemChecklist(tplId, itemId, [...current, text]);
    setNewCheckItem(p => ({ ...p, [itemId]: '' }));
  };

  const removeChecklistItem = async (tplId, itemId, idx) => {
    const tpl = templates.find(t => t.id === tplId);
    const item = tpl?.items?.find(i => i.id === itemId);
    const current = Array.isArray(item?.checklist) ? [...item.checklist] : [];
    current.splice(idx, 1);
    await updateItemChecklist(tplId, itemId, current);
  };

  // ═══ DRAG & DROP: Reorder items within a template ═══
  const handleItemDragEnd = async (event, tplId) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const tpl = templates.find(t => t.id === tplId);
    if (!tpl) return;
    const sorted = [...(tpl.items || [])].sort((a, b) => a.order_index - b.order_index);
    const oldIdx = sorted.findIndex(i => i.id === active.id);
    const newIdx = sorted.findIndex(i => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    // Reorder locally first for instant feedback
    const reordered = [...sorted];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);

    // Update local state immediately
    setTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      return { ...t, items: reordered.map((item, i) => ({ ...item, order_index: i })) };
    }));

    // Save to backend
    try {
      await Promise.all(reordered.map((item, i) =>
        api.put(`/crm/task-templates/${tplId}/items/${item.id}`, { order_index: i })
      ));
    } catch { load({ silent: true }); } // Reload on error
  };

  // ═══ DRAG & DROP: Reorder templates within a stage ═══
  const handleTemplateDragEnd = async (event, stageSlug) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const stageTpls = filteredTemplates
      .filter(t => t.stage_slug === stageSlug)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    
    const oldIdx = stageTpls.findIndex(t => t.id === active.id);
    const newIdx = stageTpls.findIndex(t => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = [...stageTpls];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);

    // Update local state
    setTemplates(prev => {
      const updated = [...prev];
      reordered.forEach((tpl, i) => {
        const idx = updated.findIndex(t => t.id === tpl.id);
        if (idx >= 0) updated[idx] = { ...updated[idx], order_index: i };
      });
      return updated;
    });

    // Save to backend
    try {
      await Promise.all(reordered.map((tpl, i) =>
        api.put(`/crm/task-templates/${tpl.id}`, { order_index: i })
      ));
    } catch { load({ silent: true }); }
  };

  // ═══ DRAG & DROP: Reorder checklist items ═══
  const handleChecklistDragEnd = async (event, tplId, itemId) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const tpl = templates.find(t => t.id === tplId);
    const item = tpl?.items?.find(i => i.id === itemId);
    const checklist = Array.isArray(item?.checklist) ? [...item.checklist] : [];

    const oldIdx = parseInt(active.id.split('-').pop());
    const newIdx = parseInt(over.id.split('-').pop());
    if (isNaN(oldIdx) || isNaN(newIdx)) return;

    const [moved] = checklist.splice(oldIdx, 1);
    checklist.splice(newIdx, 0, moved);

    // Update local
    setTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      return { ...t, items: (t.items || []).map(i => i.id === itemId ? { ...i, checklist } : i) };
    }));

    // Save
    await updateItemChecklist(tplId, itemId, checklist);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );

  const openAddTplForm = () => {
    setShowAddTpl(true);
    // Mặc định: chọn stage đầu tiên của pipeline đang xem (nếu có), không thì để trống cho user pick.
    if (isPipelineMode && currentStages[0]?.id) {
      setNewTpl({ name: '', stage_slug: '', pipeline_stage_id: currentStages[0].id });
    } else {
      setNewTpl({ name: '', stage_slug: '', pipeline_stage_id: '' });
    }
  };

  /** Helper đếm bộ mẫu theo stage:
   *  - Mọi pipeline mode (cụ thể hoặc theo công ty mặc định): dùng pipeline_stage_id (UUID)
   *  - Pure Global: dùng stage_slug
   */
  const countTplForStage = (s) => {
    if (s.isPipelineStage || s.id !== s.slug) {
      return filteredTemplates.filter((t) => t.pipeline_stage_id === s.id).length;
    }
    return filteredTemplates.filter((t) => t.stage_slug === s.slug && !t.pipeline_stage_id).length;
  };

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📋 Bộ nhiệm vụ mẫu CRM</h1>
          <p className="text-sm text-gray-500">
            {filteredTemplates.length} bộ mẫu {activeTab === 'deal' ? 'Deal' : 'Lead'}
            {' — '}
            {stagesSource === 'pipeline' && <>theo pipeline <b>{pipelines.find((p) => p.id === selectedPipelineId)?.name || ''}</b></>}
            {stagesSource === 'company' && <>theo pipeline mặc định <b>{fallbackCompanyPipeline?.name || ''}</b> của công ty</>}
            {stagesSource === 'global' && <>chế độ <b>Chung (áp dụng tất cả công ty)</b></>}
            . Kéo thả để sắp xếp.
          </p>
          <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Bật biểu tượng ổ khóa trên nhiệm vụ để <b>bắt buộc hoàn thành trước khi chuyển giai đoạn</b> kế tiếp (không áp dụng khi kéo sang Thắng/Thua).
          </p>
        </div>
        <button onClick={openAddTplForm}
          className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm bộ mẫu
        </button>
      </div>

      {/* Company + Pipeline picker */}
      <div className="rounded-xl border bg-white p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          <Building2 className="h-4 w-4 text-blue-600" /> Phạm vi áp dụng
        </div>
        <select
          value={selectedCompanyId}
          onChange={(e) => setSelectedCompanyId(e.target.value)}
          className="h-9 px-3 rounded-lg border text-sm bg-white min-w-[240px] cursor-pointer"
          title="Chọn công ty để xem bộ mẫu theo pipeline của công ty đó"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>🏢 {c.short_name || c.name}</option>
          ))}
          {isAdmin && (
            <option value="">🌐 Bộ mẫu chung (Global — áp dụng tất cả công ty)</option>
          )}
        </select>
        <select
          value={selectedPipelineId}
          onChange={(e) => setSelectedPipelineId(e.target.value)}
          disabled={!selectedCompanyId || pipelines.length === 0}
          className="h-9 px-3 rounded-lg border text-sm bg-white min-w-[220px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title={!selectedCompanyId ? 'Chọn công ty trước' : (pipelines.length === 0 ? 'Công ty này chưa có pipeline' : '')}
        >
          <option value="">— Bộ mẫu chung (Global) —</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              🔧 {p.name}{p.is_default ? ' (mặc định)' : ''}
            </option>
          ))}
        </select>
        {isPipelineMode ? (
          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full flex items-center gap-1">
            <Workflow className="h-3 w-3" /> Pipeline này — áp dụng cho mọi khu vực của công ty
          </span>
        ) : selectedCompanyId ? (
          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Theo pipeline mặc định — áp dụng cho toàn bộ khu vực công ty
          </span>
        ) : (
          <span className="text-[11px] text-sky-700 bg-sky-50 border border-sky-200 px-2 py-1 rounded-full flex items-center gap-1">
            <Globe className="h-3 w-3" /> Bộ mẫu chung — áp dụng tất cả công ty (fallback khi pipeline không có mẫu riêng)
          </span>
        )}
        {selectedCompanyId && effectivePipelineIdForStageEdit && (
          <button
            type="button"
            disabled={applyingToRegions || !filteredTemplates.length}
            onClick={() => void applyTemplatesToAllRegions()}
            className="h-9 px-3 rounded-lg text-sm font-medium border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
            title="Đồng bộ nhiệm vụ CRM cho mọi lead/deal thuộc tất cả khu vực của công ty (theo bộ mẫu pipeline đang xem)"
          >
            <RefreshCw className={`h-4 w-4 ${applyingToRegions ? 'animate-spin' : ''}`} />
            {applyingToRegions ? 'Đang áp dụng...' : 'Áp dụng cho toàn bộ khu vực'}
          </button>
        )}
      </div>

      {applyRegionsResult && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs text-violet-900 space-y-1">
          <p className="font-semibold">Kết quả áp dụng bộ mẫu</p>
          <p>Đã quét: <b>{applyRegionsResult.scanned}</b> · Gen mới: <b>{applyRegionsResult.applied ?? applyRegionsResult.resynced ?? 0}</b> · Nhiệm vụ tạo: <b>{applyRegionsResult.tasks_created}</b></p>
          {(applyRegionsResult.skipped_has_tasks > 0 || applyRegionsResult.skipped_other_pipeline > 0) && (
            <p className="text-violet-700">
              {applyRegionsResult.skipped_has_tasks > 0 && <>Giữ bộ cũ: {applyRegionsResult.skipped_has_tasks} lead/deal đã có nhiệm vụ. </>}
              {applyRegionsResult.skipped_other_pipeline > 0 && <>Pipeline khác: {applyRegionsResult.skipped_other_pipeline}.</>}
            </p>
          )}
        </div>
      )}

      {selectedCompanyId && companyRegions.length > 0 && (
        <p className="text-[11px] text-gray-500 flex items-center gap-1 flex-wrap">
          <MapPin className="h-3 w-3" />
          Khu vực áp dụng ({companyRegions.length}):
          {companyRegions.map((r) => (
            <span key={r.id} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{r.name}</span>
          ))}
        </p>
      )}

      {/* Cảnh báo DB chưa có bảng crm_pipelines */}
      {pipelinesTableMissing && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            ⚠️ Database chưa được cài bảng <code className="px-1 bg-amber-100 rounded text-xs">crm_pipelines</code>
          </p>
          <p className="text-xs text-amber-800">
            Tính năng "Bộ mẫu theo pipeline công ty" yêu cầu các bảng pipeline. Bạn cần chạy các migration SQL sau trên Supabase
            (<b>SQL Editor</b>) theo thứ tự:
          </p>
          <ol className="text-xs text-amber-900 list-decimal ml-5 space-y-0.5">
            <li><code className="px-1 bg-amber-100 rounded">database/21_crm_pipelines.sql</code> — tạo bảng pipelines + stages</li>
            <li><code className="px-1 bg-amber-100 rounded">database/60_crm_pipelines_zalo_template.sql</code> — cột Zalo (tùy chọn)</li>
            <li><code className="px-1 bg-amber-100 rounded">database/213_crm_task_blocks_stage_advance.sql</code> — cờ chặn chuyển giai đoạn</li>
            <li><code className="px-1 bg-amber-100 rounded">database/214_crm_task_templates_pipeline_stage.sql</code> — gắn bộ mẫu vào pipeline_stage</li>
          </ol>
          <p className="text-[11px] text-amber-700">
            Sau khi chạy: <b>Settings → API → Reload schema</b> trên Supabase rồi tải lại trang. Trong lúc đó, bạn vẫn dùng được chế độ <b>Bộ mẫu chung (Global)</b> bên dưới.
          </p>
        </div>
      )}

      {/* Tab Lead / Deal */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[
          { key: 'deal', label: '🤝 Deal', desc: 'Quy trình xử lý Deal' },
          { key: 'lead', label: '📞 Lead', desc: 'Quy trình tư vấn Lead' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === tab.key ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
            <span className="block text-[10px] font-normal mt-0.5 opacity-70">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Stages preview — chỉnh sửa trực tiếp khi đang xem pipeline thật của công ty */}
      <div className={`rounded-xl p-4 border ${
        stagesSource === 'pipeline' ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200'
          : stagesSource === 'company' ? 'bg-gradient-to-r from-emerald-50/60 to-blue-50 border-emerald-100'
          : 'bg-gradient-to-r from-blue-50 to-purple-50 border-blue-100'
      }`}>
        <h3 className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider flex items-center gap-2 flex-wrap">
          <span>📊 Quy trình {activeTab === 'deal' ? 'Deal' : 'Lead'}</span>
          {stagesSource === 'pipeline' && (
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
              🔧 Pipeline: {pipelines.find((p) => p.id === selectedPipelineId)?.name} ({currentStages.length} bước)
            </span>
          )}
          {stagesSource === 'company' && (
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
              🏢 Theo pipeline của công ty: <b>{fallbackCompanyPipeline?.name}</b>{fallbackCompanyPipeline?.is_default ? ' (mặc định)' : ''} ({currentStages.length} bước)
            </span>
          )}
          {stagesSource === 'global' && (
            <span className="text-[10px] font-medium text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
              🌐 Stages cố định ({currentStages.length} bước) — chưa pick công ty
            </span>
          )}
          {(stagesSource === 'pipeline' || stagesSource === 'company') && (
            <span className="text-[10px] text-gray-500 normal-case font-normal">— click vào giai đoạn để sửa</span>
          )}
        </h3>
        {currentStages.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            {stagesSource === 'global'
              ? 'Chọn công ty ở picker phía trên để dùng pipeline thật.'
              : `Pipeline này chưa có giai đoạn ${activeTab === 'deal' ? 'Deal' : 'Lead'}. Bấm "+ Thêm giai đoạn" để bắt đầu.`}
          </p>
        ) : (
          <div className="flex items-center gap-1 flex-wrap pb-1">
            {currentStages.map((s, i) => (
              <div key={s.slug || s.id} className="flex items-center">
                {stagesSource !== 'global' ? (
                  <button
                    type="button"
                    onClick={() => openStageEdit(s)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer hover:scale-105 transition-transform"
                    style={{ backgroundColor: s.color + '18', color: s.color, border: `1px solid ${s.color}55` }}
                    title="Click để sửa tên / màu / icon hoặc xóa"
                  >
                    {s.icon} {s.label}
                    <span className="ml-1 opacity-60">({countTplForStage(s)})</span>
                    <Edit2 className="inline h-2.5 w-2.5 ml-1 opacity-60" />
                  </button>
                ) : (
                  <div className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                    style={{ backgroundColor: s.color + '18', color: s.color, border: `1px solid ${s.color}30` }}>
                    {s.icon} {s.label}
                    <span className="ml-1 opacity-60">({countTplForStage(s)})</span>
                  </div>
                )}
                {i < currentStages.length - 1 && <span className="text-gray-300 mx-1">→</span>}
              </div>
            ))}
            {stagesSource !== 'global' && (
              <button
                type="button"
                onClick={() => { setShowAddStage(true); setEditingStageId(null); }}
                className="ml-2 px-3 py-1.5 rounded-lg text-xs font-medium border-2 border-dashed border-emerald-400 text-emerald-700 hover:bg-emerald-100 cursor-pointer flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Thêm giai đoạn
              </button>
            )}
          </div>
        )}

        {/* Inline edit form — pipeline mode hoặc company-default mode */}
        {stagesSource !== 'global' && editingStageId && (
          <div className="mt-3 p-3 bg-white rounded-lg border border-emerald-300 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-emerald-700 uppercase">Sửa giai đoạn:</span>
            <input
              value={stageEditForm.icon}
              onChange={(e) => setStageEditForm((p) => ({ ...p, icon: e.target.value }))}
              placeholder="📌"
              className="h-8 w-14 px-2 text-center rounded border text-base"
              title="Emoji icon"
            />
            <input
              value={stageEditForm.name}
              onChange={(e) => setStageEditForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Tên giai đoạn..."
              className="flex-1 min-w-[160px] h-8 px-2 rounded border text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && saveStageEdit()}
            />
            <input
              type="color"
              value={stageEditForm.color}
              onChange={(e) => setStageEditForm((p) => ({ ...p, color: e.target.value }))}
              className="h-8 w-12 rounded border cursor-pointer"
              title="Màu hiển thị"
            />
            <button onClick={saveStageEdit} className="h-8 px-3 bg-emerald-600 text-white rounded text-xs cursor-pointer hover:bg-emerald-700 flex items-center gap-1">
              <Save className="h-3 w-3" /> Lưu
            </button>
            <button
              onClick={() => {
                const stage = pipelineStages.find((s) => s.id === editingStageId);
                if (stage) {
                  setEditingStageId(null);
                  deleteStage({ ...stage, label: stage.name });
                }
              }}
              className="h-8 px-2 bg-red-50 text-red-600 border border-red-200 rounded text-xs cursor-pointer hover:bg-red-100 flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" /> Xóa
            </button>
            <button onClick={() => setEditingStageId(null)} className="h-8 px-2 bg-gray-100 rounded text-xs cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Add new stage — pipeline mode hoặc company-default mode */}
        {stagesSource !== 'global' && showAddStage && (
          <div className="mt-3 p-3 bg-white rounded-lg border border-emerald-300 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-emerald-700 uppercase">Giai đoạn mới:</span>
            <input
              value={newStageForm.icon}
              onChange={(e) => setNewStageForm((p) => ({ ...p, icon: e.target.value }))}
              placeholder="📌"
              className="h-8 w-14 px-2 text-center rounded border text-base"
            />
            <input
              value={newStageForm.name}
              onChange={(e) => setNewStageForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Tên giai đoạn..."
              className="flex-1 min-w-[160px] h-8 px-2 rounded border text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createStage()}
            />
            <input
              type="color"
              value={newStageForm.color}
              onChange={(e) => setNewStageForm((p) => ({ ...p, color: e.target.value }))}
              className="h-8 w-12 rounded border cursor-pointer"
            />
            <button onClick={createStage} className="h-8 px-3 bg-emerald-600 text-white rounded text-xs cursor-pointer hover:bg-emerald-700 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Tạo
            </button>
            <button onClick={() => setShowAddStage(false)} className="h-8 px-2 bg-gray-100 rounded text-xs cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {stagesSource === 'company' && (
          <p className="mt-2 text-[10px] text-emerald-700">
            ℹ️ Đang dùng pipeline mặc định của công ty. Chọn pipeline khác ở picker để chuyển sang pipeline đó.
          </p>
        )}
        {stagesSource === 'global' && (
          <p className="mt-2 text-[10px] text-sky-700">
            ℹ️ Chưa pick công ty → đang hiển thị stages cố định. Chọn 1 <b>Công ty</b> ở picker phía trên để dùng pipeline thật của công ty đó.
          </p>
        )}
      </div>

      {/* Add Template Form */}
      {showAddTpl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-800">
            Tạo bộ mẫu mới ({activeTab === 'deal' ? 'Deal' : 'Lead'})
            {isPipelineMode
              ? <span className="ml-1 text-emerald-700">— pipeline: {pipelines.find((p) => p.id === selectedPipelineId)?.name}</span>
              : <span className="ml-1 text-sky-700">— Chung (tất cả công ty)</span>}
          </h3>
          <div className="flex gap-2 flex-wrap">
            <input value={newTpl.name} onChange={e => setNewTpl(p => ({...p, name: e.target.value}))}
              placeholder="Tên bộ mẫu..." className="flex-1 min-w-[200px] h-9 px-3 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500" autoFocus
              onKeyDown={e => e.key === 'Enter' && createTemplate()} />
            {(() => {
              const currentVal = newTpl.pipeline_stage_id
                ? `stage:${newTpl.pipeline_stage_id}`
                : (newTpl.stage_slug ? `slug:${newTpl.stage_slug}` : '');
              const allowStage = (s) => !s.pipeline_type || s.pipeline_type === 'both' || s.pipeline_type === activeTab;
              return (
                <select
                  value={currentVal}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith('stage:')) {
                      setNewTpl((p) => ({ ...p, pipeline_stage_id: v.slice('stage:'.length), stage_slug: '' }));
                    } else if (v.startsWith('slug:')) {
                      setNewTpl((p) => ({ ...p, pipeline_stage_id: '', stage_slug: v.slice('slug:'.length) }));
                    } else {
                      setNewTpl((p) => ({ ...p, pipeline_stage_id: '', stage_slug: '' }));
                    }
                  }}
                  className="h-9 px-3 rounded-lg border text-sm bg-white min-w-[260px] max-w-[420px]"
                >
                  <option value="">— Chọn giai đoạn —</option>
                  {companyPipelinesAll.map((pl) => {
                    const usable = (pl.stages || []).filter(allowStage).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
                    if (!usable.length) return null;
                    return (
                      <optgroup key={pl.id} label={`🔧 ${pl.name}${pl.is_default ? ' (mặc định)' : ''}`}>
                        {usable.map((s) => (
                          <option key={s.id} value={`stage:${s.id}`}>{s.icon || '📌'} {s.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                  <optgroup label="🌐 Bộ mẫu chung (Global slug)">
                    {ALL_STAGES.map((s) => (
                      <option key={s.slug} value={`slug:${s.slug}`}>{s.icon} {s.label}</option>
                    ))}
                  </optgroup>
                </select>
              );
            })()}
            <button onClick={createTemplate} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-700">Tạo</button>
            <button onClick={() => setShowAddTpl(false)} className="h-9 px-3 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
          </div>
        </div>
      )}

      {/* Templates flat list — each template = 1 "nhiệm vụ lớn", sắp theo thứ tự giai đoạn → order_index */}
      {(() => {
        // Group templates by stage for drag scoping (drag chỉ trong cùng stage để giữ order_index nhất quán),
        // nhưng KHÔNG render header nhóm theo stage nữa.
        const groups = currentStages
          .map((stage) => ({
            stage,
            tpls: filteredTemplates
              .filter((t) => (stage.isPipelineStage
                ? t.pipeline_stage_id === stage.id
                : (t.stage_slug === stage.slug && !t.pipeline_stage_id)))
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
          }))
          .filter((g) => g.tpls.length > 0); // Bỏ qua stage rỗng — không hiển thị placeholder

        return (
          <div className="space-y-2">
            {groups.map(({ stage, tpls }) => (
              <DndContext key={stage.slug || stage.id} sensors={sensors} collisionDetection={closestCenter}
                onDragEnd={(e) => handleTemplateDragEnd(e, stage.slug)}>
                <SortableContext items={tpls.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {tpls.map((tpl) => (
                    <SortableItem key={tpl.id} id={tpl.id}>
                      {({ dragHandleProps, isDragging }) => (
                        <TemplateCard
                          tpl={tpl} stage={stage} isDragging={isDragging}
                          dragHandleProps={dragHandleProps}
                          expanded={expanded[tpl.id]} onToggleExpand={() => setExpanded((p) => ({ ...p, [tpl.id]: !p[tpl.id] }))}
                          editingTpl={editingTpl} setEditingTpl={setEditingTpl} updateTemplate={updateTemplate}
                          toggleDefault={toggleDefault} deleteTemplate={deleteTemplate}
                          newItem={newItem} setNewItem={setNewItem} addItem={addItem} deleteItem={deleteItem}
                          editingChecklist={editingChecklist} setEditingChecklist={setEditingChecklist}
                          newCheckItem={newCheckItem} setNewCheckItem={setNewCheckItem}
                          addChecklistItem={addChecklistItem} removeChecklistItem={removeChecklistItem}
                          sensors={sensors} handleItemDragEnd={handleItemDragEnd}
                          handleChecklistDragEnd={handleChecklistDragEnd}
                          templates={templates} setTemplates={setTemplates}
                          updateItemChecklist={updateItemChecklist}
                          updateTemplateItemFields={updateTemplateItemFields}
                          editingVisibility={editingVisibility} setEditingVisibility={setEditingVisibility}
                          companies={companies} departments={departments}
                          toggleItemCompany={toggleItemCompany} toggleItemDept={toggleItemDept}
                          isPipelineMode={isPipelineMode} pipelineStages={pipelineStages}
                          companyPipelinesAll={companyPipelinesAll} activeTab={activeTab}
                        />
                      )}
                    </SortableItem>
                  ))}
                </SortableContext>
              </DndContext>
            ))}
          </div>
        );
      })()}

      {filteredTemplates.length === 0 && !loading && currentStages.length > 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg mb-2">
            📭 Chưa có bộ mẫu nào cho {activeTab === 'deal' ? 'Deal' : 'Lead'}
            {isPipelineMode ? ' trong pipeline này' : ' (chung)'}
          </p>
          <button onClick={openAddTplForm}
            className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700">
            <Plus className="h-4 w-4 inline mr-1" /> Tạo bộ mẫu đầu tiên
          </button>
        </div>
      )}
    </div>
  );
}

// ═══ Template Card with drag-drop items ═══
function TemplateCard({
  tpl, stage, isDragging, dragHandleProps, expanded, onToggleExpand,
  editingTpl, setEditingTpl, updateTemplate, toggleDefault, deleteTemplate,
  newItem, setNewItem, addItem, deleteItem,
  editingChecklist, setEditingChecklist, newCheckItem, setNewCheckItem,
  addChecklistItem, removeChecklistItem,
  sensors, handleItemDragEnd, handleChecklistDragEnd,
  editingVisibility, setEditingVisibility,
  companies, departments, toggleItemCompany, toggleItemDept,
  updateTemplateItemFields,
  isPipelineMode = false, pipelineStages = [],
  companyPipelinesAll = [], activeTab = 'deal',
}) {
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemEditForm, setItemEditForm] = useState({ title: '', description: '', priority: 'medium', deadline_days: 0, blocks_stage_advance: false, show_excel_quotation_upload: false });

  const sortedItems = [...(tpl.items || [])].sort((a, b) => a.order_index - b.order_index);

  const openItemEdit = (item) => {
    setEditingItemId(item.id);
    setItemEditForm({
      title: item.title || '',
      description: item.description || '',
      priority: item.priority || 'medium',
      deadline_days: item.deadline_days ?? 0,
      blocks_stage_advance: !!item.blocks_stage_advance,
      show_excel_quotation_upload: !!item.show_excel_quotation_upload,
    });
  };

  const saveItemEdit = async () => {
    if (!editingItemId || !itemEditForm.title.trim()) {
      alert('Nhập tên nhiệm vụ');
      return;
    }
    try {
      await updateTemplateItemFields(tpl.id, editingItemId, {
        title: itemEditForm.title.trim(),
        description: itemEditForm.description?.trim() || null,
        priority: itemEditForm.priority,
        deadline_days: 0,
        blocks_stage_advance: !!itemEditForm.blocks_stage_advance,
        show_excel_quotation_upload: !!itemEditForm.show_excel_quotation_upload,
      });
      setEditingItemId(null);
    } catch { /* alert trong updateTemplateItemFields */ }
  };

  const toggleItemBlocking = async (item) => {
    try {
      await updateTemplateItemFields(tpl.id, item.id, {
        blocks_stage_advance: !item.blocks_stage_advance,
      });
    } catch { /* alert trong updateTemplateItemFields */ }
  };

  const toggleItemExcelUpload = async (item) => {
    try {
      await updateTemplateItemFields(tpl.id, item.id, {
        show_excel_quotation_upload: !item.show_excel_quotation_upload,
      });
    } catch { /* alert trong updateTemplateItemFields */ }
  };

  return (
    <div className={`border rounded-xl overflow-hidden bg-white ${isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''}`}>
      {/* Header */}
      {editingTpl?.id === tpl.id ? (
        (() => {
          // Giá trị dropdown:
          //   - "stage:<UUID>"  → gắn vào pipeline_stage_id (specific pipeline của công ty)
          //   - "slug:<slug>"   → bộ mẫu Global theo stage_slug cũ
          //   - ''              → chưa chọn
          const currentVal = editingTpl.pipeline_stage_id
            ? `stage:${editingTpl.pipeline_stage_id}`
            : (editingTpl.stage_slug ? `slug:${editingTpl.stage_slug}` : '');
          // Lọc stages theo activeTab (lead/deal). Stage không có pipeline_type → cho cả 2.
          const allowStage = (s) => !s.pipeline_type || s.pipeline_type === 'both' || s.pipeline_type === activeTab;
          return (
            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-200 flex-wrap">
              <input value={editingTpl.name} onChange={e => setEditingTpl(p => ({ ...p, name: e.target.value }))}
                className="flex-1 min-w-[180px] h-8 px-2 rounded border text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus onKeyDown={e => e.key === 'Enter' && updateTemplate()} />
              <select
                value={currentVal}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith('stage:')) {
                    setEditingTpl((p) => ({ ...p, pipeline_stage_id: v.slice('stage:'.length), stage_slug: null }));
                  } else if (v.startsWith('slug:')) {
                    setEditingTpl((p) => ({ ...p, pipeline_stage_id: null, stage_slug: v.slice('slug:'.length) }));
                  } else {
                    setEditingTpl((p) => ({ ...p, pipeline_stage_id: null, stage_slug: null }));
                  }
                }}
                className="h-8 px-2 rounded border text-xs bg-white min-w-[260px] max-w-[360px]"
                title="Chọn giai đoạn pipeline của công ty (ưu tiên), hoặc bộ mẫu Global theo slug cũ"
              >
                <option value="">— Chọn giai đoạn —</option>
                {companyPipelinesAll.map((pl) => {
                  const usableStages = (pl.stages || []).filter(allowStage).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
                  if (!usableStages.length) return null;
                  return (
                    <optgroup key={pl.id} label={`🔧 ${pl.name}${pl.is_default ? ' (mặc định)' : ''}`}>
                      {usableStages.map((s) => (
                        <option key={s.id} value={`stage:${s.id}`}>
                          {s.icon || '📌'} {s.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
                <optgroup label="🌐 Bộ mẫu chung (Global slug)">
                  {ALL_STAGES.map((s) => (
                    <option key={s.slug} value={`slug:${s.slug}`}>
                      {s.icon} {s.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button onClick={updateTemplate} className="h-8 px-3 bg-blue-600 text-white rounded text-xs cursor-pointer hover:bg-blue-700 flex items-center gap-1">
                <Save className="h-3 w-3" /> Lưu
              </button>
              <button onClick={() => setEditingTpl(null)} className="h-8 px-2 bg-gray-100 rounded text-xs cursor-pointer"><X className="h-3 w-3" /></button>
              {!companyPipelinesAll.length && (
                <p className="basis-full text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  ⚠️ Chọn 1 công ty ở picker phía trên để nạp danh sách pipeline. Đang chỉ hiển thị bộ mẫu Global.
                </p>
              )}
            </div>
          );
        })()
      ) : (
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{
            background: `linear-gradient(90deg, ${stage?.color || '#3B82F6'}14 0%, #F9FAFB 60%)`,
            borderLeft: `4px solid ${stage?.color || '#3B82F6'}`,
          }}
        >
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 touch-none">
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="flex-1 flex items-center gap-2 cursor-pointer flex-wrap" onClick={onToggleExpand}>
            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
            {stage && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
                style={{
                  backgroundColor: `${stage.color}22`,
                  color: stage.color,
                  border: `1px solid ${stage.color}55`,
                }}
                title={`Giai đoạn: ${stage.label}`}
              >
                {stage.icon} {stage.label}
              </span>
            )}
            <span className="text-sm font-semibold flex-1 min-w-[120px]">{tpl.name}</span>
            {tpl.pipeline_stage_id ? (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium" title="Bộ mẫu riêng cho pipeline này">🏢 Pipeline</span>
            ) : (
              <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium" title="Bộ mẫu chung — áp dụng tất cả công ty">🌐 Chung</span>
            )}
            {tpl.is_default && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⭐ Mặc định</span>}
            <span className="text-xs text-gray-400 whitespace-nowrap">{tpl.items?.length || 0} việc</span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setEditingTpl({ id: tpl.id, name: tpl.name, stage_slug: tpl.stage_slug, pipeline_stage_id: tpl.pipeline_stage_id }); }}
            className="p-1 text-gray-400 hover:text-blue-600 cursor-pointer" title="Sửa"><Edit2 className="h-3.5 w-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); toggleDefault(tpl); }}
            className="text-[10px] px-2 py-1 rounded hover:bg-blue-50 text-blue-600 cursor-pointer">
            {tpl.is_default ? 'Bỏ mặc định' : 'Đặt mặc định'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }}
            className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Items with drag & drop */}
      {expanded && (
        <div className="px-4 py-2 space-y-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragEnd={(e) => handleItemDragEnd(e, tpl.id)}>
            <SortableContext items={sortedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {sortedItems.map((item, i) => (
                <SortableItem key={item.id} id={item.id}>
                  {({ dragHandleProps: itemDrag }) => (
                    <div>
                      <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 group">
                        <div {...itemDrag} className="cursor-grab active:cursor-grabbing p-0.5 text-gray-300 hover:text-gray-500 touch-none">
                          <GripVertical className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}.</span>
                        <span className="text-sm flex-1 min-w-0 truncate" title={item.title}>{item.title}</span>
                        {Array.isArray(item.checklist) && item.checklist.length > 0 && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <CheckSquare className="h-3 w-3" /> {item.checklist.length}
                          </span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          item.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                          item.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                          item.priority === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>{item.priority === 'urgent' ? 'Gấp' : item.priority === 'high' ? 'Cao' : item.priority === 'medium' ? 'TB' : 'Thấp'}</span>
                        {(item.default_allowed_companies?.length > 0 || item.default_allowed_departments?.length > 0) && (
                          <span className="text-[9px] bg-red-50 text-red-600 px-1 py-0.5 rounded-full">🔒</span>
                        )}
                        {item.blocks_stage_advance && (
                          <span
                            className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"
                            title="Chặn chuyển giai đoạn khi chưa hoàn thành"
                          >
                            <Lock className="h-2.5 w-2.5" /> Chặn
                          </span>
                        )}
                        {item.show_excel_quotation_upload && (
                          <span
                            className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"
                            title="Hiển thị nút Upload Excel Báo giá ở tab Nhiệm vụ"
                          >
                            <FileSpreadsheet className="h-2.5 w-2.5" /> Excel BG
                          </span>
                        )}
                        <button type="button" onClick={() => toggleItemBlocking(item)}
                          className={`p-1 rounded cursor-pointer shrink-0 ${item.blocks_stage_advance ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-gray-400 hover:bg-amber-50 hover:text-amber-600'}`}
                          title={item.blocks_stage_advance ? 'Đang chặn chuyển giai đoạn — bấm để tắt' : 'Bật chặn: bắt buộc hoàn thành trước khi chuyển giai đoạn'}>
                          <Lock className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => toggleItemExcelUpload(item)}
                          className={`p-1 rounded cursor-pointer shrink-0 ${item.show_excel_quotation_upload ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-gray-400 hover:bg-emerald-50 hover:text-emerald-600'}`}
                          title={item.show_excel_quotation_upload ? 'Đang hiển thị nút Upload Excel BG — bấm để tắt' : 'Bật: hiển thị nút Upload Excel Báo giá trên tab Nhiệm vụ'}>
                          <FileSpreadsheet className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setEditingVisibility(p => ({ ...p, [item.id]: !p[item.id] }))}
                          className={`p-1 rounded cursor-pointer shrink-0 ${(item.default_allowed_companies?.length > 0 || item.default_allowed_departments?.length > 0) ? 'text-red-500 hover:bg-red-50' : 'text-gray-400 hover:bg-purple-50 hover:text-purple-600'}`} title="Phân quyền xem">
                          <Shield className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setEditingChecklist(p => ({ ...p, [item.id]: !p[item.id] }))}
                          className="p-1 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer shrink-0" title="Checklist mẫu">
                          <CheckSquare className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); if (editingItemId === item.id) setEditingItemId(null); else openItemEdit(item); }}
                          className={`p-1 rounded cursor-pointer shrink-0 ${editingItemId === item.id ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`} title="Sửa nhiệm vụ mẫu">
                          <Edit2 className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => deleteItem(tpl.id, item.id)}
                          className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer shrink-0" title="Xóa mục">
                          <Trash2 className="h-3 w-3" /></button>
                      </div>
                      {editingItemId === item.id && (
                        <div className="mx-2 mb-2 p-3 bg-sky-50 rounded-lg border border-sky-200 space-y-2" onClick={e => e.stopPropagation()}>
                          <p className="text-[10px] text-sky-700 font-bold uppercase tracking-wide">✏️ Sửa nhiệm vụ mẫu</p>
                          <input
                            value={itemEditForm.title}
                            onChange={e => setItemEditForm(f => ({ ...f, title: e.target.value }))}
                            className="w-full h-8 px-2 rounded border text-sm outline-none focus:ring-2 focus:ring-sky-400"
                            placeholder="Tên nhiệm vụ..."
                          />
                          <textarea
                            value={itemEditForm.description || ''}
                            onChange={e => setItemEditForm(f => ({ ...f, description: e.target.value }))}
                            rows={2}
                            className="w-full px-2 py-1.5 rounded border text-xs outline-none focus:ring-2 focus:ring-sky-400 resize-y min-h-[48px]"
                            placeholder="Mô tả (tuỳ chọn)..."
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={itemEditForm.priority}
                              onChange={e => setItemEditForm(f => ({ ...f, priority: e.target.value }))}
                              className="h-8 px-2 rounded border text-xs bg-white"
                            >
                              <option value="low">Thấp</option>
                              <option value="medium">TB</option>
                              <option value="high">Cao</option>
                              <option value="urgent">Gấp</option>
                            </select>
                            <label className="flex items-center gap-1.5 h-8 px-2 rounded border bg-white text-xs cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!itemEditForm.blocks_stage_advance}
                                onChange={e => setItemEditForm(f => ({ ...f, blocks_stage_advance: e.target.checked }))}
                                className="accent-amber-600"
                              />
                              <Lock className="h-3 w-3 text-amber-600" />
                              Chặn chuyển giai đoạn
                            </label>
                            <label className="flex items-center gap-1.5 h-8 px-2 rounded border bg-white text-xs cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!itemEditForm.show_excel_quotation_upload}
                                onChange={e => setItemEditForm(f => ({ ...f, show_excel_quotation_upload: e.target.checked }))}
                                className="accent-emerald-600"
                              />
                              <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
                              Hiện nút Upload Excel BG
                            </label>
                            <span className="flex-1" />
                            <button type="button" onClick={() => setEditingItemId(null)} className="h-8 px-3 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer">
                              Hủy
                            </button>
                            <button type="button" onClick={saveItemEdit} className="h-8 px-3 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 cursor-pointer flex items-center gap-1">
                              <Save className="h-3 w-3" /> Lưu
                            </button>
                          </div>
                          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                            <Lock className="h-2.5 w-2.5 inline mr-1" /> Khi bật: lead/deal không thể chuyển sang giai đoạn khác (trừ Thắng/Thua) đến khi nhiệm vụ này hoàn thành.
                          </p>
                          <p className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">
                            <FileSpreadsheet className="h-2.5 w-2.5 inline mr-1" /> Khi bật: nhiệm vụ sinh ra ở tab Nhiệm vụ sẽ có nút <b>Upload Excel BG</b> để tải file báo giá Excel và tạo báo giá tự động.
                          </p>
                        </div>
                      )}
                      {editingVisibility[item.id] && (
                        <div className="mx-2 mb-2 p-3 bg-purple-50 rounded-lg border border-purple-200 space-y-2">
                          <p className="text-[10px] text-purple-600 font-bold uppercase">🔒 Phân quyền mặc định — tài liệu upload ở nhiệm vụ này</p>
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 mb-1">🏢 Công ty</p>
                            <div className="flex flex-wrap gap-1">
                              {companies.map(c => (
                                <button key={c.id} type="button" onClick={() => toggleItemCompany(tpl.id, item.id, c.id, item)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer ${
                                    (item.default_allowed_companies || []).includes(c.id) ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border'
                                  }`}>{c.name}</button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 mb-1">🏬 Phòng ban</p>
                            <div className="flex flex-wrap gap-1">
                              {departments.map(d => (
                                <button key={d.id} type="button" onClick={() => toggleItemDept(tpl.id, item.id, d.id, item)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer ${
                                    (item.default_allowed_departments || []).includes(d.id) ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'
                                  }`}>{d.name}</button>
                              ))}
                            </div>
                          </div>
                          {!(item.default_allowed_companies?.length) && !(item.default_allowed_departments?.length) && (
                            <p className="text-[10px] text-gray-400 italic">Chưa giới hạn — tất cả đều xem được</p>
                          )}
                        </div>
                      )}
                      {editingChecklist[item.id] && (
                        <ChecklistEditor tplId={tpl.id} itemId={item.id}
                          checklist={Array.isArray(item.checklist) ? item.checklist : []}
                          sensors={sensors} handleChecklistDragEnd={handleChecklistDragEnd}
                          removeChecklistItem={removeChecklistItem} addChecklistItem={addChecklistItem}
                          newCheckItem={newCheckItem} setNewCheckItem={setNewCheckItem} />
                      )}
                    </div>
                  )}
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>

          {/* Add item form */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t">
            <input value={newItem[tpl.id]?.title || ''} onChange={e => setNewItem(p => ({ ...p, [tpl.id]: { ...(p[tpl.id] || {}), title: e.target.value } }))}
              placeholder="Thêm công việc mẫu..." className="flex-1 h-8 px-2 rounded border text-xs outline-none focus:ring-1 focus:ring-blue-400"
              onKeyDown={e => e.key === 'Enter' && addItem(tpl.id)} />
            <select value={newItem[tpl.id]?.priority || 'medium'} onChange={e => setNewItem(p => ({ ...p, [tpl.id]: { ...(p[tpl.id] || {}), priority: e.target.value } }))}
              className="h-8 px-2 rounded border text-xs bg-white">
              <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
            </select>
            <button onClick={() => addItem(tpl.id)} className="h-8 px-3 bg-blue-600 text-white rounded text-xs cursor-pointer hover:bg-blue-700">
              <Plus className="h-3 w-3" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Checklist Editor with drag & drop ═══
function ChecklistEditor({ tplId, itemId, checklist, sensors, handleChecklistDragEnd, removeChecklistItem, addChecklistItem, newCheckItem, setNewCheckItem }) {
  const checkIds = checklist.map((_, i) => `ck-${itemId}-${i}`);
  return (
    <div className="ml-10 pl-3 border-l-2 border-emerald-200 mb-2 space-y-1">
      <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Checklist mẫu — kéo thả để sắp xếp</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragEnd={(e) => handleChecklistDragEnd(e, tplId, itemId)}>
        <SortableContext items={checkIds} strategy={verticalListSortingStrategy}>
          {checklist.map((ck, ci) => (
            <SortableItem key={checkIds[ci]} id={checkIds[ci]}>
              {({ dragHandleProps: ckDrag }) => (
                <div className="flex items-center gap-2 text-xs">
                  <div {...ckDrag} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none">
                    <GripVertical className="h-3 w-3" />
                  </div>
                  <span className="text-emerald-500">☐</span>
                  <span className="flex-1">{ck}</span>
                  <button onClick={() => removeChecklistItem(tplId, itemId, ci)}
                    className="p-0.5 text-gray-300 hover:text-red-500 cursor-pointer"><X className="h-3 w-3" /></button>
                </div>
              )}
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-1 mt-1">
        <input value={newCheckItem[itemId] || ''} onChange={e => setNewCheckItem(p => ({ ...p, [itemId]: e.target.value }))}
          placeholder="Thêm mục checklist..."
          className="flex-1 h-7 px-2 text-xs border rounded outline-none focus:ring-1 focus:ring-emerald-400"
          onKeyDown={e => e.key === 'Enter' && addChecklistItem(tplId, itemId)} />
        <button onClick={() => addChecklistItem(tplId, itemId)}
          className="h-7 px-2 bg-emerald-600 text-white rounded text-xs cursor-pointer hover:bg-emerald-700">
          <Plus className="h-3 w-3" /></button>
      </div>
    </div>
  );
}