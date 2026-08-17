/**
 * Nguồn dữ liệu cho bộ chọn điều kiện của luồng module.
 *
 * Điều kiện không tạo trường mới: nó trỏ tới cấu hình đã cài sẵn ở nhiệm vụ mẫu
 * (crm_task_template_items / workshop_task_template_items) và ở cột pipeline.
 * Các hàm dưới đây dùng đúng endpoint mà sơ đồ hệ sinh thái đang dùng.
 */

import api from './api';

/** Nguồn dữ liệu theo module: CRM đọc pipeline CRM, SX/LĐ đọc kanban xưởng. */
export function conditionSourceForModule(moduleKey) {
  if (moduleKey === 'production') return 'production';
  if (moduleKey === 'logistics') return 'logistics';
  return 'crm';
}

/** Cờ cột có thể dùng làm điều kiện, theo từng nguồn. */
export const STAGE_FLAGS = {
  crm: [
    { value: 'is_won', label: 'Cột Thắng' },
    { value: 'is_lost', label: 'Cột Mất' },
    { value: 'show_sx_transfer', label: 'Cho chuyển Sản xuất' },
    { value: 'requires_deadline', label: 'Bắt buộc deadline' },
    { value: 'allow_revert_to_lead', label: 'Cho trả về Lead' },
    { value: 'is_revert_to_lead_target', label: 'Cột nhận Lead trả về' },
    { value: 'send_zalo_on_enter', label: 'Gửi Zalo khi vào cột' },
    { value: 'create_event_on_enter', label: 'Tạo sự kiện khi vào cột' },
    { value: 'counts_as_won_revenue', label: 'Tính doanh thu thắng' },
    { value: 'counts_as_completed_revenue', label: 'Tính doanh thu hoàn thành' },
  ],
  production: [
    { value: 'is_handover_to_logistics', label: 'Cột bàn giao Lắp đặt' },
    { value: 'is_packaging_done', label: 'Đóng gói xong' },
    { value: 'requires_deadline', label: 'Bắt buộc deadline' },
    { value: 'converts_workshop_type', label: 'Chuyển loại xưởng' },
    { value: 'counts_as_completed_revenue', label: 'Tính doanh thu hoàn thành' },
    { value: 'counts_as_collected_revenue', label: 'Tính doanh thu đã thu' },
  ],
  logistics: [
    { value: 'is_handover_to_install', label: 'Cột bàn giao Lắp đặt' },
  ],
};

export function stageFlagLabel(source, flag) {
  const list = STAGE_FLAGS[source] || STAGE_FLAGS.crm;
  return list.find((f) => f.value === flag)?.label || flag;
}

/** Cờ đã cài sẵn trên một mục nhiệm vụ — hiển thị dạng chip chỉ đọc. */
export function taskItemRequirementChips(item) {
  const chips = [];
  if (item?.blocks_stage_advance) chips.push({ key: 'block', label: 'Chặn chuyển cột', tone: 'rose' });

  const types = Array.isArray(item?.required_evidence_file_types) ? item.required_evidence_file_types : [];
  const TYPE_LABEL = {
    image: 'Hình ảnh',
    note: 'Ghi chú',
    video: 'Video',
    excel: 'Excel',
    document: 'Tài liệu',
    sketchup: 'SketchUp',
    autocad: 'AutoCAD',
    render: 'Render',
    archive: 'File nén',
    other: 'File khác',
  };
  for (const t of types) {
    chips.push({ key: `type-${t}`, label: `Cần ${TYPE_LABEL[t] || t}`, tone: 'amber' });
  }
  if (!types.length && item?.completion_requires_file_or_note) {
    chips.push({ key: 'evidence', label: 'Cần file hoặc ghi chú', tone: 'amber' });
  }
  if (item?.requires_quick_verdict) chips.push({ key: 'verdict', label: 'Cần xác nhận Đủ', tone: 'violet' });
  if (item?.completion_requires_customer_note) chips.push({ key: 'cnote', label: 'Cần ghi chú khách', tone: 'sky' });
  if (item?.completion_requires_customer_contact) chips.push({ key: 'ccontact', label: 'Cần minh chứng liên hệ', tone: 'sky' });
  return chips;
}

export function templateItemsOf(template) {
  const items = template?.items || template?.template_items || [];
  return Array.isArray(items) ? items : [];
}

