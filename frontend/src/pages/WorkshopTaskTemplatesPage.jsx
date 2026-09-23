import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isProductionAdmin } from '../lib/adminRole';
import { findDefaultAdminCrmCompanyPhucDat } from '../lib/crmCompanyFilter';
import { isMetallaOrHucabiCompanyId, productionWorkshopFilterCompanies } from '../lib/crossWorkshopProduction';
import { isInstallVcStage } from '../lib/managementDashboardUtils';
import { Plus, Trash2, Save, ChevronDown, ChevronRight, Edit2, X, CheckSquare, GripVertical, Shield, Globe, MapPin, Lock, Star, Paperclip, MessageSquare, User, Truck, FileSpreadsheet } from 'lucide-react';
import EvidenceFileTypesPicker from '../components/EvidenceFileTypesPicker';
import GiaVonExcelModal from '../components/GiaVonExcelModal';
import TemplateItemAssigneePicker from '../components/TemplateItemAssigneePicker';
import { CostTypeItemSelect, CostTypeTemplateChecks } from '../components/CostTypeRequireBox';
import { workshopAreaToCostModule } from '../lib/costTypeModules';
import { templateItemAssigneeIds, templateItemAssigneeCount } from '../lib/templateItemAssignees';
import { formatEvidenceTypesShort, normalizeEvidenceFileTypes, checklistItemRequiresEvidence } from '../lib/evidenceFileTypes';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ═══ Khu vực xưởng — slug trùng workshop_area (DB) ═══
const WORKSHOP_PRODUCTION_STAGES = [
  { slug: 'production', label: 'Sản xuất', icon: '🏭', color: '#0f766e' },
];
const WORKSHOP_LOGISTICS_STAGES = [
  { slug: 'logistics', label: 'Lắp đặt', icon: '🔧', color: '#14b8a6' },
];
const ALL_WORKSHOP_AREAS = [
  { slug: 'production', label: '🏭 Sản xuất', icon: '🏭', color: '#0f766e' },
  { slug: 'logistics', label: '🔧 Lắp đặt', icon: '🔧', color: '#14b8a6' },
];
const LS_TPL_COMPANY_SX = 'sx_task_tpl_company_id';
const LS_TPL_COMPANY_VC = 'vc_task_tpl_company_id';
const LS_TPL_TYPE = 'sx_task_tpl_type_key';
const GLOBAL_STAGE = 'global';

