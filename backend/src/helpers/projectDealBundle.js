/**
 * Bundle dữ liệu deal theo project — CRM + SX + VC (NV, tài liệu).
 * Kèm overview Tổng quan: KPI + luồng + công việc trọng yếu.
 */
const { supabase } = require('../config/supabase');
const {
  leadDocVisibleForModuleAndUser,
} = require('./documentShareScope');

const DONE = new Set(['completed', 'done']);
const IN_PROGRESS = new Set(['in_progress', 'doing', 'active', 'processing']);

/** Khớp frontend `workshopTaskScope` / tab Công việc ProductionDetail. */
const SX_STAGE_SLUGS = new Set([
  'planning',
  'quality-check',
  'packaging',
  'production',
  'delivery',
  'customer-care',
]);
const VC_STAGE_SLUGS = new Set([
  'delivery',
  'shipping',
  'installation',
  'installing',
  'customer-care',
]);
const VC_EXCLUSIVE_SLUGS = new Set(['shipping', 'installation', 'installing']);

function isSxProjectTask(t) {
  const meta = t?.metadata && typeof t.metadata === 'object' ? t.metadata : {};
  const area = String(meta.workshop_area || '').toLowerCase();
  const mod = String(meta.workshop_module || '').toLowerCase();
  if (area === 'logistics' || area.includes('vc_') || mod === 'logistics') return false;
  if (area === 'production' || area.includes('sx_') || area.includes('production') || mod === 'production') {
    return true;
  }
  const slug = String(meta.stage_slug || meta.guessed_stage_slug || t?.stage_slug || '').toLowerCase();
  if (VC_EXCLUSIVE_SLUGS.has(slug)) return false;
  if (meta.workshop_template_id) return SX_STAGE_SLUGS.has(slug);
  return SX_STAGE_SLUGS.has(slug);
}

function isVcProjectTask(t) {
  const meta = t?.metadata && typeof t.metadata === 'object' ? t.metadata : {};
  const area = String(meta.workshop_area || '').toLowerCase();
  const mod = String(meta.workshop_module || '').toLowerCase();
  if (area === 'production' || area.includes('sx_') || mod === 'production') return false;
  if (area === 'logistics' || area.includes('vc_') || area.includes('logistics') || mod === 'logistics') {
    return true;
  }
  const slug = String(meta.stage_slug || meta.guessed_stage_slug || t?.stage_slug || '').toLowerCase();
  if (VC_EXCLUSIVE_SLUGS.has(slug)) return true;
  return VC_STAGE_SLUGS.has(slug);
}

function isWorkflowProjectTask(t) {
  return !isSxProjectTask(t) && !isVcProjectTask(t);
}

function isSxTaskDoc(doc) {
  return !!doc?.project_id
    && !!doc?.source_crm_task_id
    && String(doc.crm_stage_slug || '').startsWith('sx_');
}

function countDone(list, doneVals = DONE) {
  return {
    total: list.length,
    done: list.filter((t) => doneVals.has(String(t.status))).length,
  };
}

function taskPct(t) {
  if (DONE.has(String(t.status))) return 100;
  if (t.progress != null && Number.isFinite(Number(t.progress))) {
    return Math.max(0, Math.min(100, Math.round(Number(t.progress))));
  }
  if (IN_PROGRESS.has(String(t.status))) return 50;
  return 0;
}

function textHas(hay, needles) {
  const s = String(hay || '').toLowerCase();
  return needles.some((n) => s.includes(n));
}

function mapCrmTask(t) {
  return {
    id: t.id,
    source: 'crm_task',
    title: t.title,
    status: t.status,
    deadline: t.deadline,
    priority: t.priority,
    stage_slug: t.stage_slug,
    assignee_id: t.assignee_id,
    assignee: t.assignee || null,
    assignee_name: t.assignee?.full_name || null,
    blocks_stage_advance: !!t.blocks_stage_advance,
  };
}

function mapProjectTask(t) {
  const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
  const stageSlug = meta.stage_slug || meta.guessed_stage_slug || null;
  return {
    id: t.id,
    source: 'task',
    title: t.title,
    status: t.status,
    deadline: t.due_date || t.deadline || null,
    priority: t.priority,
    assignee_id: t.assignee_id,
    assignee: t.assignee || null,
    assignee_name: t.assignee?.full_name || null,
    metadata: t.metadata,
    stage_slug: stageSlug,
    stage_name: meta.stage_name || null,
    blocks_stage_advance: !!(meta.blocks_stage_advance || t.blocks_stage_advance),
  };
}

function mapLeadDoc(d) {
  return {
    id: d.id,
    name: d.name || d.file_name,
    file_name: d.file_name,
    doc_type: d.doc_type,
    created_at: d.created_at,
    shared_to_workshop: d.shared_to_workshop,
    allowed_share_modules: d.allowed_share_modules,
    file_path: d.file_path,
    file_url: d.file_url,
    crm_stage_slug: d.crm_stage_slug,
    source_crm_task_id: d.source_crm_task_id,
  };
}

function mapFileAttachment(f) {
  return {
    id: f.id,
    name: f.file_name,
    file_name: f.file_name,
    file_path: f.file_url,
    file_url: f.file_url,
    created_at: f.created_at,
    entity_type: f.entity_type,
    entity_id: f.entity_id,
    kind: 'file_attachment',
  };
}

function mapUnifiedTask(t) {
  return {
    id: t.source_id || t.unified_id,
    unified_id: t.unified_id,
    source: t.source,
    task_kind: t.task_kind,
    title: t.title,
    status: t.status,
    deadline: t.deadline,
    priority: t.priority,
    assignee_id: t.assignee_id,
  };
}