/** Công ty thuộc các khối được gán cho module trong cấu hình Hệ sinh thái. */
export async function loadModuleCompanies(moduleKey) {
  try {
    const { data } = await api.get('/ecosystem/module-companies', { params: { module_key: moduleKey } });
    return Array.isArray(data?.companies) ? data.companies : [];
  } catch {
    return [];
  }
}

/**
 * Danh sách pipeline của module, đã lọc theo công ty thuộc module.
 * SX/LĐ không có bảng pipeline riêng nên mỗi công ty là một kanban.
 */
export async function loadModulePipelines(moduleKey, companies) {
  const scopedIds = companies?.length ? new Set(companies.map((c) => String(c.id))) : null;

  if (moduleKey === 'crm') {
    const { data } = await api.get('/crm/pipelines');
    const list = Array.isArray(data) ? data : (data?.pipelines || []);
    return list
      .filter((p) => p.company?.id || p.company_id)
      .filter((p) => !scopedIds || scopedIds.has(String(p.company?.id || p.company_id)))
      .map((p) => ({
        id: p.id,
        name: p.name || 'Pipeline',
        companyId: String(p.company?.id || p.company_id),
        companyName: p.company?.name || p.company_name || 'Công ty',
      }));
  }

  const isLogistics = moduleKey === 'logistics';
  return (companies || []).map((company) => ({
    id: `${moduleKey}-kanban-${company.id}`,
    name: isLogistics ? 'Kanban Lắp đặt' : 'Kanban Sản xuất',
    companyId: String(company.id),
    companyName: company.name,
  }));
}

/**
 * Cột + mẫu nhiệm vụ của một pipeline.
 * @returns {{ stages: [], byStage: {}, globalTemplates: [] }}
 */
export async function loadPipelineStages(moduleKey, pipeline) {
  if (!pipeline) return { stages: [], byStage: {}, globalTemplates: [] };

  let stages = [];
  let templates = [];
  let stageKey = 'pipeline_stage_id';

  if (moduleKey === 'crm') {
    const [plRes, tplRes] = await Promise.all([
      api.get(`/crm/pipelines/${pipeline.id}`),
      api.get('/crm/task-templates', { params: { pipeline_id: pipeline.id } }).catch(() => ({ data: [] })),
    ]);
    stages = (plRes.data?.stages || []).filter((s) => s.is_active !== false);
    templates = Array.isArray(tplRes.data) ? tplRes.data : [];
  } else {
    const area = moduleKey === 'logistics' ? 'logistics' : 'production';
    stageKey = area === 'logistics' ? 'logistics_stage_id' : 'production_stage_id';
    const stagesPath = area === 'logistics' ? '/logistics/pipeline-stages' : '/production/pipeline-stages';
    const companyParams = pipeline.companyId
      ? { company_id: pipeline.companyId, strict_company: 'true' }
      : {};
    const [stRes, tplRes] = await Promise.all([
      api.get(stagesPath, { params: companyParams }).catch(() => ({ data: [] })),
      api.get('/production/task-templates', {
        params: {
          workshop_area: area,
          active_only: 'true',
          ...(pipeline.companyId ? { company_id: pipeline.companyId } : {}),
        },
      }).catch(() => ({ data: [] })),
    ]);
    stages = (Array.isArray(stRes.data) ? stRes.data : []).filter((s) => s.is_active !== false);
    templates = Array.isArray(tplRes.data) ? tplRes.data : [];
  }

  stages = [...stages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  const byStage = {};
  const globalTemplates = [];
  templates.forEach((t) => {
    const sid = t[stageKey];
    if (sid) (byStage[sid] = byStage[sid] || []).push(t);
    else globalTemplates.push(t);
  });

  return { stages, byStage, globalTemplates };
}

/** Mô tả ngắn một điều kiện để hiển thị trên chip / danh sách. */
export function describeCondition(condition, lookup = {}) {
  const cfg = condition?.config || {};
  const source = cfg.source || 'crm';
  if (cfg.label) return cfg.label;

  if (condition?.condition_type === 'stage_flag') {
    return `Cột mang cờ "${stageFlagLabel(source, cfg.flag)}"`;
  }
  if (condition?.condition_type === 'stage_reached') {
    return `Đã tới cột ${lookup.stageName || 'đã chọn'}`;
  }
  const count = Array.isArray(cfg.item_ids) ? cfg.item_ids.length : 0;
  return count > 1
    ? `Hoàn tất ${count} nhiệm vụ bắt buộc`
    : `Hoàn tất nhiệm vụ ${lookup.itemName || 'đã chọn'}`;
}