function readLs(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

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

export default function WorkshopTaskTemplatesPage({ initialArea = 'production', fixedArea = '' } = {}) {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const canPickTemplateCompany = isAdmin || isProductionAdmin(user);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [editingTpl, setEditingTpl] = useState(null);
  /** Mẫu đang mở hộp nhập Excel giá vốn (giá theo từng công đoạn — migration 606). */
  const [giaVonTpl, setGiaVonTpl] = useState(null);
  const [newItem, setNewItem] = useState({});
  const [showAddTpl, setShowAddTpl] = useState(false);
  // Flow tuần tự: Công ty → Phân loại → Pipeline.
  // Khi route cố định khu vực (fixedArea), activeTab tự khoá theo route.
  const effectiveInitialArea = fixedArea || '';

  const [newTpl, setNewTpl] = useState({ name: '', workshop_area: fixedArea || initialArea || 'production' });
  const [activeTab, setActiveTab] = useState(effectiveInitialArea || fixedArea || '');
  const [editingChecklist, setEditingChecklist] = useState({});
  const [newCheckItem, setNewCheckItem] = useState({});
  const [editingVisibility, setEditingVisibility] = useState({}); // {itemId: true/false}
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    const area = fixedArea || initialArea || '';
    return readLs(area === 'logistics' ? LS_TPL_COMPANY_VC : LS_TPL_COMPANY_SX);
  });
  const [addToStageKey, setAddToStageKey] = useState(GLOBAL_STAGE);
  const [colQuery, setColQuery] = useState('');
  const [expandedCols, setExpandedCols] = useState({});
  // Phân loại = workshop_project_types (Cửa, Tủ bếp, ...) — CHỈ áp dụng cho khu vực Sản xuất.
  const [workshopTypes, setWorkshopTypes] = useState([]);
  const [selectedWorkshopTypeKey, setSelectedWorkshopTypeKey] = useState(() => {
    const s = readLs(LS_TPL_TYPE);
    return s && s !== 'global' ? s : '';
  }); // '' chưa chọn | 'global' | uuid
  const [pipelineStages, setPipelineStages] = useState([]);
  const [selectedStageKey, setSelectedStageKey] = useState('');
  const [seedingNine, setSeedingNine] = useState(false);
  const [bundleSetting, setBundleSetting] = useState(false);
  const [costTypes, setCostTypes] = useState([]);
  const companyDefaultResolvedRef = useRef(false);
  const isLogisticsFixed = fixedArea === 'logistics' || activeTab === 'logistics';

  const currentStages = activeTab === 'logistics' ? WORKSHOP_LOGISTICS_STAGES : WORKSHOP_PRODUCTION_STAGES;
  // SX: Công ty → Phân loại → Pipeline (nhiều bộ/cột). VC: Công ty → Pipeline.
  const usesWorkshopType = activeTab === 'production';
  const usesPipelineSidebar = activeTab === 'logistics' || fixedArea === 'production' || activeTab === 'production';
  const selectedWorkshopType = selectedWorkshopTypeKey === 'global'
    ? null
    : workshopTypes.find((t) => String(t.id) === String(selectedWorkshopTypeKey)) || null;

  const selectedPipelineStage = selectedStageKey === 'global'
    ? null
    : pipelineStages.find((s) => String(s.id) === String(selectedStageKey));

  const stageFilterParams = () => {
    const key = activeTab === 'logistics' ? 'logistics_stage_id' : 'production_stage_id';
    return { [key]: selectedStageKey === 'global' ? 'global' : selectedStageKey };
  };

  const workshopTypePayloadForTpl = () => {
    if (!usesWorkshopType || !selectedWorkshopTypeKey) return {};
    return { workshop_type_id: selectedWorkshopTypeKey === 'global' ? 'global' : selectedWorkshopTypeKey };
  };

  const loadPipelineStages = async () => {
    if (!selectedCompanyId || !activeTab) {
      setPipelineStages([]);
      return;
    }
    // SX bắt buộc chọn phân loại (workshop_type) hoặc "Tất cả phân loại" trước khi nạp pipeline.
    if (usesWorkshopType && !selectedWorkshopTypeKey) {
      setPipelineStages([]);
      return;
    }
    try {
      const path = activeTab === 'logistics' ? '/logistics/pipeline-stages' : '/production/pipeline-stages';
      const params = { company_id: selectedCompanyId };
      if (usesWorkshopType && selectedWorkshopTypeKey) {
        params.workshop_type_id = selectedWorkshopTypeKey; // 'global' hoặc uuid
      }
      const { data } = await api.get(path, { params });
      const rows = (Array.isArray(data) ? data : []).filter((s) => s.is_active !== false);
      setPipelineStages(rows.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
    } catch {
      setPipelineStages([]);
    }
  };

  // Nạp danh sách phân loại (workshop_project_types) của công ty cho module Sản xuất.
  const loadWorkshopTypes = async () => {
    if (!selectedCompanyId || !usesWorkshopType) {
      setWorkshopTypes([]);
      return;
    }
    try {
      const { data } = await api.get('/workshop/project-types', {
        params: { company_id: selectedCompanyId, module: 'production' },
      });
      const rows = Array.isArray(data) ? data : [];
      setWorkshopTypes(rows.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
    } catch {
      setWorkshopTypes([]);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // SX: Công ty + phân loại. VC: Công ty. Không bắt chọn từng cột pipeline.
  const canLoadTemplates = !!selectedCompanyId
    && !!activeTab
    && (usesWorkshopType ? !!selectedWorkshopTypeKey : true);

  const load = async () => {
    const firstPaint = companies.length === 0;
    if (firstPaint) setLoading(true);
    try {
      const compModule = activeTab === 'logistics' ? 'logistics' : 'production';
      const userParams = selectedCompanyId ? { company_id: selectedCompanyId } : {};
      const [compRes, deptRes, usersRes] = await Promise.all([
        api.get('/companies', { params: { for_module: compModule } }).catch(() => ({ data: [] })),
        api.get('/departments').catch(() => ({ data: [] })),
        api.get('/users', { params: userParams }).catch(() => ({ data: [] })),
      ]);
      const coList = compRes.data?.companies || compRes.data || [];
      setCompanies(coList);
      setDepartments(deptRes.data?.departments || deptRes.data || []);
      setUsers(usersRes.data?.users || usersRes.data || []);
      if (!companyDefaultResolvedRef.current) {
        companyDefaultResolvedRef.current = true;
        if (!selectedCompanyId) {
          const coListForPick = isAdmin || activeTab === 'logistics'
            ? coList
            : productionWorkshopFilterCompanies(coList);
          const fromUser = user?.company_id ? String(user.company_id) : '';
          const userWorkshop = isMetallaOrHucabiCompanyId(fromUser, coList) ? fromUser : '';
          const phucDat = isAdmin ? findDefaultAdminCrmCompanyPhucDat(coList) : '';
          const firstWorkshop = coListForPick[0]?.id ? String(coListForPick[0].id) : '';
          const pick = userWorkshop || firstWorkshop || phucDat;
          if (pick) setSelectedCompanyId(pick);
        }
      }

      if (canLoadTemplates) {
        const params = {
          active_only: 'false',
          workshop_area: fixedArea || activeTab,
          company_id: selectedCompanyId,
          ...(usesWorkshopType ? workshopTypePayloadForTpl() : {}),
        };
        const [{ data }, typesRes] = await Promise.all([
          api.get('/production/task-templates', { params }),
          api.get('/production/cost-types', {
            params: { company_id: selectedCompanyId, workshop_area: fixedArea || activeTab },
          }).catch(() => ({ data: [] })),
        ]);
        setTemplates(data || []);
        setCostTypes(Array.isArray(typesRes.data) ? typesRes.data : []);
        setExpanded({});
      } else {
        setTemplates([]);
        setCostTypes([]);
      }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [selectedCompanyId, activeTab, fixedArea, selectedWorkshopTypeKey]);

  useEffect(() => {
    if (selectedCompanyId) {
      try {
        localStorage.setItem(
          (fixedArea === 'logistics' || activeTab === 'logistics') ? LS_TPL_COMPANY_VC : LS_TPL_COMPANY_SX,
          selectedCompanyId,
        );
      } catch { /* ignore */ }
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (selectedWorkshopTypeKey) {
      try { localStorage.setItem(LS_TPL_TYPE, selectedWorkshopTypeKey); } catch { /* ignore */ }
    }
  }, [selectedWorkshopTypeKey]);

  const prevCompanyRef = useRef(selectedCompanyId);
  useEffect(() => {
    const prev = prevCompanyRef.current;
    prevCompanyRef.current = selectedCompanyId;
    if (prev && String(prev) !== String(selectedCompanyId)) {
      setSelectedWorkshopTypeKey('');
    }
    setPipelineStages([]);
    loadWorkshopTypes();
  }, [selectedCompanyId, activeTab]);

  useEffect(() => {
    if (!usesWorkshopType) return;
    if (!selectedCompanyId) {
      if (selectedWorkshopTypeKey) setSelectedWorkshopTypeKey('');
      return;
    }
    if (!workshopTypes.length) return;
    const inList = workshopTypes.some((t) => String(t.id) === String(selectedWorkshopTypeKey));
    if (inList || selectedWorkshopTypeKey === 'global') return;
    const saved = readLs(LS_TPL_TYPE);
    if (saved && saved !== 'global' && workshopTypes.some((t) => String(t.id) === String(saved))) {
      setSelectedWorkshopTypeKey(saved);
      return;
    }
    setSelectedWorkshopTypeKey(String(workshopTypes[0].id));
  }, [selectedCompanyId, activeTab, usesWorkshopType, workshopTypes, selectedWorkshopTypeKey]);

  useEffect(() => {
    if (usesPipelineSidebar) loadPipelineStages();
    else setPipelineStages([]);
  }, [selectedCompanyId, activeTab, selectedWorkshopTypeKey, usesPipelineSidebar]);

  const filteredTemplates = templates.filter((t) => t.workshop_area === (fixedArea || activeTab));

  const stagePayloadForTpl = (stageKey = addToStageKey) => {
    const key = stageKey || GLOBAL_STAGE;
    const colId = key === GLOBAL_STAGE ? null : key;
    if (activeTab === 'logistics' || fixedArea === 'logistics') {
      return { logistics_stage_id: colId, production_stage_id: null };
    }
    return { production_stage_id: colId, logistics_stage_id: null };
  };

  const tplStageKey = (tpl) => {
    if (activeTab === 'logistics' || fixedArea === 'logistics') {
      return tpl.logistics_stage_id ? String(tpl.logistics_stage_id) : GLOBAL_STAGE;
    }
    return tpl.production_stage_id ? String(tpl.production_stage_id) : GLOBAL_STAGE;
  };

  const assignTemplateToStage = async (tpl, stageKey) => {
    const payload = stagePayloadForTpl(stageKey);
    setTemplates((prev) => prev.map((t) => (t.id === tpl.id ? { ...t, ...payload } : t)));
    try {
      await api.put(`/production/task-templates/${tpl.id}`, {
        name: tpl.name,
        workshop_area: tpl.workshop_area,
        company_id: selectedCompanyId || null,
        ...payload,
        ...workshopTypePayloadForTpl(),
      });
    } catch (e) {
      alert(e.response?.data?.error || 'Không chuyển được cột');
      load();
    }
  };

  const norm = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const ensureNineProductionTemplates = async () => {
    if (seedingNine) return;
    if (activeTab !== 'production') return;
    if (!selectedCompanyId) {
      alert('Chọn Công ty trước khi tạo đủ 9 bộ mẫu SX.');
      return;
    }
    if (!selectedWorkshopTypeKey || selectedWorkshopTypeKey === 'global') {
      alert('Chọn một phân loại cụ thể (Cửa / Tủ bếp / …) — mỗi phân loại có bộ nhiệm vụ riêng.');
      return;
    }
    const typeLabel = selectedWorkshopType?.name || 'phân loại này';
    const ok = window.confirm(`Tạo/chuẩn hoá đủ 9 bộ mẫu Sản xuất cho «${typeLabel}»?\n\n- Nếu đang có bộ "Sản xuất" sẽ đổi tên thành "Sản xuất thùng".\n- Sẽ tạo thêm bộ thiếu và thêm 3 công việc mẫu cho các bộ mới (nếu đang trống).`);
    if (!ok) return;
    setSeedingNine(true);
    try {
      const desired = [
        { name: 'Tiếp nhận', seed: [] },
        { name: 'Thiết kế và lên kế hoạch', seed: [] },
        { name: 'Kiểm tra chéo', seed: [] },
        { name: 'Vật tư', seed: [] },
        { name: 'Sản xuất thùng', seed: ['Chuẩn bị máy móc & jig', 'Gia công chính', 'Lắp ráp bán thành phẩm'] },
        { name: 'Sản xuất alu', seed: ['Chuẩn bị vật tư alu', 'Gia công alu', 'Lắp ráp & QC alu'] },
        { name: 'Hoàn thiện', seed: [] },
        { name: 'Đóng gói', seed: ['Chuẩn bị vật liệu đóng gói', 'Đóng gói theo quy cách', 'Dán nhãn & bàn giao kho xuất'] },
        { name: 'Giao hàng', seed: [] },
      ];

      const existing = (templates || [])
        .filter((t) => t.workshop_area === 'production'
          && String(t.company_id || '') === String(selectedCompanyId)
          && String(t.workshop_type_id || '') === String(selectedWorkshopTypeKey));
      const byNorm = new Map(existing.map((t) => [norm(t.name), t]));

      const legacy = byNorm.get('san xuat');
      if (legacy && !byNorm.get(norm('Sản xuất thùng'))) {
        await api.put(`/production/task-templates/${legacy.id}`, {
          name: 'Sản xuất thùng',
          workshop_area: legacy.workshop_area,
          company_id: selectedCompanyId,
          workshop_type_id: selectedWorkshopTypeKey,
        });
      }

      // reload after rename / create
      await load();
      const after = (templates || [])
        .filter((t) => t.workshop_area === 'production'
          && String(t.company_id || '') === String(selectedCompanyId)
          && String(t.workshop_type_id || '') === String(selectedWorkshopTypeKey));
      const afterByNorm = new Map(after.map((t) => [norm(t.name), t]));

      for (const d of desired) {
        const key = norm(d.name);
        let tpl = afterByNorm.get(key);
        if (!tpl) {
          await api.post('/production/task-templates', {
            name: d.name,
            workshop_area: 'production',
            company_id: selectedCompanyId,
            workshop_type_id: selectedWorkshopTypeKey,
            order_index: after.length + 1,
          });
          await load();
          const latest = (templates || [])
            .filter((t) => t.workshop_area === 'production' && String(t.company_id || '') === String(selectedCompanyId));
          tpl = latest.find((t) => norm(t.name) === key) || null;
        }
        if (!tpl) continue;

        const items = Array.isArray(tpl.items) ? tpl.items : [];
        if (d.seed?.length && items.length === 0) {
          for (let i = 0; i < d.seed.length; i += 1) {
            await api.post(`/production/task-templates/${tpl.id}/items`, {
              title: d.seed[i],
              priority: 'medium',
              deadline_days: 0,
              order_index: i,
              checklist: [],
            });
          }
        }
      }

      await load();
      alert(`Đã chuẩn hoá/tạo đủ 9 bộ mẫu SX cho «${typeLabel}».`);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi tạo bộ mẫu');
    }
    setSeedingNine(false);
  };

  // ═══ CRUD ═══
  const createTemplate = async () => {
    if (!newTpl.name.trim() || !newTpl.workshop_area) return;
    try {
      const { data } = await api.post('/production/task-templates', {
        name: newTpl.name.trim(),
        workshop_area: fixedArea || newTpl.workshop_area,
        company_id: selectedCompanyId || null,
        order_index: filteredTemplates.length,
        ...stagePayloadForTpl(),
        ...workshopTypePayloadForTpl(),
      });
      setNewTpl({ name: '', workshop_area: activeTab });
      setShowAddTpl(false);
      if (data?.id) setTemplates(prev => [...prev, { ...data, items: data.items || [] }]);
      else load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteTemplate = async (id) => {
    if (!confirm('Xóa bộ mẫu này?')) return;
    const snapshot = templates;
    setTemplates(prev => prev.filter(t => t.id !== id));
    try { await api.delete(`/production/task-templates/${id}`); }
    catch { alert('Lỗi'); setTemplates(snapshot); }
  };

  const addItem = async (tplId) => {
    const item = newItem[tplId];
    if (!item?.title?.trim()) return;
    try {
      const { data } = await api.post(`/production/task-templates/${tplId}/items`, { ...item, checklist: item.checklist || [] });
      if (data?.id) {
        setTemplates(prev => prev.map(t => t.id !== tplId ? t : {
          ...t, items: [...(t.items || []), data],
        }));
      } else { load(); }
      setNewItem(p => ({ ...p, [tplId]: { title: '', priority: 'medium', deadline_days: 0 } }));
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteItem = async (tplId, itemId) => {
    const snapshot = templates;
    setTemplates(prev => prev.map(t => t.id !== tplId ? t : {
      ...t, items: (t.items || []).filter(i => i.id !== itemId),
    }));
    try { await api.delete(`/production/task-templates/${tplId}/items/${itemId}`); }
    catch { setTemplates(snapshot); }
  };

  const updateTemplateItemFields = async (tplId, itemId, body) => {
    patchItemLocal(tplId, itemId, body);
    try {
      const { data } = await api.put(`/production/task-templates/${tplId}/items/${itemId}`, body);
      patchItemLocal(tplId, itemId, data?.id ? { ...data, ...body } : body);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật mục mẫu');
      load();
      throw e;
    }
  };

  const toggleTplCostType = async (tpl, type, on) => {
    const current = (tpl.cost_excel_type_ids || []).map(String);
    const next = on
      ? [...new Set([...current, String(type.id)])]
      : current.filter((id) => id !== String(type.id));
    setTemplates((list) => list.map((t) => (t.id === tpl.id ? { ...t, cost_excel_type_ids: next } : t)));
    try {
      await api.put(`/production/task-templates/${tpl.id}/cost-excel-types`, { cost_type_ids: next });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gắn Excel chi phí');
      load();
    }
  };

  const toggleDefault = async (tpl) => {
    setTemplates(prev => prev.map(t => t.id === tpl.id ? { ...t, is_default: !tpl.is_default } : t));
    try { await api.put(`/production/task-templates/${tpl.id}`, { is_default: !tpl.is_default }); }
    catch { load(); }
  };

  const setDefaultBundle = async () => {
    if (!selectedCompanyId || !selectedWorkshopTypeKey || selectedWorkshopTypeKey === 'global') return;
    const typeLabel = selectedWorkshopType?.name || 'phân loại này';
    const tplCount = filteredTemplates.length;
    const taskCount = filteredTemplates.reduce((n, t) => n + (t.items?.length || 0), 0);
    const ok = window.confirm(
      `Đặt ${tplCount} bộ mẫu (${taskCount} nhiệm vụ) của «${typeLabel}» làm bộ mặc định?\n\nKhi tạo deal Sản xuất thuộc phân loại này, hệ thống sẽ tự sinh đúng các nhiệm vụ từ bộ này.`,
    );
    if (!ok) return;
    setBundleSetting(true);
    try {
      await api.put('/production/task-templates/set-default-bundle', {
        company_id: selectedCompanyId,
        workshop_type_id: selectedWorkshopTypeKey,
        is_default: true,
        template_ids: filteredTemplates.map((t) => t.id),
      });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không đặt được bộ mặc định');
    } finally {
      setBundleSetting(false);
    }
  };

  const clearDefaultBundle = async () => {
    if (!selectedCompanyId || !selectedWorkshopTypeKey || selectedWorkshopTypeKey === 'global') return;
    const typeLabel = selectedWorkshopType?.name || 'phân loại này';
    const ok = window.confirm(`Bỏ đặt bộ mặc định cho «${typeLabel}»?\n\nDeal SX mới sẽ không tự sinh nhiệm vụ từ bộ này cho đến khi đặt lại.`);
    if (!ok) return;
    setBundleSetting(true);
    try {
      await api.put('/production/task-templates/set-default-bundle', {
        company_id: selectedCompanyId,
        workshop_type_id: selectedWorkshopTypeKey,
        is_default: false,
      });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không bỏ được bộ mặc định');
    } finally {
      setBundleSetting(false);
    }
  };

  const updateTemplate = async () => {
    if (!editingTpl || !editingTpl.name.trim()) return;
    try {
      // Ưu tiên giá trị pipeline_stage_id chọn trong dropdown của card đang sửa.
      // Cho phép chuyển bộ mẫu sang cột pipeline khác (hoặc Bộ mẫu chung) ngay tại header card.
      const tplArea = fixedArea || editingTpl.workshop_area || 'production';
      const editingStageId = editingTpl.pipeline_stage_id === undefined
        ? undefined
        : editingTpl.pipeline_stage_id;
      let stagePayload;
      if (tplArea === 'production') {
        if (editingStageId !== undefined) {
          stagePayload = {
            production_stage_id: editingStageId || null,
            logistics_stage_id: null,
          };
        } else {
          stagePayload = stagePayloadForTpl();
        }
      } else if (editingStageId !== undefined) {
        stagePayload = {
          logistics_stage_id: editingStageId || null,
          production_stage_id: null,
        };
      } else {
        stagePayload = stagePayloadForTpl();
      }
      const { data } = await api.put(`/production/task-templates/${editingTpl.id}`, {
        name: editingTpl.name.trim(),
        workshop_area: tplArea,
        company_id: selectedCompanyId || null,
        ...stagePayload,
        ...workshopTypePayloadForTpl(),
      });
      const tplId = editingTpl.id;
      setEditingTpl(null);
      if (data?.id) setTemplates(prev => prev.map(t => t.id === tplId ? { ...t, ...data, items: t.items } : t));
      else load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  // ═══ Checklist CRUD ═══
  // Cập nhật cục bộ trước (optimistic) → không reload cả trang; chỉ load() lại khi lỗi.
  const patchItemLocal = (tplId, itemId, patch) => {
    setTemplates(prev => prev.map(t => t.id !== tplId ? t : {
      ...t,
      items: (t.items || []).map(i => i.id === itemId ? { ...i, ...patch } : i),
    }));
  };

  const updateItemChecklist = async (tplId, itemId, checklist) => {
    patchItemLocal(tplId, itemId, { checklist });
    try {
      const { data } = await api.put(`/production/task-templates/${tplId}/items/${itemId}`, { checklist });
      if (data?.id) patchItemLocal(tplId, itemId, { ...data, checklist });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); load(); }
  };

  const updateItemVisibility = async (tplId, itemId, allowedCompanies, allowedDepts) => {
    const payload = {
      default_allowed_companies: allowedCompanies?.length ? allowedCompanies : null,
      default_allowed_departments: allowedDepts?.length ? allowedDepts : null,
    };
    patchItemLocal(tplId, itemId, payload);
    try {
      await api.put(`/production/task-templates/${tplId}/items/${itemId}`, payload);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); load(); }
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
    await updateItemChecklist(tplId, itemId, [...current, { title: text, description: '' }]);
    setNewCheckItem(p => ({ ...p, [itemId]: '' }));
  };

  const removeChecklistItem = async (tplId, itemId, idx) => {
    const tpl = templates.find(t => t.id === tplId);
    const item = tpl?.items?.find(i => i.id === itemId);
    const current = Array.isArray(item?.checklist) ? [...item.checklist] : [];
    current.splice(idx, 1);
    await updateItemChecklist(tplId, itemId, current);
  };

  // Cập nhật tiêu đề / mô tả của 1 mục checklist (chuyển chuỗi cũ → object để giữ mô tả).
  const updateChecklistItem = async (tplId, itemId, idx, patch) => {
    const tpl = templates.find(t => t.id === tplId);
    const item = tpl?.items?.find(i => i.id === itemId);
    const current = Array.isArray(item?.checklist) ? [...item.checklist] : [];
    const entry = current[idx];
    if (entry === undefined) return;
    const base = typeof entry === 'string'
      ? { title: entry }
      : { ...(entry || {}) };
    if (base.label && base.title === undefined) { base.title = base.label; }
    delete base.label;
    const next = { ...base, ...patch };
    next.title = (next.title ?? '').toString();
    next.description = (next.description ?? '').toString();
    if (patch.required_evidence_file_types !== undefined) {
      next.required_evidence_file_types = normalizeEvidenceFileTypes(patch.required_evidence_file_types);
      next.completion_requires_file_or_note = next.required_evidence_file_types.length > 0
        || !!patch.completion_requires_file_or_note;
    }
    if (patch.completion_requires_file_or_note !== undefined && patch.required_evidence_file_types === undefined) {
      next.completion_requires_file_or_note = !!patch.completion_requires_file_or_note;
    }
    // Không thay đổi gì thì bỏ qua (tránh reload thừa khi blur) — trừ khi đổi minh chứng.
    const prevTitle = typeof entry === 'string' ? entry : (entry?.title || entry?.label || '');
    const prevDesc = typeof entry === 'string' ? '' : (entry?.description || '');
    if (patch.assignee_id !== undefined) {
      next.assignee_id = patch.assignee_id ? String(patch.assignee_id) : null;
    }
    if (patch.executor_company_id !== undefined) {
      next.executor_company_id = patch.executor_company_id ? String(patch.executor_company_id) : null;
    }
    const evidencePatch = patch.required_evidence_file_types !== undefined || patch.completion_requires_file_or_note !== undefined;
    const assigneePatch = patch.assignee_id !== undefined;
    const executorPatch = patch.executor_company_id !== undefined;
    const prevAssignee = typeof entry === 'object' ? String(entry?.assignee_id || entry?.default_assignee_id || '') : '';
    const prevExecutor = typeof entry === 'object' ? String(entry?.executor_company_id || '') : '';
    if (!evidencePatch && !assigneePatch && !executorPatch && next.title === prevTitle && next.description === prevDesc) return;
    if (assigneePatch && !evidencePatch && !executorPatch && next.title === prevTitle && next.description === prevDesc
      && String(next.assignee_id || '') === prevAssignee) return;
    if (executorPatch && !evidencePatch && !assigneePatch && next.title === prevTitle && next.description === prevDesc
      && String(next.executor_company_id || '') === prevExecutor) return;
    current[idx] = next;
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
        api.put(`/production/task-templates/${tplId}/items/${item.id}`, { order_index: i })
      ));
    } catch { load(); } // Reload on error
  };

  // ═══ DRAG & DROP: Reorder templates within a stage ═══
  const handleTemplateDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const stageTpls = [...filteredTemplates].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    
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
        api.put(`/production/task-templates/${tpl.id}`, { order_index: i })
      ));
    } catch { load(); }
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

  // ═══ DRAG & DROP: Di chuyển 1 mục checklist (kể cả sang nhiệm vụ khác) ═══
  // ID checklist có dạng `ck|<itemId>|<index>`; ID nhiệm vụ là `item.id` thuần.
  const handleChecklistMove = async (tplId, activeId, overId) => {
    const tpl = templates.find(t => t.id === tplId);
    if (!tpl) return;

    const [, srcItemId, srcIdxStr] = activeId.split('|');
    const srcIdx = parseInt(srcIdxStr, 10);
    if (isNaN(srcIdx)) return;

    // Xác định nhiệm vụ đích + vị trí chèn.
    let dstItemId, dstIdx;
    if (overId.startsWith('ck|')) {
      const [, oItemId, oIdxStr] = overId.split('|');
      dstItemId = oItemId;
      dstIdx = parseInt(oIdxStr, 10);
    } else {
      // Thả lên hàng nhiệm vụ (kể cả khi checklist đang đóng/rỗng) → chèn vào cuối.
      dstItemId = overId;
      const target = (tpl.items || []).find(i => String(i.id) === String(overId));
      dstIdx = Array.isArray(target?.checklist) ? target.checklist.length : 0;
    }
    if (dstItemId == null || isNaN(dstIdx)) return;

    const srcItem = (tpl.items || []).find(i => String(i.id) === String(srcItemId));
    const dstItem = (tpl.items || []).find(i => String(i.id) === String(dstItemId));
    if (!srcItem || !dstItem) return;

    // Cùng nhiệm vụ → chỉ sắp xếp lại.
    if (String(srcItemId) === String(dstItemId)) {
      if (srcIdx === dstIdx) return;
      const list = Array.isArray(srcItem.checklist) ? [...srcItem.checklist] : [];
      const [moved] = list.splice(srcIdx, 1);
      if (moved == null) return;
      list.splice(Math.min(dstIdx, list.length), 0, moved);
      setTemplates(prev => prev.map(t => t.id !== tplId ? t : {
        ...t,
        items: (t.items || []).map(i => String(i.id) === String(srcItemId) ? { ...i, checklist: list } : i),
      }));
      await updateItemChecklist(tplId, srcItemId, list);
      return;
    }

    // Khác nhiệm vụ → gỡ khỏi nguồn, chèn vào đích.
    const srcList = Array.isArray(srcItem.checklist) ? [...srcItem.checklist] : [];
    const dstList = Array.isArray(dstItem.checklist) ? [...dstItem.checklist] : [];
    const [moved] = srcList.splice(srcIdx, 1);
    if (moved == null) return;
    dstList.splice(Math.min(dstIdx, dstList.length), 0, moved);

    // Cập nhật cục bộ ngay (optimistic).
    setTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      return {
        ...t,
        items: (t.items || []).map(i => {
          if (String(i.id) === String(srcItemId)) return { ...i, checklist: srcList };
          if (String(i.id) === String(dstItemId)) return { ...i, checklist: dstList };
          return i;
        }),
      };
    }));

    // Lưu cả 2 nhiệm vụ (đã cập nhật cục bộ ở trên — không reload khi thành công).
    try {
      await Promise.all([
        api.put(`/production/task-templates/${tplId}/items/${srcItemId}`, { checklist: srcList }),
        api.put(`/production/task-templates/${tplId}/items/${dstItemId}`, { checklist: dstList }),
      ]);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi di chuyển checklist');
      load();
    }
  };

  // Một DndContext duy nhất cho cả nhiệm vụ + checklist trong 1 bộ mẫu.
  const handleCardDragEnd = (event, tplId) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith('ck|')) {
      // Kéo 1 mục checklist (có thể sang nhiệm vụ khác).
      handleChecklistMove(tplId, activeId, overId);
      return;
    }
    // Kéo nhiệm vụ — chỉ xử lý khi thả lên 1 nhiệm vụ khác.
    if (overId.startsWith('ck|')) return;
    handleItemDragEnd(event, tplId);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );

  const stageTpls = [...filteredTemplates].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const isProductionTypeBundle = usesWorkshopType && selectedWorkshopTypeKey && selectedWorkshopTypeKey !== 'global';
  const bundleAllDefault = isProductionTypeBundle && stageTpls.length > 0 && stageTpls.every((t) => t.is_default);
  const bundleTaskCount = stageTpls.reduce((n, t) => n + (t.items?.length || 0), 0);

  const pipelineColumns = [
    { id: GLOBAL_STAGE, name: 'Bộ mẫu chung', icon: '🌐', color: '#64748b' },
    ...pipelineStages.map((s) => ({
      id: String(s.id),
      name: s.name,
      icon: s.icon || '📌',
      color: s.color || '#0f766e',
    })),
  ];
  const colQ = colQuery.trim().toLowerCase();
  const visibleColumns = pipelineColumns.filter((col) => {
    if (!colQ) return true;
    if (col.name.toLowerCase().includes(colQ)) return true;
    return stageTpls.some((t) => tplStageKey(t) === col.id && String(t.name || '').toLowerCase().includes(colQ));
  });

  const startAddForColumn = (stageKey) => {
    const key = stageKey || GLOBAL_STAGE;
    setAddToStageKey(key);
    setShowAddTpl(true);
    setNewTpl({ name: '', workshop_area: fixedArea || activeTab });
    setExpandedCols((p) => ({ ...p, [key]: true }));
  };

  const isColOpen = (id, hasTpls) => expandedCols[id] ?? hasTpls;
  const toggleCol = (id, hasTpls) => {
    setExpandedCols((p) => ({ ...p, [id]: !(p[id] ?? hasTpls) }));
  };

  const renderTplCards = (colTpls, colMeta) => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTemplateDragEnd}>
      <SortableContext items={colTpls.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {colTpls.map((tpl) => (
            <SortableItem key={tpl.id} id={tpl.id}>
              {({ dragHandleProps, isDragging }) => (
                <TemplateCard
                  tpl={tpl}
                  stage={colMeta}
                  isDragging={isDragging}
                  dragHandleProps={dragHandleProps}
                  fixedArea={fixedArea}
                  expanded={expanded[tpl.id]}
                  onToggleExpand={() => setExpanded((p) => ({ ...p, [tpl.id]: !p[tpl.id] }))}
                  editingTpl={editingTpl}
                  setEditingTpl={setEditingTpl}
                  onMoGiaVon={() => setGiaVonTpl(tpl)}
                  updateTemplate={updateTemplate}
                  toggleDefault={toggleDefault}
                  deleteTemplate={deleteTemplate}
                  newItem={newItem}
                  setNewItem={setNewItem}
                  addItem={addItem}
                  deleteItem={deleteItem}
                  editingChecklist={editingChecklist}
                  setEditingChecklist={setEditingChecklist}
                  newCheckItem={newCheckItem}
                  setNewCheckItem={setNewCheckItem}
                  addChecklistItem={addChecklistItem}
                  removeChecklistItem={removeChecklistItem}
                  updateChecklistItem={updateChecklistItem}
                  sensors={sensors}
                  handleItemDragEnd={handleItemDragEnd}
                  handleChecklistDragEnd={handleChecklistDragEnd}
                  handleCardDragEnd={handleCardDragEnd}
                  templates={templates}
                  setTemplates={setTemplates}
                  updateItemChecklist={updateItemChecklist}
                  updateTemplateItemFields={updateTemplateItemFields}
                  editingVisibility={editingVisibility}
                  setEditingVisibility={setEditingVisibility}
                  companies={companies}
                  departments={departments}
                  users={users}
                  defaultCompanyId={selectedCompanyId}
                  toggleItemCompany={toggleItemCompany}
                  toggleItemDept={toggleItemDept}
                  pipelineStages={pipelineStages}
                  activeTab={activeTab}
                  costTypes={costTypes.filter((t) => t.module_key === workshopAreaToCostModule(fixedArea || activeTab))}
                  onToggleTplCostType={toggleTplCostType}
                  onAssignStage={assignTemplateToStage}
                />
              )}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );

  const accent = isLogisticsFixed ? 'orange' : 'teal';

  return (
    <div className="space-y-5 max-w-6xl">
      {giaVonTpl && (
        <GiaVonExcelModal
          tpl={giaVonTpl}
          onClose={() => setGiaVonTpl(null)}
          onSaved={() => { setGiaVonTpl(null); load(); }}
        />
      )}
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">
            {fixedArea === 'production'
              ? 'Bộ nhiệm vụ mẫu Sản xuất'
              : fixedArea === 'logistics'
                ? 'Bộ nhiệm vụ mẫu VC / LĐ'
                : 'Bộ nhiệm vụ mẫu xưởng'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Gắn bộ vào cột pipeline — thẻ vào cột thì tự sinh việc.
            {fixedArea === 'production' && (
              <> {' '}<Link to="/sx/handover-settings" className="text-blue-600 hover:underline">Bàn giao CRM → SX</Link></>
            )}
            {fixedArea === 'logistics' && (
              <> {' '}<Link to="/vc/pipeline-settings" className="text-orange-600 hover:underline">Pipeline Lắp đặt</Link></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!fixedArea && (
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
              {[
                { key: 'production', label: '🏭 SX' },
                { key: 'logistics',  label: '🔧 Lắp' },
              ].map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setActiveTab(a.key)}
                  className={`h-8 px-3 rounded-md text-xs font-medium cursor-pointer ${
                    activeTab === a.key ? 'bg-white shadow-sm text-blue-700' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          {canPickTemplateCompany && (
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="h-9 px-3 rounded-lg border text-sm bg-white min-w-[10rem]"
            >
              <option value="">— Công ty —</option>
              {(isAdmin || isLogisticsFixed ? companies : productionWorkshopFilterCompanies(companies)).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.short_name || c.name}
                </option>
              ))}
            </select>
          )}
          <Link
            to={fixedArea === 'logistics' ? '/vc/dashboard' : '/sx/dashboard'}
            className={`text-sm font-medium ${fixedArea === 'logistics' ? 'text-orange-600 hover:text-orange-800' : 'text-blue-600 hover:text-blue-800'}`}
          >
            ← Dashboard
          </Link>
          {activeTab === 'production' && isAdmin && selectedCompanyId && (
            <button
              type="button"
              onClick={ensureNineProductionTemplates}
              disabled={seedingNine}
              className="h-9 px-3 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
            >
              {seedingNine ? '…' : 'Chuẩn hoá 9 bộ'}
            </button>
          )}
          <button
            type="button"
            onClick={() => startAddForColumn(addToStageKey || GLOBAL_STAGE)}
            disabled={!canLoadTemplates}
            className={`h-9 px-3 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer disabled:bg-gray-300 disabled:cursor-not-allowed ${
              fixedArea === 'logistics' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Plus className="h-4 w-4" /> Thêm bộ
          </button>
        </div>
      </div>

      {usesWorkshopType && selectedCompanyId && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedWorkshopTypeKey('global')}
            className={`h-8 px-3 rounded-full text-xs font-medium border cursor-pointer ${
              selectedWorkshopTypeKey === 'global'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            Tất cả loại
          </button>
          {workshopTypes.map((wt) => {
            const active = String(selectedWorkshopTypeKey) === String(wt.id);
            return (
              <button
                key={wt.id}
                type="button"
                onClick={() => setSelectedWorkshopTypeKey(wt.id)}
                className={`h-8 px-3 rounded-full text-xs font-medium border cursor-pointer ${
                  active
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-teal-300'
                }`}
              >
                {wt.icon ? `${wt.icon} ` : ''}{wt.name}
              </button>
            );
          })}
        </div>
      )}

      {showAddTpl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newTpl.name}
              onChange={(e) => setNewTpl((p) => ({ ...p, name: e.target.value }))}
              placeholder="Tên bộ mẫu…"
              className="flex-1 min-w-[12rem] h-9 px-3 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createTemplate()}
            />
            <select
              value={addToStageKey}
              onChange={(e) => setAddToStageKey(e.target.value)}
              className="h-9 px-2 rounded-lg border text-sm bg-white max-w-[16rem]"
            >
              {pipelineColumns.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            <button type="button" onClick={createTemplate} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-700">Tạo</button>
            <button type="button" onClick={() => setShowAddTpl(false)} className="h-9 px-3 bg-white border rounded-lg text-sm cursor-pointer">Hủy</button>
          </div>
          <p className="text-[11px] text-blue-800/80">Bộ mới gắn vào cột đang chọn trên danh sách.</p>
        </div>
      )}

      {canLoadTemplates && isProductionTypeBundle && stageTpls.length > 0 && (
        <div className={`rounded-xl border px-3 py-2 flex flex-wrap items-center gap-2 ${
          bundleAllDefault ? 'border-amber-300 bg-amber-50/80' : 'border-teal-200 bg-teal-50/60'
        }`}>
          <Star className={`h-4 w-4 shrink-0 ${bundleAllDefault ? 'fill-amber-500 text-amber-500' : 'text-teal-600'}`} />
          <p className="text-xs text-gray-700 flex-1 min-w-[12rem]">
            {stageTpls.length} bộ · {bundleTaskCount} việc
            {bundleAllDefault ? ' · đang là mặc định deal SX' : ' · chưa đặt mặc định'}
          </p>
          {bundleAllDefault ? (
            <button type="button" onClick={clearDefaultBundle} disabled={bundleSetting} className="h-8 px-3 rounded-lg text-xs border bg-white cursor-pointer disabled:opacity-60">
              Bỏ mặc định
            </button>
          ) : (
            <button type="button" onClick={setDefaultBundle} disabled={bundleSetting} className="h-8 px-3 rounded-lg text-xs font-medium bg-teal-600 text-white cursor-pointer disabled:opacity-60">
              Đặt mặc định
            </button>
          )}
        </div>
      )}

      {canLoadTemplates && (
        <div className="flex items-center gap-2">
          <input
            value={colQuery}
            onChange={(e) => setColQuery(e.target.value)}
            placeholder="Tìm cột hoặc tên bộ…"
            className="h-8 flex-1 min-w-[10rem] px-3 rounded-lg border text-sm"
          />
          <span className="text-[11px] text-gray-400 shrink-0">
            {stageTpls.length} bộ / {pipelineStages.length} cột
          </span>
        </div>
      )}

      {!selectedCompanyId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Chọn công ty trên thanh trên để xem cột và bộ mẫu.
        </div>
      )}

      {canLoadTemplates && (
        <div className="space-y-2">
          {visibleColumns.map((col) => {
            const colTpls = stageTpls.filter((t) => tplStageKey(t) === col.id);
            const taskN = colTpls.reduce((n, t) => n + (t.items?.length || 0), 0);
            const open = isColOpen(col.id, colTpls.length > 0);
            const colMeta = { label: col.name, icon: col.icon, color: col.color };
            return (
              <section key={col.id} className="border rounded-xl bg-white overflow-hidden">
                <div className="flex items-center gap-1 pr-2">
                  <button
                    type="button"
                    onClick={() => toggleCol(col.id, colTpls.length > 0)}
                    className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-gray-50"
                  >
                    {open ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                    <span className="w-1.5 h-6 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                    <span className="shrink-0">{col.icon}</span>
                    <span className="text-sm font-semibold truncate">{col.name}</span>
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {colTpls.length} bộ · {taskN} việc
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startAddForColumn(col.id)}
                    className={`h-7 px-2 rounded-lg text-[11px] font-medium border cursor-pointer shrink-0 ${
                      accent === 'orange'
                        ? 'border-orange-200 text-orange-800 hover:bg-orange-50'
                        : 'border-teal-200 text-teal-800 hover:bg-teal-50'
                    }`}
                  >
                    + Gắn
                  </button>
                </div>
                {open && (
                  <div className="border-t px-2 py-2 bg-gray-50/60">
                    {colTpls.length === 0 ? (
                      <p className="text-xs text-gray-400 px-2 py-1">Chưa gắn bộ — bấm + Gắn</p>
                    ) : renderTplCards(colTpls, colMeta)}
                  </div>
                )}
              </section>
            );
          })}
          {visibleColumns.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              {pipelineStages.length === 0
                ? <>Chưa có cột pipeline — cấu hình tại <Link to={isLogisticsFixed ? '/vc/pipeline-settings' : '/sx/pipeline-settings'} className="text-blue-600 hover:underline">Pipeline {isLogisticsFixed ? 'Lắp đặt' : 'xưởng'}</Link>.</>
                : 'Không khớp tìm kiếm.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══ Template Card with drag-drop items ═══
function TemplateCard({
  tpl, stage, isDragging, dragHandleProps, fixedArea = '', expanded, onToggleExpand,
  editingTpl, setEditingTpl, updateTemplate, toggleDefault, deleteTemplate, onMoGiaVon,
  newItem, setNewItem, addItem, deleteItem,
  editingChecklist, setEditingChecklist, newCheckItem, setNewCheckItem,
  addChecklistItem, removeChecklistItem, updateChecklistItem,
  sensors, handleItemDragEnd, handleChecklistDragEnd, handleCardDragEnd,
  editingVisibility, setEditingVisibility,
  companies, departments, users = [], defaultCompanyId = '', toggleItemCompany, toggleItemDept,
  updateTemplateItemFields,
  pipelineStages = [], activeTab = 'production',
  costTypes = [], onToggleTplCostType, onAssignStage,
}) {
  const tplArea = fixedArea || tpl.workshop_area || activeTab || 'production';
  const showPipelineUi = tplArea === 'logistics' || tplArea === 'production';
  const tplStageId = showPipelineUi
    ? (tplArea === 'logistics' ? (tpl.logistics_stage_id || null) : (tpl.production_stage_id || null))
    : null;
  const tplStageRow = tplStageId
    ? pipelineStages.find((s) => String(s.id) === String(tplStageId)) || null
    : null;
  // Số nhiệm vụ "chặn chuyển giai đoạn" còn lại trong bộ mẫu (giúp người cấu hình nhìn nhanh trên header).
  const blockingItemsCount = (tpl.items || []).filter((it) => it && it.blocks_stage_advance).length;
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingAssignee, setEditingAssignee] = useState({});
  const [itemEditForm, setItemEditForm] = useState({
    title: '', description: '', priority: 'medium', deadline_days: 0,
    blocks_stage_advance: false, clears_delivery_deadline_on_complete: false,
    completion_requires_file_or_note: false, required_evidence_file_types: [],
    requires_quick_verdict: false, executor_company_id: '', default_assignee_id: '', default_assignee_ids: [],
    require_cost_excel: false, cost_type_id: '',
  });

  const sortedItems = [...(tpl.items || [])].sort((a, b) => a.order_index - b.order_index);

  const saveItemAssignees = async (itemId, ids) => {
    const payload = {
      default_assignee_ids: ids?.length ? ids : [],
      default_assignee_id: ids?.[0] || null,
    };
    await updateTemplateItemFields(tpl.id, itemId, payload);
    if (editingItemId === itemId) {
      setItemEditForm((f) => ({
        ...f,
        default_assignee_ids: ids || [],
        default_assignee_id: ids?.[0] || '',
      }));
    }
  };

  const openItemEdit = (item) => {
    setEditingItemId(item.id);
    setItemEditForm({
      title: item.title || '',
      description: item.description || '',
      priority: item.priority || 'medium',
      deadline_days: item.deadline_days ?? 0,
      blocks_stage_advance: !!item.blocks_stage_advance,
      clears_delivery_deadline_on_complete: !!item.clears_delivery_deadline_on_complete,
      completion_requires_file_or_note: !!item.completion_requires_file_or_note,
      required_evidence_file_types: normalizeEvidenceFileTypes(item.required_evidence_file_types),
      requires_quick_verdict: !!item.requires_quick_verdict,
      executor_company_id: item.executor_company_id || '',
      default_assignee_id: templateItemAssigneeIds(item)[0] || '',
      default_assignee_ids: templateItemAssigneeIds(item),
      require_cost_excel: !!item.require_cost_excel,
      cost_type_id: item.cost_type_id || '',
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
        clears_delivery_deadline_on_complete: !!itemEditForm.clears_delivery_deadline_on_complete,
        completion_requires_file_or_note: !!itemEditForm.completion_requires_file_or_note
          || (itemEditForm.required_evidence_file_types?.length > 0),
        required_evidence_file_types: itemEditForm.required_evidence_file_types || [],
        requires_quick_verdict: !!itemEditForm.requires_quick_verdict,
        executor_company_id: itemEditForm.executor_company_id || null,
        default_assignee_ids: templateItemAssigneeIds(itemEditForm),
        default_assignee_id: templateItemAssigneeIds(itemEditForm)[0] || null,
        require_cost_excel: !!itemEditForm.require_cost_excel,
        cost_type_id: itemEditForm.require_cost_excel ? (itemEditForm.cost_type_id || null) : null,
      });
      setEditingItemId(null);
    } catch { /* alert trong updateTemplateItemFields */ }
  };

  const toggleItemQuickVerdict = async (item) => {
    try {
      await updateTemplateItemFields(tpl.id, item.id, {
        requires_quick_verdict: !item.requires_quick_verdict,
      });
    } catch { /* alert trong updateTemplateItemFields */ }
  };

  const toggleItemEvidence = async (item) => {
    try {
      const types = normalizeEvidenceFileTypes(item.required_evidence_file_types);
      if (types.length || item.completion_requires_file_or_note) {
        await updateTemplateItemFields(tpl.id, item.id, {
          completion_requires_file_or_note: false,
          required_evidence_file_types: [],
        });
      } else {
        await updateTemplateItemFields(tpl.id, item.id, {
          completion_requires_file_or_note: true,
          required_evidence_file_types: [],
        });
      }
    } catch { /* alert trong updateTemplateItemFields */ }
  };

  // Bật/tắt nhanh cờ "chặn chuyển giai đoạn" — parity với CRMTemplatesPage.
  const toggleItemBlocking = async (item) => {
    try {
      await updateTemplateItemFields(tpl.id, item.id, {
        blocks_stage_advance: !item.blocks_stage_advance,
      });
    } catch { /* alert trong updateTemplateItemFields */ }
  };

  const toggleItemClearDelivery = async (item) => {
    try {
      await updateTemplateItemFields(tpl.id, item.id, {
        clears_delivery_deadline_on_complete: !item.clears_delivery_deadline_on_complete,
      });
    } catch { /* alert trong updateTemplateItemFields */ }
  };

  return (
    <div className={`border rounded-xl overflow-hidden bg-white ${isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''}`}>
      {/* Header */}
      {editingTpl?.id === tpl.id ? (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-200">
          <input value={editingTpl.name} onChange={e => setEditingTpl(p => ({ ...p, name: e.target.value }))}
            className="flex-1 min-w-[180px] h-8 px-2 rounded border text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus onKeyDown={e => e.key === 'Enter' && updateTemplate()} />
          {!fixedArea && (
            <select value={editingTpl.workshop_area} onChange={e => setEditingTpl(p => ({ ...p, workshop_area: e.target.value }))}
              className="h-8 px-2 rounded border text-xs bg-white">
              {ALL_WORKSHOP_AREAS.map(s => <option key={s.slug} value={s.slug}>{s.icon} {s.label}</option>)}
            </select>
          )}
          {showPipelineUi && (
          <label className="flex items-center gap-1.5 h-8 px-2 rounded border border-blue-200 bg-white text-xs text-gray-700"
            title="Bộ mẫu sẽ áp lên đúng cột pipeline VC này.">
            <MapPin className="h-3.5 w-3.5 text-teal-600" />
            <span className="font-semibold text-[10px] text-gray-500 uppercase">Cột pipeline:</span>
            <select
              value={editingTpl.pipeline_stage_id ?? ''}
              onChange={(e) => setEditingTpl((p) => ({ ...p, pipeline_stage_id: e.target.value }))}
              className="h-7 px-1 rounded text-xs bg-white border border-transparent focus:border-blue-300 focus:outline-none max-w-[220px]"
            >
              <option value="">🌐 Bộ mẫu chung (mọi cột)</option>
              {(pipelineStages || []).map((st) => (
                <option key={st.id} value={st.id}>
                  {(st.icon || '📌')} {st.name}
                </option>
              ))}
            </select>
          </label>
          )}
          <button onClick={updateTemplate} className="h-8 px-3 bg-blue-600 text-white rounded text-xs cursor-pointer hover:bg-blue-700 flex items-center gap-1">
            <Save className="h-3 w-3" /> Lưu
          </button>
          <button onClick={() => setEditingTpl(null)} className="h-8 px-2 bg-gray-100 rounded text-xs cursor-pointer"><X className="h-3 w-3" /></button>
          {showPipelineUi && (
          <p className="basis-full text-[10px] text-blue-900/70 leading-snug">
            💡 Bộ mẫu sẽ được áp khi thẻ vào <strong>{tplStageRow ? `cột "${tplStageRow.name}"` : 'bất kỳ cột nào trong khu vực này'}</strong>
            {tplArea === 'production' ? ' — NV được gán theo cấu hình Bàn giao CRM → SX.' : '.'}
            {' '}Các nhiệm vụ ⛔ <strong>Chặn chuyển giai đoạn</strong> phải hoàn thành trước khi kéo sang cột tiếp theo.
          </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 touch-none">
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="flex-1 flex items-center gap-2 cursor-pointer min-w-0" onClick={onToggleExpand}>
            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
            <span className="text-sm font-semibold flex-1 truncate" title={tpl.name}>{tpl.name}</span>
            {showPipelineUi && (
              <select
                value={tplStageId || ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onAssignStage?.(tpl, e.target.value || 'global');
                }}
                className="h-6 max-w-[10rem] text-[10px] rounded-full border border-teal-200 bg-teal-50 text-teal-800 px-1.5 cursor-pointer shrink-0"
                title="Chuyển bộ sang cột khác"
              >
                <option value="">🌐 Bộ mẫu chung</option>
                {(pipelineStages || []).map((st) => (
                  <option key={st.id} value={st.id}>
                    {(st.icon || '📌')} {st.name}
                  </option>
                ))}
              </select>
            )}
            {blockingItemsCount > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5 shrink-0"
                title={`Có ${blockingItemsCount} nhiệm vụ chặn chuyển giai đoạn — deal phải hoàn thành tất cả các nhiệm vụ này trước khi chuyển cột pipeline.`}>
                ⛔ {blockingItemsCount} chặn
              </span>
            )}
            {tpl.is_default && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0">⭐ Mặc định</span>}
            <span className="text-xs text-gray-400 shrink-0">{tpl.items?.length || 0} việc</span>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onMoGiaVon?.(); }}
            className="p-1 text-gray-400 hover:text-emerald-600 cursor-pointer"
            title="Nhập Excel giá vốn (chi phí / giá gia công) cho từng nhiệm vụ trong mẫu này">
            <FileSpreadsheet className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={(e) => {
              e.stopPropagation();
              setEditingTpl({
                id: tpl.id,
                name: tpl.name,
                workshop_area: tpl.workshop_area,
                pipeline_stage_id: tplStageId || tpl.production_stage_id || '',
              });
            }}
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
          <p className="text-[10px] text-gray-600 mb-2 leading-snug bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">
            <span className="font-semibold text-gray-700">Gán NV:</span>{' '}
            Bấm icon <User className="h-3 w-3 inline -mt-0.5" /> trên từng dòng — có thể chọn nhiều người, lọc công ty/phòng ban, tìm tên. SX: ưu tiên{' '}
            <Link to="/sx/handover-settings" className="text-teal-700 hover:underline">Bàn giao CRM → SX</Link>
            {' '}theo công ty nếu đã cấu hình.
          </p>
          <CostTypeTemplateChecks
            types={costTypes}
            selectedIds={tpl.cost_excel_type_ids || []}
            onToggle={(type, on) => onToggleTplCostType?.(tpl, type, on)}
          />
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragEnd={(e) => handleCardDragEnd(e, tpl.id)}>
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
                        {(item.chi_phi != null || item.gia_gia_cong != null) && (
                          <span
                            className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-700"
                            title={[
                              item.chi_phi != null ? `Chi phí: ${Number(item.chi_phi).toLocaleString('vi-VN')}đ` : null,
                              item.gia_gia_cong != null ? `Giá gia công: ${Number(item.gia_gia_cong).toLocaleString('vi-VN')}đ` : null,
                              item.don_vi_tinh ? `ĐVT: ${item.don_vi_tinh}` : null,
                              item.ghi_chu_gia || null,
                            ].filter(Boolean).join(' · ')}
                          >
                            {item.gia_gia_cong != null
                              ? Number(item.gia_gia_cong).toLocaleString('vi-VN')
                              : Number(item.chi_phi).toLocaleString('vi-VN')}đ
                          </span>
                        )}
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
                        {item.executor_company_id && (
                          <span
                            className="text-[9px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-full font-medium max-w-[120px] truncate"
                            title="Giao cho công ty khác thực hiện"
                          >
                            🤝 {companies.find((c) => String(c.id) === String(item.executor_company_id))?.short_name
                              || companies.find((c) => String(c.id) === String(item.executor_company_id))?.name
                              || 'Đối tác'}
                          </span>
                        )}
                        {(item.default_allowed_companies?.length > 0 || item.default_allowed_departments?.length > 0) && (
                          <span className="text-[9px] bg-red-50 text-red-600 px-1 py-0.5 rounded-full">🔒</span>
                        )}
                        {item.blocks_stage_advance && (
                          <span
                            className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"
                            title="Chặn chuyển giai đoạn — phải hoàn thành trước khi kéo cột Kanban SX"
                          >⛔ Chặn</span>
                        )}
                        {item.clears_delivery_deadline_on_complete && tplArea === 'production' && (
                          <span
                            className="text-[9px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"
                            title="HT nhiệm vụ → tự tắt deadline ngày giao hàng trên dự án"
                          >🚚 Tắt DL giao</span>
                        )}
                        {(!!item.completion_requires_file_or_note || normalizeEvidenceFileTypes(item.required_evidence_file_types).length > 0) && (
                          <span
                            className="text-[9px] bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded-full font-medium max-w-[200px] truncate"
                            title={`Bắt buộc minh chứng: ${formatEvidenceTypesShort(item.required_evidence_file_types) || 'file/ghi chú bất kỳ'}`}
                          >
                            📎 {formatEvidenceTypesShort(item.required_evidence_file_types) || 'Minh chứng'}
                          </span>
                        )}
                        {item.requires_quick_verdict && (
                          <span
                            className="text-[9px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded-full font-medium"
                            title="Ghi chú nhanh: phải chọn Đã đủ / Chưa (+ lý do) trước khi hoàn thành hoặc chuyển giai đoạn"
                          >
                            ✓ Đủ/Chưa
                          </span>
                        )}
                        {(item.require_cost_excel || item.cost_type_id) && (
                          <span
                            className="text-[9px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"
                            title="Hoàn thành nhiệm vụ này bắt buộc đã upload Excel loại chi phí"
                          >
                            <FileSpreadsheet className="h-2.5 w-2.5" /> Excel CP
                          </span>
                        )}
                        <button type="button" onClick={() => toggleItemBlocking(item)}
                          className={`p-1 rounded cursor-pointer shrink-0 ${item.blocks_stage_advance ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-gray-400 hover:bg-amber-50 hover:text-amber-600'}`}
                          title={item.blocks_stage_advance ? 'Đang chặn chuyển giai đoạn — bấm để tắt' : 'Bật chặn: bắt buộc hoàn thành trước khi chuyển giai đoạn SX'}>
                          <Lock className="h-3.5 w-3.5" /></button>
                        {tplArea === 'production' && (
                          <button type="button" onClick={() => toggleItemClearDelivery(item)}
                            className={`p-1 rounded cursor-pointer shrink-0 ${item.clears_delivery_deadline_on_complete ? 'text-rose-600 bg-rose-50 hover:bg-rose-100' : 'text-gray-400 hover:bg-rose-50 hover:text-rose-600'}`}
                            title={item.clears_delivery_deadline_on_complete ? 'HT nhiệm vụ sẽ tắt deadline ngày giao hàng — bấm để tắt' : 'Bật: HT nhiệm vụ tự tắt deadline ngày giao hàng'}>
                            <Truck className="h-3.5 w-3.5" /></button>
                        )}
                        <button type="button" onClick={() => toggleItemEvidence(item)}
                          className={`p-1 rounded cursor-pointer shrink-0 ${(item.completion_requires_file_or_note || normalizeEvidenceFileTypes(item.required_evidence_file_types).length) ? 'text-violet-600 bg-violet-50 hover:bg-violet-100' : 'text-gray-400 hover:bg-violet-50 hover:text-violet-600'}`}
                          title="Cấu hình loại file/ghi chú bắt buộc khi hoàn thành">
                          <Paperclip className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => toggleItemQuickVerdict(item)}
                          className={`p-1 rounded cursor-pointer shrink-0 ${item.requires_quick_verdict ? 'text-sky-600 bg-sky-50 hover:bg-sky-100' : 'text-gray-400 hover:bg-sky-50 hover:text-sky-600'}`}
                          title={item.requires_quick_verdict ? 'Đang bật ghi chú nhanh Đủ/Chưa — bấm để tắt' : 'Bật ghi chú nhanh: Đã đủ / Chưa (+ lý do)'}>
                          <MessageSquare className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setEditingAssignee((p) => ({ ...p, [item.id]: !p[item.id] }))}
                          className={`p-1 rounded cursor-pointer shrink-0 ${templateItemAssigneeCount(item) || editingAssignee[item.id] ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'}`}
                          title={templateItemAssigneeCount(item)
                            ? `Đã gán ${templateItemAssigneeCount(item)} NV — bấm để sửa`
                            : 'Gán nhân viên (có thể nhiều người)'}>
                          <User className="h-3.5 w-3.5" /></button>
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
                      {editingAssignee[item.id] && (
                        <TemplateItemAssigneePicker
                          item={item}
                          companies={companies}
                          defaultCompanyId={defaultCompanyId}
                          compact
                          onSave={(ids) => saveItemAssignees(item.id, ids)}
                        />
                      )}
                      {editingItemId === item.id && (
                        <div className="mx-2 mb-2 p-3 bg-sky-50 rounded-lg border border-sky-200 space-y-2" onClick={e => e.stopPropagation()}>
                          <p className="text-[10px] text-sky-700 font-bold uppercase tracking-wide">✏️ Sửa nhiệm vụ mẫu</p>
                          <input
                            value={itemEditForm.title}
                            onChange={e => setItemEditForm(f => ({ ...f, title: e.target.value }))}
                            className="w-full h-8 px-2 rounded border text-sm outline-none focus:ring-2 focus:ring-sky-400"
                            placeholder="Tên nhiệm vụ..."
                          />
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 mb-1">🤝 Công ty thực hiện (giao việc chéo)</p>
                            <select
                              value={itemEditForm.executor_company_id || ''}
                              onChange={async (e) => {
                                const executor_company_id = e.target.value || '';
                                setItemEditForm((f) => ({ ...f, executor_company_id }));
                                try {
                                  await updateTemplateItemFields(tpl.id, item.id, {
                                    executor_company_id: executor_company_id || null,
                                  });
                                } catch { /* alert trong updateTemplateItemFields */ }
                              }}
                              className="w-full h-8 px-2 rounded border text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                              <option value="">Cùng công ty chủ dự án</option>
                              {companies.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}{c.short_name ? ` (${c.short_name})` : ''}</option>
                              ))}
                            </select>
                            <p className="text-[10px] text-gray-400 mt-1">Khi kích hoạt bộ mẫu ở pipeline, NV công ty này nhận việc và thấy dự án trên Kanban SX.</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 mb-1 flex items-center gap-1">
                              <User className="h-3 w-3 text-indigo-600" /> Nhân viên mặc định
                            </p>
                            <TemplateItemAssigneePicker
                              item={itemEditForm.default_assignee_ids?.length ? itemEditForm : item}
                              companies={companies}
                              defaultCompanyId={defaultCompanyId}
                              compact
                              onSave={(ids) => saveItemAssignees(editingItemId, ids)}
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Dùng khi gen nhiệm vụ sx_* nếu chưa cấu hình riêng ở Bàn giao CRM → SX.</p>
                          </div>
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
                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 h-8 rounded cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!itemEditForm.blocks_stage_advance}
                                onChange={e => setItemEditForm(f => ({ ...f, blocks_stage_advance: e.target.checked }))}
                                className="accent-amber-600"
                              />
                              ⛔ Chặn chuyển giai đoạn
                            </label>
                            {tplArea === 'production' && (
                              <label className="flex items-center gap-1.5 text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200 px-2 h-8 rounded cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={!!itemEditForm.clears_delivery_deadline_on_complete}
                                  onChange={e => setItemEditForm(f => ({ ...f, clears_delivery_deadline_on_complete: e.target.checked }))}
                                  className="accent-rose-600"
                                />
                                <Truck className="h-3 w-3" /> HT → tắt DL giao hàng
                              </label>
                            )}
                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 px-2 h-8 rounded cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!itemEditForm.completion_requires_file_or_note || (itemEditForm.required_evidence_file_types?.length > 0)}
                                onChange={e => setItemEditForm(f => ({
                                  ...f,
                                  completion_requires_file_or_note: e.target.checked,
                                  required_evidence_file_types: e.target.checked ? (f.required_evidence_file_types || []) : [],
                                }))}
                                className="accent-violet-600"
                              />
                              <Paperclip className="h-3 w-3" /> Bắt buộc minh chứng
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 px-2 h-8 rounded cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!itemEditForm.requires_quick_verdict}
                                onChange={e => setItemEditForm(f => ({ ...f, requires_quick_verdict: e.target.checked }))}
                                className="accent-sky-600"
                              />
                              <MessageSquare className="h-3 w-3" /> Ghi chú nhanh Đủ/Chưa
                            </label>
                            <CostTypeItemSelect
                              types={costTypes}
                              requireExcel={!!itemEditForm.require_cost_excel}
                              costTypeId={itemEditForm.cost_type_id}
                              onChange={(patch) => setItemEditForm((f) => ({ ...f, ...patch }))}
                            />
                            <span className="flex-1" />
                            <button type="button" onClick={() => setEditingItemId(null)} className="h-8 px-3 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer">
                              Hủy
                            </button>
                            <button type="button" onClick={saveItemEdit} className="h-8 px-3 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 cursor-pointer flex items-center gap-1">
                              <Save className="h-3 w-3" /> Lưu
                            </button>
                          </div>
                          {(itemEditForm.completion_requires_file_or_note || itemEditForm.required_evidence_file_types?.length > 0) && (
                            <div className="rounded-lg border border-violet-200 bg-white p-2">
                              <EvidenceFileTypesPicker
                                compact
                                value={itemEditForm.required_evidence_file_types}
                                onChange={(types) => setItemEditForm((f) => ({
                                  ...f,
                                  required_evidence_file_types: types,
                                  completion_requires_file_or_note: types.length > 0 || f.completion_requires_file_or_note,
                                }))}
                              />
                            </div>
                          )}
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
                          users={users} companies={companies}
                          parentExecutorCompanyId={item.executor_company_id || ''}
                          removeChecklistItem={removeChecklistItem} addChecklistItem={addChecklistItem}
                          updateChecklistItem={updateChecklistItem}
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

// Đọc tiêu đề / mô tả của 1 mục checklist (hỗ trợ cả dữ liệu cũ dạng chuỗi).
const ckTitleOf = (ck) => (typeof ck === 'string' ? ck : (ck?.title || ck?.label || ''));
const ckDescOf = (ck) => (typeof ck === 'string' ? '' : (ck?.description || ''));
const ckEvidenceTypesOf = (ck) => normalizeEvidenceFileTypes(typeof ck === 'object' ? ck?.required_evidence_file_types : []);
const ckAssigneeOf = (ck) => (typeof ck === 'object' ? String(ck?.assignee_id || ck?.default_assignee_id || '') : '');
const ckExecutorCompanyOf = (ck) => (typeof ck === 'object' ? String(ck?.executor_company_id || '') : '');

// ═══ Checklist Editor with drag & drop ═══
function ChecklistEditor({
  tplId, itemId, checklist, users = [], companies = [], parentExecutorCompanyId = '',
  removeChecklistItem, addChecklistItem, updateChecklistItem, newCheckItem, setNewCheckItem,
}) {
  // ID dạng `ck|<itemId>|<index>` để cha (DndContext của bộ mẫu) phân biệt với nhiệm vụ
  // và cho phép kéo 1 mục checklist sang nhiệm vụ khác.
  const checkIds = checklist.map((_, i) => `ck|${itemId}|${i}`);
  return (
    <div className="ml-10 pl-3 border-l-2 border-emerald-200 mb-2 space-y-1.5">
      <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Checklist mẫu — kéo thả để sắp xếp (có thể kéo sang nhiệm vụ khác)</p>
      <SortableContext items={checkIds} strategy={verticalListSortingStrategy}>
        {checklist.map((ck, ci) => (
          <SortableItem key={checkIds[ci]} id={checkIds[ci]}>
            {({ dragHandleProps: ckDrag }) => (
              <div className="flex items-start gap-2 text-xs bg-white border border-emerald-100 rounded-md px-1.5 py-1.5">
                <div {...ckDrag} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none mt-1.5">
                  <GripVertical className="h-3 w-3" />
                </div>
                <span className="text-emerald-500 mt-1.5">☐</span>
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    key={`t|${checkIds[ci]}|${ckTitleOf(ck)}`}
                    defaultValue={ckTitleOf(ck)}
                    placeholder="Tên mục checklist"
                    className="w-full h-7 px-2 text-xs font-medium border rounded outline-none focus:ring-1 focus:ring-emerald-400"
                    onBlur={e => updateChecklistItem(tplId, itemId, ci, { title: e.target.value.trim() })}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                  <input
                    key={`d|${checkIds[ci]}|${ckDescOf(ck)}`}
                    defaultValue={ckDescOf(ck)}
                    placeholder="Mô tả / hướng dẫn (tùy chọn)"
                    className="w-full h-7 px-2 text-[11px] text-gray-600 border border-gray-200 rounded outline-none focus:ring-1 focus:ring-emerald-300"
                    onBlur={e => updateChecklistItem(tplId, itemId, ci, { description: e.target.value.trim() })}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                    <div className="flex items-center gap-1.5 flex-wrap">
                    <User className="h-3 w-3 text-indigo-600 shrink-0" />
                    <select
                      value={ckAssigneeOf(ck)}
                      onChange={(e) => updateChecklistItem(tplId, itemId, ci, {
                        assignee_id: e.target.value || null,
                      })}
                      className="h-7 min-w-[140px] flex-1 max-w-full px-2 text-[11px] border border-indigo-200 rounded bg-white outline-none focus:ring-1 focus:ring-indigo-300"
                      title="Nhân viên mặc định khi sinh nhiệm vụ từ mẫu"
                    >
                      <option value="">— Chưa gán —</option>
                      {(users || []).map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Globe className="h-3 w-3 text-teal-600 shrink-0" />
                    <select
                      value={ckExecutorCompanyOf(ck)}
                      onChange={(e) => updateChecklistItem(tplId, itemId, ci, {
                        executor_company_id: e.target.value || null,
                      })}
                      className="h-7 min-w-[140px] flex-1 max-w-full px-2 text-[11px] border border-teal-200 rounded bg-white outline-none focus:ring-1 focus:ring-teal-300"
                      title="Công ty thực hiện mục checklist"
                    >
                      <option value="">
                        {parentExecutorCompanyId
                          ? `Kế thừa (${companies.find((c) => String(c.id) === String(parentExecutorCompanyId))?.short_name || companies.find((c) => String(c.id) === String(parentExecutorCompanyId))?.name || 'nhiệm vụ cha'})`
                          : 'Cùng công ty chủ dự án'}
                      </option>
                      {(companies || []).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.short_name ? ` (${c.short_name})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-1.5 text-[10px] font-medium text-violet-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checklistItemRequiresEvidence(ck)}
                      onChange={(e) => updateChecklistItem(tplId, itemId, ci, {
                        completion_requires_file_or_note: e.target.checked,
                        required_evidence_file_types: e.target.checked ? ckEvidenceTypesOf(ck) : [],
                      })}
                      className="accent-violet-600"
                    />
                    <Paperclip className="h-3 w-3" /> Bắt buộc minh chứng khi tick xong
                  </label>
                  {checklistItemRequiresEvidence(ck) && (
                    <div className="rounded border border-violet-100 bg-violet-50/40 p-1.5">
                      <EvidenceFileTypesPicker
                        compact
                        value={ckEvidenceTypesOf(ck)}
                        onChange={(types) => updateChecklistItem(tplId, itemId, ci, {
                          required_evidence_file_types: types,
                          completion_requires_file_or_note: types.length > 0 || !!ck.completion_requires_file_or_note,
                        })}
                      />
                    </div>
                  )}
                </div>
                <button onClick={() => removeChecklistItem(tplId, itemId, ci)}
                  className="p-0.5 text-gray-300 hover:text-red-500 cursor-pointer mt-1.5"><X className="h-3 w-3" /></button>
              </div>
            )}
          </SortableItem>
        ))}
      </SortableContext>
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