function classifyUnifiedTask(t) {
  const kind = String(t.task_kind || '');
  if (t.source === 'crm_task' || kind === 'CRM-Deal' || kind === 'CRM-Lead') return 'crm';
  if (kind === 'VC') return 'vc';
  // Chỉ NV gắn khu SX — không gộp mọi «Dự án» (CRM import / flow) vào SX
  if (kind === 'SX') return 'sx';
  if (t.source === 'crm_assignment' || kind === 'Giao việc') return 'crm';
  if (t.project_id || kind === 'Dự án') return 'workflow';
  return 'workflow';
}

function mergeTasksByKey(existing, incoming, keyFn) {
  const map = new Map();
  for (const t of existing || []) map.set(keyFn(t), t);
  for (const t of incoming || []) map.set(keyFn(t), t);
  return Array.from(map.values());
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a, b) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86400000);
}

function sectionTaskStats(section) {
  return section?.stats?.tasks || countDone(section?.tasks || []);
}

const STATUS_LABEL_FALLBACK = {
  consulting: 'Tư vấn',
  designing: 'Thiết kế',
  quoting: 'Báo giá',
  contract_signed: 'Đơn hàng',
  producing: 'Sản xuất',
  shipping: 'Giao hàng',
  installing: 'Lắp đặt',
  warranty: 'Bảo hành',
  completed: 'Nghiệm thu',
};

/** Map status legacy → slug giai đoạn Kanban Dự án */
const PROJECT_STATUS_TO_STAGE_SLUG = {
  consulting: 'order',
  designing: 'design',
  quoting: 'design',
  contract_signed: 'order',
  producing: 'production',
  shipping: 'delivery',
  installing: 'installation',
  completed: 'acceptance',
  warranty: 'warranty',
  on_hold: 'order',
  new: 'order',
};

const STAGE_SLUG_TO_MODULE = {
  order: 'crm',
  design: 'crm',
  approve: 'crm',
  measure: 'crm',
  production: 'production',
  materials: 'production',
  delivery: 'logistics',
  installation: 'logistics',
  acceptance: 'logistics',
  warranty: 'crm',
};

const DEFAULT_DELIVERY_STAGES = [
  { slug: 'order', name: 'Đơn hàng', order_index: 1 },
  { slug: 'design', name: 'Thiết kế', order_index: 2 },
  { slug: 'approve', name: 'Duyệt', order_index: 3 },
  { slug: 'measure', name: 'Đo đạc', order_index: 4 },
  { slug: 'production', name: 'Sản xuất', order_index: 5 },
  { slug: 'materials', name: 'Chuẩn bị vật tư', order_index: 6 },
  { slug: 'delivery', name: 'Giao hàng', order_index: 7 },
  { slug: 'installation', name: 'Lắp đặt', order_index: 8 },
  { slug: 'acceptance', name: 'Nghiệm thu', order_index: 9 },
  { slug: 'warranty', name: 'Bảo hành', order_index: 10 },
];

function isProjectDeliveryStageRow(s) {
  if (!s || s.is_active === false) return false;
  if (s.company_id) return false;
  const slug = String(s.slug || '');
  if (slug.startsWith('sx-sample-')) return false;
  return true;
}

function resolveDeliveryCurrentIndex(project, stages) {
  if (!stages.length) return 0;
  if (project?.current_stage_id) {
    const byId = stages.findIndex((st) => String(st.id) === String(project.current_stage_id));
    if (byId >= 0) return byId;
  }
  const curSlug = project?.current_stage?.slug;
  if (curSlug) {
    const bySlug = stages.findIndex((st) => st.slug === curSlug);
    if (bySlug >= 0) return bySlug;
  }
  const mapped = PROJECT_STATUS_TO_STAGE_SLUG[String(project?.status || '').toLowerCase()] || 'order';
  const byMapped = stages.findIndex((st) => st.slug === mapped);
  return byMapped >= 0 ? byMapped : 0;
}

function buildDeliveryFlow({
  project,
  deliveryStages,
  crmHref,
  sxHref,
  vcHref,
  projectHref,
  pipelines,
}) {
  const stages = (deliveryStages || []).length
    ? [...deliveryStages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    : DEFAULT_DELIVERY_STAGES;

  const currentIdx = resolveDeliveryCurrentIndex(project, stages);
  const sxStage = pipelines?.sx || null;
  const vcStage = pipelines?.vc || null;
  const crmStage = pipelines?.crm || null;

  return stages.map((st, i) => {
    let status = 'pending';
    if (i < currentIdx) status = 'done';
    else if (i === currentIdx) status = 'current';

    const module = STAGE_SLUG_TO_MODULE[st.slug] || 'workflow';
    const href = module === 'crm' ? crmHref
      : module === 'production' ? sxHref
        : module === 'logistics' ? vcHref
          : projectHref;

    let stage_name = null;
    if (status === 'current') {
      if (module === 'production' && sxStage?.name) stage_name = sxStage.name;
      else if (module === 'logistics' && vcStage?.name) stage_name = vcStage.name;
      else if (module === 'crm' && crmStage?.name) stage_name = crmStage.name;
      else stage_name = st.name;
    }

    return {
      key: st.slug || ('stage-' + i),
      label: st.name,
      status,
      module,
      href: href || projectHref,
      stage_name,
      color: st.color || null,
    };
  });
}

/**
 * Build overview KPI + flow + critical tasks từ bundle parts.
 * Luồng = workflow_stages (Kanban Dự án), tiến độ theo current_stage_id / status.
 */
function buildProjectOverview({
  project,
  primaryLead,
  pipelines,
  sections,
  userNamesById = {},
  deliveryStages = [],
}) {
  const leadId = primaryLead?.id || null;
  const projectId = project?.id || null;
  const crmHref = leadId ? ('/crm/leads/' + leadId) : null;
  const sxHref = projectId ? ('/sx/projects/' + projectId) : null;
  const vcHref = projectId ? ('/vc/projects/' + projectId) : null;
  const projectHref = projectId ? ('/projects/' + projectId + '?tab=overview') : null;

  const crmStats = sectionTaskStats(sections.crm);
  const sxStats = sectionTaskStats(sections.sx);
  const vcStats = sectionTaskStats(sections.vc);
  const wfStats = sectionTaskStats(sections.workflow);

  const sxStage = pipelines?.sx || null;
  const vcStage = pipelines?.vc || null;
  const crmStage = pipelines?.crm || primaryLead?.stage || null;

  const flow = buildDeliveryFlow({
    project,
    deliveryStages,
    crmHref,
    sxHref,
    vcHref,
    projectHref,
    pipelines: { crm: crmStage, sx: sxStage, vc: vcStage },
  });

  const doneSteps = flow.filter((st) => st.status === 'done').length;
  const currentBoost = flow.some((st) => st.status === 'current') ? 0.35 : 0;
  const flowPct = flow.length
    ? Math.round(((doneSteps + currentBoost) / flow.length) * 100)
    : 0;

  const allTaskStats = [crmStats, sxStats, vcStats, wfStats].filter((st) => st.total > 0);
  const taskDone = allTaskStats.reduce((a, st) => a + st.done, 0);
  const taskTotal = allTaskStats.reduce((a, st) => a + st.total, 0);
  const taskPctVal = taskTotal ? Math.round((taskDone / taskTotal) * 100) : null;
  const progress_pct = taskPctVal != null
    ? Math.round(flowPct * 0.55 + taskPctVal * 0.45)
    : flowPct;

  const commitmentRaw = project?.install_date || project?.delivery_date
    || project?.production_deadline || project?.deadline || null;
  const commitment_date = commitmentRaw ? String(commitmentRaw).slice(0, 10) : null;
  const today = new Date();
  let days_remaining = null;
  let delay_days = 0;
  let forecast = 'unknown';
  if (commitment_date) {
    days_remaining = daysBetween(today, commitment_date);
    if (days_remaining < 0) {
      forecast = 'late';
      delay_days = Math.abs(days_remaining);
    } else if (days_remaining <= 3) {
      forecast = 'at_risk';
      delay_days = Math.max(0, 2);
    } else {
      forecast = 'on_track';
    }
  }

  const budgetTotal = Number(
    project?.production_value
    ?? project?.estimated_value
    ?? primaryLead?.estimated_value
    ?? 0,
  ) || 0;
  const budgetSpent = Number(project?.collected_amount ?? project?.deposit_amount ?? 0) || 0;
  const budget = {
    total: budgetTotal || null,
    spent: budgetSpent || null,
    pct: budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 1000) / 10 : null,
  };

  const currentFlow = flow.find((st) => st.status === 'current');
  const status_label = project?.current_stage?.name
    || currentFlow?.label
    || sxStage?.name
    || vcStage?.name
    || crmStage?.name
    || (STATUS_LABEL_FALLBACK[project?.status] || project?.status || 'Đang triển khai');

  const owners = {
    crm: primaryLead?.assignee || primaryLead?.lead_owner || null,
    sx: project?.production_person || null,
    vc: project?.logistics_person || project?.installation_person || null,
  };

  const tagged = [];
  const pushTasks = (list, module, hrefBase) => {
    for (const t of list || []) {
      tagged.push({
        ...t,
        deadline: t.deadline || t.due_date || null,
        module,
        href: hrefBase
          ? (module === 'crm' ? (hrefBase + '?tab=tasks') : hrefBase)
          : null,
      });
    }
  };
  pushTasks(sections.crm?.tasks, 'crm', crmHref);
  pushTasks(sections.sx?.tasks, 'production', sxHref);
  pushTasks(sections.vc?.tasks, 'logistics', vcHref);
  pushTasks(sections.workflow?.tasks, 'workflow', projectId ? ('/projects/' + projectId + '?tab=aggregate') : null);

  const now = Date.now();
  const week = 7 * 86400000;
  const TASK_STATUS_VI = {
    pending: 'Chờ',
    todo: 'Chờ',
    in_progress: 'Đang làm',
    doing: 'Đang làm',
    active: 'Đang làm',
    processing: 'Đang làm',
    review: 'Chờ kiểm tra',
    done: 'Hoàn tất',
    completed: 'Hoàn tất',
    blocked: 'Bị chặn',
    deferred: 'Tạm hoãn',
  };

  const openTagged = tagged.filter((t) => !DONE.has(String(t.status)));
  const scored = openTagged
    .map((t) => {
      let score = 0;
      if (t.blocks_stage_advance) score += 100;
      const dl = t.deadline ? new Date(t.deadline).getTime() : null;
      if (dl != null && !Number.isNaN(dl)) {
        if (dl < now) score += 80;
        else if (dl - now < week) score += 40;
      }
      if (IN_PROGRESS.has(String(t.status))) score += 25;
      if (String(t.priority) === 'high' || String(t.priority) === 'urgent') score += 20;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score || String(a.t.deadline || '').localeCompare(String(b.t.deadline || '')))
    .slice(0, 8);

  const moduleLabel = { crm: 'CRM', production: 'Sản xuất', logistics: 'Lắp đặt / VC', workflow: 'Dự án' };
  const critical_tasks = scored.map(({ t }) => {
    const pct = taskPct(t);
    const dlMs = t.deadline ? new Date(t.deadline).getTime() : null;
    const overdue = dlMs != null && !Number.isNaN(dlMs) && dlMs < now;
    let ui_state = 'pending';
    if (DONE.has(String(t.status))) ui_state = 'done';
    else if (overdue || t.blocks_stage_advance) ui_state = 'warning';
    else if (IN_PROGRESS.has(String(t.status)) || (pct > 0 && pct < 100)) ui_state = 'active';

    const note = t.blocks_stage_advance
      ? 'Chặn chuyển giai đoạn'
      : (overdue ? 'Quá hạn' : null);

    let status_label = TASK_STATUS_VI[String(t.status)] || t.status || 'Chờ';
    if (ui_state === 'warning' && overdue) status_label = 'Quá hạn';
    else if (ui_state === 'warning' && t.blocks_stage_advance) status_label = 'Rủi ro';
    else if (pct > 0 && pct < 100) status_label = `${pct}%`;

    const assignee_name = t.assignee_id ? (userNamesById[String(t.assignee_id)] || null) : null;
    const owner_line = [
      moduleLabel[t.module] || t.module,
      assignee_name || (note && ui_state === 'warning' ? note : null) || 'Chưa gán',
    ].filter(Boolean).join(' · ');

    return {
      id: t.id,
      title: t.title,
      module: t.module,
      module_label: moduleLabel[t.module] || t.module,
      status: t.status,
      status_label,
      ui_state,
      pct: pct > 0 && pct < 100 ? pct : (IN_PROGRESS.has(String(t.status)) ? 50 : null),
      deadline: t.deadline || null,
      assignee_id: t.assignee_id || null,
      assignee_name,
      owner_line,
      href: t.href,
      note,
      ref_code: null,
    };
  });

  const critical_summary = {
    total: critical_tasks.length,
    warning: critical_tasks.filter((t) => t.ui_state === 'warning').length,
    on_track: Math.max(0, critical_tasks.filter((t) => t.ui_state !== 'warning').length),
  };

  return {
    progress_pct,
    commitment_date,
    days_remaining,
    forecast,
    delay_days,
    budget,
    status_label,
    flow,
    critical_tasks,
    critical_summary,
    primary_lead: primaryLead
      ? { id: primaryLead.id, code: primaryLead.code, title: primaryLead.title }
      : null,
    owners: {
      crm: owners.crm ? { id: owners.crm.id, full_name: owners.crm.full_name } : null,
      sx: owners.sx ? { id: owners.sx.id, full_name: owners.sx.full_name } : null,
      vc: owners.vc ? { id: owners.vc.id, full_name: owners.vc.full_name } : null,
    },
  };
}

/**
 * @param {string} projectId
 * @param {object} [opts]
 * @param {object} [opts.user] — req.user cho lọc tài liệu chia sẻ
 */
async function buildProjectDealBundle(projectId, opts = {}) {
  const user = opts.user || null;

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select(`
      id, code, name, status, deadline, estimated_value, production_value, deposit_amount, collected_amount,
      company_id, logistics_company_id, customer_id, sx_kanban_column_id, vc_kanban_column_id, current_stage_id,
      install_date, delivery_date, production_deadline,
      production_person_id, logistics_person_id, installation_person_id,
      current_stage:workflow_stages(id, name, slug, color, order_index),
      production_person:users!projects_production_person_id_fkey(id, full_name),
      logistics_person:users!projects_logistics_person_id_fkey(id, full_name),
      installation_person:users!projects_installation_person_id_fkey(id, full_name)
    `)
    .eq('id', projectId)
    .maybeSingle();

  if (projectErr) {
    // Fallback nếu FK person chưa có trên môi trường
    const { data: projectBasic } = await supabase
      .from('projects')
      .select(`
        id, code, name, status, deadline, estimated_value, production_value, deposit_amount, collected_amount,
        company_id, logistics_company_id, customer_id, sx_kanban_column_id, vc_kanban_column_id, current_stage_id,
        install_date, delivery_date, production_deadline,
        production_person_id, logistics_person_id, installation_person_id,
        current_stage:workflow_stages(id, name, slug, color, order_index)
      `)
      .eq('id', projectId)
      .maybeSingle();
    if (!projectBasic) return null;
    return buildProjectDealBundleWithProject(projectBasic, user);
  }

  if (!project) return null;
  return buildProjectDealBundleWithProject(project, user);
}

const LEAD_BUNDLE_SELECT = `
  id, code, title, type, estimated_value, company_id, project_id, customer_id,
  assigned_to, lead_owner_id, stage_id, description,
  stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, order_index),
  customer:customers(id, full_name, phone, source),
  source:crm_sources(id, name),
  assignee:users!crm_leads_assigned_to_fkey(id, full_name),
  lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name)
`;

/** Chọn deal gần nhất với dự án khi chỉ khớp customer (thiếu project_id). */
function pickBestLeadForProject(project, candidates) {
  const list = (candidates || []).filter(Boolean);
  if (!list.length) return [];
  if (list.length === 1) return list;

  const projVal = Number(project?.estimated_value ?? project?.production_value ?? 0) || 0;
  const projName = String(project?.name || '').toLowerCase();
  const scored = list.map((l) => {
    let score = 0;
    const leadVal = Number(l.estimated_value || 0) || 0;
    if (projVal > 0 && leadVal > 0) {
      const diff = Math.abs(projVal - leadVal) / Math.max(projVal, leadVal);
      if (diff <= 0.02) score += 50;
      else if (diff <= 0.1) score += 30;
      else if (diff <= 0.25) score += 10;
    }
    const leadTitle = String(l.title || '').toLowerCase();
    if (projName && leadTitle) {
      const tokens = projName.split(/[\s,/\-]+/).filter((t) => t.length >= 3).slice(0, 6);
      const hit = tokens.filter((t) => leadTitle.includes(t)).length;
      score += hit * 8;
    }
    // Ưu tiên deal chưa gắn project khác, hoặc gắn project cùng khách
    if (!l.project_id) score += 15;
    if (String(l.project_id || '') === String(project?.id || '')) score += 100;
    if (String(l.type || '') === 'deal') score += 5;
    return { l, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score <= 0) {
    // Một khách một deal → dùng luôn
    const deals = list.filter((l) => String(l.type || '') === 'deal');
    return deals.length === 1 ? deals : [list[0]];
  }
  return [best.l];
}

async function buildProjectDealBundleWithProject(project, user) {
  const projectId = project.id;

  const { data: leadsByProject } = await supabase
    .from('crm_leads')
    .select(LEAD_BUNDLE_SELECT)
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  let leads = leadsByProject || [];
  let leadLinkKind = leads.length ? 'project' : null;
  if (!leads.length) {
    const { data: links } = await supabase
      .from('crm_deal_projects')
      .select('deal_id')
      .eq('project_id', projectId);
    const dealIds = [...new Set((links || []).map((r) => r.deal_id).filter(Boolean))];
    if (dealIds.length) {
      const { data: linkedLeads } = await supabase
        .from('crm_leads')
        .select(LEAD_BUNDLE_SELECT)
        .in('id', dealIds)
        .order('updated_at', { ascending: false });
      leads = linkedLeads || [];
      if (leads.length) leadLinkKind = 'deal_projects';
    }
  }

  // Fallback: orphan / multi-SX chưa ghi link → tìm deal theo khách
  let softLeads = [];
  if (!leads.length && project.customer_id) {
    const { data: byCustomer } = await supabase
      .from('crm_leads')
      .select(LEAD_BUNDLE_SELECT)
      .eq('customer_id', project.customer_id)
      .order('updated_at', { ascending: false })
      .limit(30);
    softLeads = pickBestLeadForProject(project, byCustomer || []);
    if (softLeads.length) {
      leadLinkKind = 'customer';
      // Ghi crm_deal_projects (secondary) để lịch/events & lần sau resolve được — không đổi project_id primary
      const softId = softLeads[0]?.id;
      if (softId) {
        const { error: linkErr } = await supabase.from('crm_deal_projects').upsert({
          deal_id: softId,
          project_id: projectId,
          is_primary: false,
          label: 'auto-link by customer',
        }, { onConflict: 'deal_id,project_id', ignoreDuplicates: true });
        if (!linkErr) {
          leads = softLeads;
          softLeads = [];
          leadLinkKind = 'deal_projects';
        }
      }
    }
  }

  const hardLeads = leads;
  const primaryLead = (hardLeads.find((l) => l.type === 'deal') || hardLeads[0]
    || softLeads.find((l) => l.type === 'deal') || softLeads[0]
    || null);
  const leadId = primaryLead?.id || null;
  // NV/tài liệu CRM chỉ khi deal neo đúng project này — secondary link chỉ hiện stage/owner CRM
  const leadIsPrimaryForProject = !!leadId
    && String(primaryLead?.project_id || '') === String(projectId);
  const loadCrmWork = leadLinkKind === 'project' || leadIsPrimaryForProject;
  const leadIds = loadCrmWork
    ? [leadId].filter(Boolean)
    : [];
  const crmLeadIdForWork = loadCrmWork ? leadId : null;

  const [
    crmTasksRes,
    projectTasksRes,
    docsRes,
    unifiedProjectRes,
    unifiedCrmRes,
    projectFilesRes,
  ] = await Promise.all([
    crmLeadIdForWork
      ? supabase.from('crm_tasks').select('id, title, status, stage_slug, deadline, assignee_id, priority, order_index, blocks_stage_advance, assignee:users!crm_tasks_assignee_id_fkey(id, full_name)')
        .eq('lead_id', crmLeadIdForWork).order('order_index')
      : Promise.resolve({ data: [] }),
    supabase.from('tasks').select('id, title, status, priority, due_date, assignee_id, task_type, metadata, order_index, assignee:users!tasks_assignee_id_fkey(id, full_name)')
      .eq('project_id', projectId).order('order_index'),
    crmLeadIdForWork
      ? supabase.from('lead_documents')
        .select('id, name, file_name, doc_type, created_at, shared_to_workshop, allowed_share_modules, file_path, file_url, crm_stage_slug, source_crm_task_id, project_id')
        .eq('lead_id', crmLeadIdForWork)
        .order('created_at', { ascending: false })
      : supabase.from('lead_documents')
        .select('id, name, file_name, doc_type, created_at, shared_to_workshop, allowed_share_modules, file_path, file_url, crm_stage_slug, source_crm_task_id, project_id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    supabase.from('unified_tasks_v')
      .select('unified_id, source, source_id, project_id, lead_id, title, status, priority, assignee_id, deadline, task_kind')
      .eq('project_id', projectId),
    leadIds.length
      ? supabase.from('unified_tasks_v')
        .select('unified_id, source, source_id, project_id, lead_id, title, status, priority, assignee_id, deadline, task_kind')
        .in('lead_id', leadIds)
      : Promise.resolve({ data: [] }),
    supabase.from('file_attachments')
      .select('id, file_name, file_url, mime_type, created_at, entity_type, entity_id, notes')
      .eq('entity_type', 'project')
      .eq('entity_id', projectId)
      .order('created_at', { ascending: false }),
  ]);

  // crm_tasks.blocks_stage_advance có thể chưa có — retry không cột đó
  let crmTasksRaw = crmTasksRes.data || [];
  if (crmTasksRes.error && crmLeadIdForWork) {
    const { data } = await supabase.from('crm_tasks')
      .select('id, title, status, stage_slug, deadline, assignee_id, priority, order_index, assignee:users!crm_tasks_assignee_id_fkey(id, full_name)')
      .eq('lead_id', crmLeadIdForWork).order('order_index');
    crmTasksRaw = data || [];
  }

  let sxStage = null;
  let vcStage = null;
  if (project.sx_kanban_column_id) {
    const { data } = await supabase
      .from('production_pipeline_stages')
      .select('id, name, color, icon, bucket_slug, is_handover_to_logistics')
      .eq('id', project.sx_kanban_column_id)
      .maybeSingle();
    sxStage = data;
  }
  if (project.vc_kanban_column_id) {
    const { data } = await supabase
      .from('logistics_pipeline_stages')
      .select('id, name, color, icon, bucket_slug')
      .eq('id', project.vc_kanban_column_id)
      .maybeSingle();
    vcStage = data;
    if (vcStage && vcStage.is_won == null) {
      // cột is_won có thể không có trên logistics
      vcStage = { ...vcStage, is_won: false };
    }
  }

  const crmTaskIds = crmTasksRaw.map((t) => t.id).filter(Boolean);
  const allProjectTasks = projectTasksRes.data || [];
  const projectTaskIds = allProjectTasks.map((t) => t.id).filter(Boolean);

  // Fallback cột Kanban: lấy stage từ metadata task VC/SX khi project chưa gắn cột
  if (!vcStage) {
    const vcStageId = allProjectTasks
      .map((t) => t.metadata?.logistics_pipeline_stage_id)
      .find(Boolean);
    if (vcStageId) {
      const { data } = await supabase
        .from('logistics_pipeline_stages')
        .select('id, name, color, icon, bucket_slug')
        .eq('id', vcStageId)
        .maybeSingle();
      if (data) vcStage = data;
    }
  }
  if (!sxStage) {
    const sxStageId = allProjectTasks
      .map((t) => t.metadata?.production_pipeline_stage_id || t.metadata?.sx_pipeline_stage_id)
      .find(Boolean);
    if (sxStageId) {
      const { data } = await supabase
        .from('production_pipeline_stages')
        .select('id, name, color, icon, bucket_slug, is_handover_to_logistics')
        .eq('id', sxStageId)
        .maybeSingle();
      if (data) sxStage = data;
    }
  }
  if (!sxStage && ['producing', 'shipping', 'installing', 'warranty', 'completed'].includes(String(project.status || ''))) {
    sxStage = {
      id: null,
      name: STATUS_LABEL_FALLBACK.producing || 'Sản xuất',
      color: '#ea580c',
      icon: null,
      inferred: true,
    };
  }
  if (!vcStage && ['shipping', 'installing', 'warranty', 'completed'].includes(String(project.status || ''))) {
    vcStage = {
      id: null,
      name: STATUS_LABEL_FALLBACK[project.status] || STATUS_LABEL_FALLBACK.shipping || 'Giao hàng',
      color: '#d97706',
      icon: null,
      inferred: true,
    };
  }

  let taskFiles = [];
  if (projectTaskIds.length) {
    const { data: tf } = await supabase
      .from('file_attachments')
      .select('id, file_name, file_url, mime_type, created_at, entity_type, entity_id, notes')
      .eq('entity_type', 'task')
      .in('entity_id', projectTaskIds);
    taskFiles = tf || [];
  }

  let crmAttachments = [];
  if (crmTaskIds.length) {
    const { data: att } = await supabase
      .from('crm_task_attachments')
      .select('id, file_name, name, file_path, file_url, mime_type, created_at, crm_task_id, shared_to_workshop, allowed_share_modules')
      .in('crm_task_id', crmTaskIds);
    crmAttachments = att || [];
  }

  const unifiedSeen = new Set();
  const unifiedAll = [...(unifiedProjectRes.data || []), ...(unifiedCrmRes.data || [])].filter((t) => {
    if (unifiedSeen.has(t.unified_id)) return false;
    unifiedSeen.add(t.unified_id);
    return true;
  });
  const unifiedBySection = { crm: [], sx: [], vc: [], workflow: [] };
  for (const ut of unifiedAll) {
    const bucket = classifyUnifiedTask(ut);
    unifiedBySection[bucket].push(mapUnifiedTask(ut));
  }

  const crmTasks = mergeTasksByKey(
    crmTasksRaw.map(mapCrmTask),
    unifiedBySection.crm,
    (t) => `${t.source || 'crm_task'}-${t.id}`,
  );
  const sxTasks = mergeTasksByKey(
    allProjectTasks.filter(isSxProjectTask).map(mapProjectTask),
    unifiedBySection.sx,
    (t) => `${t.source || 'task'}-${t.id}`,
  ).filter((t) => {
    // Unified có thể thiếu metadata — chỉ giữ nếu task gốc là SX xưởng
    const raw = allProjectTasks.find((x) => String(x.id) === String(t.id));
    return raw ? isSxProjectTask(raw) : String(t.task_kind || '') === 'SX';
  });
  const vcTasks = mergeTasksByKey(
    allProjectTasks.filter(isVcProjectTask).map(mapProjectTask),
    unifiedBySection.vc,
    (t) => `${t.source || 'task'}-${t.id}`,
  ).filter((t) => {
    const raw = allProjectTasks.find((x) => String(x.id) === String(t.id));
    return raw ? isVcProjectTask(raw) : String(t.task_kind || '') === 'VC';
  });
  const workshopTaskIds = new Set([
    ...sxTasks.map((t) => String(t.id)),
    ...vcTasks.map((t) => String(t.id)),
  ]);
  const workflowTasks = mergeTasksByKey(
    allProjectTasks.filter(isWorkflowProjectTask).map(mapProjectTask),
    unifiedBySection.workflow,
    (t) => `${t.source || 'task'}-${t.id}`,
  ).filter((t) => !workshopTaskIds.has(String(t.id)));

  const allLeadDocs = (docsRes.data || []).map(mapLeadDoc);
  const leadCompanyId = primaryLead?.company_id || null;
  const visOpts = { leadCompanyId };
  const crmDocuments = allLeadDocs.map((d) => ({ ...d, bucket: 'crm' }));

  const sxDocuments = allLeadDocs.filter((d) => {
    if (isSxTaskDoc(d)) return true;
    if (!user) return d.shared_to_workshop && (!d.allowed_share_modules || String(d.allowed_share_modules).includes('production'));
    return leadDocVisibleForModuleAndUser(d, 'production', user, visOpts);
  }).map((d) => ({ ...d, bucket: 'sx' }));

  const vcDocuments = allLeadDocs.filter((d) => {
    if (!user) {
      return !isSxTaskDoc(d)
        && !String(d.crm_stage_slug || '').startsWith('sx_');
    }
    return leadDocVisibleForModuleAndUser(d, 'logistics', user, visOpts);
  }).map((d) => ({ ...d, bucket: 'vc' }));

  const crmTaskAttachments = crmAttachments.map((a) => ({
    id: a.id,
    name: a.name || a.file_name,
    file_name: a.file_name,
    file_path: a.file_path,
    file_url: a.file_url,
    created_at: a.created_at,
    bucket: 'crm',
    kind: 'crm_task_attachment',
    crm_task_id: a.crm_task_id,
  }));

  const projectNativeFiles = (projectFilesRes.data || []).map((f) => ({
    ...mapFileAttachment(f),
    bucket: 'workflow',
  }));
  const taskNativeFiles = taskFiles.map((f) => ({
    ...mapFileAttachment(f),
    bucket: isSxProjectTask(allProjectTasks.find((t) => String(t.id) === String(f.entity_id)) || {})
      ? 'sx'
      : isVcProjectTask(allProjectTasks.find((t) => String(t.id) === String(f.entity_id)) || {})
        ? 'vc'
        : 'workflow',
  }));

  const crmAllDocuments = [...crmDocuments, ...crmTaskAttachments];
  const workflowDocuments = [...projectNativeFiles, ...taskNativeFiles.filter((d) => d.bucket === 'workflow')];
  const sxNativeDocs = taskNativeFiles.filter((d) => d.bucket === 'sx');
  const sxAllDocuments = [...sxDocuments, ...sxNativeDocs];
  const vcNativeDocs = taskNativeFiles.filter((d) => d.bucket === 'vc');
  const vcAllDocuments = [...vcDocuments, ...vcNativeDocs];

  const uniqueDocIds = new Set();
  [...crmAllDocuments, ...sxAllDocuments, ...vcAllDocuments, ...workflowDocuments].forEach((d) => {
    if (d?.id) uniqueDocIds.add(String(d.id));
  });

  const sections = {
    crm: {
      label: 'CRM (Bán hàng)',
      emoji: '💼',
      color: '#059669',
      tasks: crmTasks,
      documents: crmAllDocuments,
      stats: {
        tasks: countDone(crmTasks),
        documents: { total: crmAllDocuments.length },
      },
    },
    sx: {
      label: 'Sản xuất',
      emoji: '🏭',
      color: '#ea580c',
      tasks: sxTasks,
      documents: sxAllDocuments,
      stats: {
        tasks: countDone(sxTasks),
        documents: { total: sxAllDocuments.length },
      },
    },
    vc: {
      label: 'Lắp đặt',
      emoji: '🔧',
      color: '#d97706',
      tasks: vcTasks,
      documents: vcAllDocuments,
      stats: {
        tasks: countDone(vcTasks),
        documents: { total: vcAllDocuments.length },
      },
    },
    workflow: {
      label: 'Quy trình dự án',
      emoji: '📋',
      color: '#2563eb',
      tasks: workflowTasks,
      documents: workflowDocuments,
      stats: {
        tasks: countDone(workflowTasks),
        documents: { total: workflowDocuments.length },
      },
    },
  };

  const status = String(project.status || '');
  const sxDoneByStatus = ['shipping', 'installing', 'warranty', 'completed'].includes(status);
  const vcDoneByStatus = ['installing', 'warranty', 'completed'].includes(status);
  const vcStartedByStatus = ['shipping', 'installing', 'warranty', 'completed'].includes(status);

  const pipelines = {
    crm: primaryLead?.stage
      ? {
        ...primaryLead.stage,
        tasks_done: sections.crm.stats.tasks.done,
        tasks_total: sections.crm.stats.tasks.total,
        pct: sections.crm.stats.tasks.total
          ? Math.round((sections.crm.stats.tasks.done / sections.crm.stats.tasks.total) * 100)
          : (primaryLead.stage?.is_won ? 100 : 0),
      }
      : {
        id: null,
        name: primaryLead ? 'Chưa có giai đoạn CRM' : 'Chưa gắn Deal',
        color: '#94a3b8',
        icon: null,
        tasks_done: sections.crm.stats.tasks.done,
        tasks_total: sections.crm.stats.tasks.total,
        pct: sections.crm.stats.tasks.total
          ? Math.round((sections.crm.stats.tasks.done / sections.crm.stats.tasks.total) * 100)
          : 0,
        empty: !primaryLead,
      },
    sx: sxStage
      ? {
        ...sxStage,
        tasks_done: sections.sx.stats.tasks.done,
        tasks_total: sections.sx.stats.tasks.total,
        pct: sections.sx.stats.tasks.total
          ? Math.round((sections.sx.stats.tasks.done / sections.sx.stats.tasks.total) * 100)
          : (sxDoneByStatus ? 100 : 0),
      }
      : {
        id: null,
        name: sxDoneByStatus ? (STATUS_LABEL_FALLBACK.producing || 'Sản xuất') : 'Chưa có cột SX',
        color: sxDoneByStatus ? '#ea580c' : '#94a3b8',
        tasks_done: sections.sx.stats.tasks.done,
        tasks_total: sections.sx.stats.tasks.total,
        pct: sections.sx.stats.tasks.total
          ? Math.round((sections.sx.stats.tasks.done / sections.sx.stats.tasks.total) * 100)
          : (sxDoneByStatus ? 100 : 0),
        empty: !sxDoneByStatus,
      },
    vc: vcStage
      ? {
        ...vcStage,
        tasks_done: sections.vc.stats.tasks.done,
        tasks_total: sections.vc.stats.tasks.total,
        pct: sections.vc.stats.tasks.total
          ? Math.round((sections.vc.stats.tasks.done / sections.vc.stats.tasks.total) * 100)
          : (vcDoneByStatus ? 100 : (vcStartedByStatus ? 15 : 0)),
      }
      : {
        id: null,
        name: vcStartedByStatus
          ? (STATUS_LABEL_FALLBACK[status] || STATUS_LABEL_FALLBACK.shipping || 'Giao hàng')
          : 'Chưa có cột VC',
        color: vcStartedByStatus ? '#d97706' : '#94a3b8',
        tasks_done: sections.vc.stats.tasks.done,
        tasks_total: sections.vc.stats.tasks.total,
        pct: sections.vc.stats.tasks.total
          ? Math.round((sections.vc.stats.tasks.done / sections.vc.stats.tasks.total) * 100)
          : (vcDoneByStatus ? 100 : 0),
        empty: !vcStartedByStatus,
      },
  };

  const assigneeIds = new Set();
  for (const sec of Object.values(sections)) {
    for (const t of sec.tasks || []) {
      if (t.assignee_id) assigneeIds.add(String(t.assignee_id));
    }
  }
  const userNamesById = {};
  if (assigneeIds.size) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', [...assigneeIds]);
    for (const u of users || []) userNamesById[String(u.id)] = u.full_name;
  }

  // Gắn tên người phụ trách vào từng NV section (đồng bộ tab Công việc)
  for (const sec of Object.values(sections)) {
    sec.tasks = (sec.tasks || []).map((t) => {
      const name = t.assignee_name
        || t.assignee?.full_name
        || (t.assignee_id ? userNamesById[String(t.assignee_id)] : null)
        || null;
      return {
        ...t,
        assignee_name: name,
        assignee: t.assignee || (name ? { id: t.assignee_id, full_name: name } : null),
      };
    });
  }

  const { data: stageRows } = await supabase
    .from('workflow_stages')
    .select('id, name, slug, color, order_index, is_active, company_id')
    .is('company_id', null)
    .eq('is_active', true)
    .order('order_index');
  const deliveryStages = (stageRows || []).filter(isProjectDeliveryStageRow);

  // Nhãn giai đoạn CRM theo stage_slug
  const crmSlugs = [...new Set(
    (sections.crm?.tasks || []).map((t) => t.stage_slug).filter(Boolean),
  )];
  if (crmSlugs.length && primaryLead?.company_id) {
    const { data: crmStages } = await supabase
      .from('crm_pipeline_stages')
      .select('slug, name, color')
      .in('slug', crmSlugs);
    const bySlug = {};
    for (const st of crmStages || []) bySlug[st.slug] = st;
    sections.crm.tasks = (sections.crm.tasks || []).map((t) => ({
      ...t,
      stage_name: t.stage_name || bySlug[t.stage_slug]?.name || null,
      stage_color: bySlug[t.stage_slug]?.color || null,
    }));
  }

  const overview = buildProjectOverview({
    project,
    primaryLead,
    pipelines,
    sections,
    userNamesById,
    deliveryStages,
  });

  let inbox_links = { facebook: false, zalo: false };
  if (leadId && primaryLead) {
    try {
      const { resolveLeadInboxLinks } = require('./crmLeadInboxChannel');
      inbox_links = await resolveLeadInboxLinks(supabase, leadId, primaryLead);
    } catch (_) { /* optional */ }
  }

  return {
    project,
    leads: hardLeads.length ? hardLeads : (softLeads || []),
    primary_lead: primaryLead,
    lead_id: leadId,
    lead_link: leadLinkKind || null,
    inbox_links,
    pipelines,
    sections,
    totals: {
      tasks: crmTasks.length + sxTasks.length + vcTasks.length + workflowTasks.length,
      documents: uniqueDocIds.size,
      documents_crm: crmAllDocuments.length,
      documents_sx: sxAllDocuments.length,
      documents_vc: vcAllDocuments.length,
      documents_workflow: workflowDocuments.length,
    },
    overview,
  };
}

module.exports = {
  buildProjectDealBundle,
  buildProjectOverview,
  isSxProjectTask,
  isVcProjectTask,
  isProjectDeliveryStageRow,
  buildDeliveryFlow,
  resolveDeliveryCurrentIndex,
  PROJECT_STATUS_TO_STAGE_SLUG,
  DEFAULT_DELIVERY_STAGES,
};
