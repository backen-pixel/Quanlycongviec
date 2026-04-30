const { supabase } = require('../config/supabase');
const { normalizeWorkshopCompanyId } = require('./workshopCompanyScope');
const {
  buildPipelineStageSelect,
  isHandoverMissingError,
  isCrmTargetStageMissingError,
  isCrmTargetStageEmbedRelationshipError,
  isProductionCompanyIdMissingError,
  markHandoverColumnMissing,
  markCrmTargetStageColumnMissing,
  markCrmTargetStageJoinMissing,
  markProductionCompanyIdColumnMissing,
} = require('./productionPipelineSchema');

const WORKSHOP_STAGE_SLUGS = ['production', 'delivery', 'customer-care'];
/** Khớp enum project_status trong DB (không có 'delivering' — dùng shipping/installing). */
const WORKSHOP_STATUSES = ['producing', 'shipping', 'installing', 'warranty', 'completed'];
const INTAKE_BUCKET = 'won_pending';

async function getWorkshopStageMap() {
  const { data: stages = [] } = await supabase
    .from('workflow_stages')
    .select('id, slug, name, color, icon')
    .in('slug', WORKSHOP_STAGE_SLUGS)
    .order('order_index');

  const bySlug = {};
  stages.forEach((stage) => { bySlug[stage.slug] = stage; });
  return { stages, bySlug, ids: stages.map((stage) => stage.id).filter(Boolean) };
}

async function getWonDealProjectIds() {
  // Lấy deals đang ở stage "Thắng" (is_won=true)
  const { data: wonStages } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('is_won', true)
    .eq('is_active', true)
    .or('pipeline_type.eq.deal,pipeline_type.is.null');
  const wonStageIds = (wonStages || []).map((s) => s.id).filter(Boolean);

  // Lấy deals có project (đã thắng trước đây — actual_close_date IS NOT NULL)
  // OR đang ở stage is_won=true. Dùng union để không bỏ sót deals đã chuyển
  // sang cột "Sản xuất"/"Vận chuyển" nhưng project vẫn đang trong xưởng.
  const queries = [];
  if (wonStageIds.length) {
    queries.push(
      supabase
        .from('crm_leads')
        .select('project_id')
        .eq('type', 'deal')
        .not('project_id', 'is', null)
        .in('stage_id', wonStageIds),
    );
  }
  // Deals đã từng thắng (có actual_close_date) và được gắn project
  queries.push(
    supabase
      .from('crm_leads')
      .select('project_id')
      .eq('type', 'deal')
      .not('project_id', 'is', null)
      .not('actual_close_date', 'is', null),
  );

  const results = await Promise.all(queries);
  const out = new Set();
  for (const { data } of results) {
    for (const l of data || []) {
      if (l.project_id) out.add(l.project_id);
    }
  }
  return [...out];
}

function buildScopeOrFilter(stageIds, wonIds) {
  const parts = [];
  if (stageIds.length) parts.push(`current_stage_id.in.(${stageIds.join(',')})`);
  parts.push(`status.in.(${WORKSHOP_STATUSES.join(',')})`);
  if (wonIds.length) parts.push(`id.in.(${wonIds.join(',')})`);
  return parts.join(',');
}

async function loadProductionPipelineStagesRows(includeInactive = false, companyId = null, legacyUnscoped = false) {
  const cid = legacyUnscoped ? null : normalizeWorkshopCompanyId(companyId);

  const runBase = (scope) => {
    let q = supabase
      .from('production_pipeline_stages')
      .select(buildPipelineStageSelect())
      .order('order_index');
    if (!includeInactive) q = q.eq('is_active', true);
    if (!legacyUnscoped && cid && scope === 'scoped') q = q.eq('company_id', cid);
    if (!legacyUnscoped && scope === 'global') q = q.is('company_id', null);
    return q;
  };

  const runWithRetries = async (scope) => {
    let { data, error } = await runBase(scope);
    if (error && isProductionCompanyIdMissingError(error)) {
      markProductionCompanyIdColumnMissing();
      return loadProductionPipelineStagesRows(includeInactive, companyId, true);
    }
    if (error && isHandoverMissingError(error)) {
      markHandoverColumnMissing();
      const retry = await runBase(scope);
      data = retry.data;
      error = retry.error;
    }
    if (error && isCrmTargetStageEmbedRelationshipError(error)) {
      markCrmTargetStageJoinMissing();
      const retry = await runBase(scope);
      data = retry.data;
      error = retry.error;
    }
    if (error && isCrmTargetStageMissingError(error)) {
      markCrmTargetStageColumnMissing();
      const retry = await runBase(scope);
      data = retry.data;
      error = retry.error;
    }
    return { data, error };
  };

  let data;
  if (legacyUnscoped || !cid) {
    const r = await runWithRetries(legacyUnscoped ? 'all' : 'global');
    if (r.error) {
      console.warn('[workshopKanban] production_pipeline_stages:', r.error.message);
      return null;
    }
    data = r.data;
  } else {
    const scoped = await runWithRetries('scoped');
    if (scoped.error) {
      console.warn('[workshopKanban] production_pipeline_stages:', scoped.error.message);
      return null;
    }
    if ((scoped.data || []).length) {
      data = scoped.data;
    } else {
      const g = await runWithRetries('global');
      if (g.error) {
        console.warn('[workshopKanban] production_pipeline_stages:', g.error.message);
        return null;
      }
      data = g.data;
    }
  }

  return (data || []).map((row) => ({
    ...row,
    is_handover_to_logistics: row.is_handover_to_logistics ?? false,
  }));
}

async function getResolvedKanbanStages(companyId = null) {
  const rows = await loadProductionPipelineStagesRows(false, companyId);
  const { stages: ws, bySlug, ids: workshopIds } = await getWorkshopStageMap();

  if (!rows?.length) {
    const fallback = [
      {
        id: '__fb_intake__',
        name: 'Chờ vào xưởng (deal thắng)',
        color: '#64748b',
        icon: '⏳',
        order_index: 0,
        bucket_slug: INTAKE_BUCKET,
        workflow_stage_id: null,
        workflow_stage: null,
        is_active: true,
        _fallback: true,
      },
      ...ws.map((s, i) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        icon: s.icon,
        order_index: i + 1,
        bucket_slug: null,
        workflow_stage_id: s.id,
        workflow_stage: s,
        is_active: true,
        _fallback: true,
      })),
    ];
    return { stages: fallback, fromDb: false, workshopIds };
  }

  const active = rows.filter((r) => r.is_active).sort((a, b) => a.order_index - b.order_index);
  return { stages: active, fromDb: true, workshopIds };
}

function kanbanColumnIdForProject(project, sortedStages, wonIdSet) {
  const cid = project.current_stage_id;
  for (const col of sortedStages) {
    const wid = col.workflow_stage_id || col.workflow_stage?.id;
    if (wid && cid && String(wid) === String(cid)) return col.id;
  }
  const intake = sortedStages.find((s) => s.bucket_slug === INTAKE_BUCKET);
  if (wonIdSet.has(project.id)) {
    // Nếu chưa cấu hình cột "Chờ vào xưởng" thì fallback cột đầu tiên để không bị mất card mới.
    if (intake) return intake.id;
    return sortedStages?.[0]?.id || null;
  }
  return null;
}

function enrichOneSxProject(project, sortedStages, wonSet) {
  const handoverCol = sortedStages.find((s) => s.is_handover_to_logistics === true);
  const VC_STATUSES = new Set(['shipping', 'installing', 'warranty']);
  let colId = kanbanColumnIdForProject(project, sortedStages, wonSet);
  if (!colId && VC_STATUSES.has(project.status) && handoverCol) {
    colId = handoverCol.id;
  }
  const intakeCol = sortedStages.find((s) => s.bucket_slug === INTAKE_BUCKET);
  const inIntake = intakeCol && colId === intakeCol.id;
  return {
    ...project,
    sx_won_deal: wonSet.has(project.id),
    sx_kanban_column_id: colId,
    sx_intake: Boolean(inIntake),
  };
}

/**
 * Gắn sx_kanban_column_id theo pipeline đã cấu hình (theo công ty dự án, hoặc filterCompanyId khi dashboard lọc 1 công ty).
 */
async function enrichProjectsForSx(projects, wonIds, filterCompanyId = null) {
  const wonSet = new Set(wonIds);
  const f = normalizeWorkshopCompanyId(filterCompanyId);
  const keyFor = (p) => {
    if (f) return `__f:${f}`;
    const id = p.company_id || p.company?.id;
    return id ? String(id) : '__global__';
  };
  const keys = f ? [`__f:${f}`] : [...new Set((projects || []).map(keyFor))];
  const cache = new Map();
  for (const key of keys) {
    const cid = key.startsWith('__f:') ? key.slice(4) : (key === '__global__' ? null : key);
    const { stages } = await getResolvedKanbanStages(cid);
    const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
    cache.set(key, sorted);
  }
  return (projects || []).map((p) => enrichOneSxProject(p, cache.get(keyFor(p)), wonSet));
}

function buildPipelineSummary(sortedStages, enhancedProjects) {
  return sortedStages.map((col) => ({
    id: col.id,
    name: col.name,
    color: col.color,
    icon: col.icon,
    order_index: col.order_index,
    bucket_slug: col.bucket_slug || null,
    workflow_stage_id: col.workflow_stage_id || col.workflow_stage?.id || null,
    slug: col.workflow_stage?.slug || col.bucket_slug || null,
    is_handover_to_logistics: col.is_handover_to_logistics ?? false,
    count: enhancedProjects.filter((p) => p.sx_kanban_column_id === col.id).length,
    total_value: enhancedProjects
      .filter((p) => p.sx_kanban_column_id === col.id)
      .reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0),
  }));
}

/** UUID hàng production_pipeline_stages (cột chờ), hoặc null — theo phạm vi công ty */
async function getDbIntakeStageId(companyId = null) {
  const rows = await loadProductionPipelineStagesRows(false, companyId);
  const intake = (rows || []).find((r) => r.bucket_slug === INTAKE_BUCKET && r.is_active !== false);
  return intake?.id || null;
}

/**
 * Map id cột Kanban (có thể là __fb_intake__) → UUID lưu DB trên crm_leads.
 */
async function resolveSxPipelineStageUuidForProject(project) {
  let compId = project?.company_id;
  if (!compId && project?.id) {
    const { data: pr } = await supabase
      .from('projects')
      .select('company_id')
      .eq('id', project.id)
      .maybeSingle();
    compId = pr?.company_id;
  }
  const wonIds = await getWonDealProjectIds();
  const wonSet = new Set(wonIds);
  const { stages: kanbanStages } = await getResolvedKanbanStages(compId ? String(compId) : null);
  const sortedKanban = [...kanbanStages].sort((a, b) => a.order_index - b.order_index);
  const colId = kanbanColumnIdForProject(project, sortedKanban, wonSet);
  if (!colId) return null;
  const s = String(colId);
  if (s.startsWith('__fb_')) {
    return getDbIntakeStageId(compId ? String(compId) : null);
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s;
  }
  return null;
}

/**
 * Hàm generic: Tìm CRM deal pipeline stage theo sync_role.
 * Đây là nguồn sự thật duy nhất — KHÔNG tìm theo tên.
 * Mapping: sync_role trên crm_pipeline_stages do admin tự gán trong Settings → Pipeline.
 *
 * @param {string} role - giá trị sync_role ('sx_production', 'vc_delivery', 'vc_installation', 'vc_customer_care', ...)
 * @returns {Promise<string|null>} UUID hoặc null
 */
/** Fallback name patterns khi chưa cấu hình sync_role trong Pipeline Settings */
const ROLE_NAME_PATTERNS = {
  sx_production:  ['%sản xuất%', '%san xuat%', '%production%'],
  vc_delivery:    ['%vận chuyển%', '%van chuyen%', '%delivery%', '%giao hàng%'],
  vc_installation:['%lắp đặt%', '%lap dat%', '%install%'],
  vc_customer_care:['%chăm sóc%', '%bảo hành%', '%cskh%', '%customer%', '%bao hanh%'],
};

/** Tìm CRM stage ID theo sync_role. Nếu chưa cấu hình, fallback theo tên. */
async function getCrmStageByRole(role) {
  if (!role) return null;

  // ── Ưu tiên: tìm theo sync_role đã được admin cấu hình ──
  const { data: byRole } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name')
    .eq('pipeline_type', 'deal')
    .eq('is_active', true)
    .eq('sync_role', role)
    .limit(1)
    .maybeSingle();
  if (byRole?.id) return byRole.id;

  // ── Fallback: tìm theo pattern tên nếu chưa cấu hình ──
  const patterns = ROLE_NAME_PATTERNS[role];
  if (!patterns) return null;

  for (const pattern of patterns) {
    const { data: byName } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name')
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .ilike('name', pattern)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (byName?.id) {
      console.log(`[workshopKanban] getCrmStageByRole('${role}') fallback by name: "${byName.name}" (id=${byName.id}). Hãy cấu hình sync_role='${role}' trong Pipeline Settings để tránh fallback.`);
      return byName.id;
    }
  }
  return null;
}

/**
 * Mapping từ crm_sync_type (trên production/logistics stages) → sync_role (trên CRM stages).
 * Thêm vào đây nếu có loại mới, không cần sửa code logic.
 */
const CRM_SYNC_TYPE_TO_ROLE = {
  production: 'sx_production',      // Production stage → CRM "Sản xuất"
  delivery: 'vc_delivery',          // Logistics delivery → CRM "Vận chuyển"
  installation: 'vc_installation',  // Logistics installation → CRM "Lắp đặt"
  customer_care: 'vc_customer_care', // Logistics CSKH → CRM "Chăm sóc"
};

/**
 * Tìm CRM stage ID từ crm_sync_type của một production/logistics pipeline stage.
 * @param {string} crmSyncType - giá trị crm_sync_type ('production', 'delivery', 'installation', 'customer_care')
 */
async function getCrmStageIdBySyncType(crmSyncType) {
  const role = CRM_SYNC_TYPE_TO_ROLE[crmSyncType];
  return role ? getCrmStageByRole(role) : null;
}

/** @deprecated Dùng getCrmStageByRole('sx_production') thay thế */
async function getCrmSanXuatStageId() {
  return getCrmStageByRole('sx_production');
}

/** @deprecated Dùng getCrmStageByRole('vc_delivery') thay thế */
async function getCrmVcDeliveryStageId() {
  return getCrmStageByRole('vc_delivery');
}

/** @deprecated Dùng getCrmStageByRole('vc_installation') thay thế */
async function getCrmVcInstallationStageId() {
  return getCrmStageByRole('vc_installation');
}

/** @deprecated Dùng getCrmStageByRole('vc_customer_care') thay thế */
async function getCrmVcCustomerCareStageId() {
  return getCrmStageByRole('vc_customer_care');
}

/**
 * Khi project chuyển sang stage VC có crm_sync_type → cập nhật CRM deal
 * crm_sync_type: 'delivery' | 'installation' | 'customer_care'
 */
/**
 * Đồng bộ CRM deal stage_id khi project đạt một logistics pipeline stage có crm_sync_type.
 * Dùng CRM_SYNC_TYPE_TO_ROLE mapping để tìm CRM stage theo sync_role — không phụ thuộc tên cột.
 */
/**
 * Đồng bộ CRM deal stage_id khi project đạt logistics pipeline stage.
 * @param {string} projectId
 * @param {string|object} crmSyncTypeOrStageRow - string (legacy) hoặc full stage row có crm_target_stage_id
 */
async function syncCrmLeadFromLogisticsStage(projectId, crmSyncTypeOrStageRow) {
  let targetCrmStageId = null;

  if (typeof crmSyncTypeOrStageRow === 'object' && crmSyncTypeOrStageRow !== null) {
    // Ưu tiên: crm_target_stage_id đã được cấu hình trực tiếp
    if (crmSyncTypeOrStageRow.crm_target_stage_id) {
      targetCrmStageId = crmSyncTypeOrStageRow.crm_target_stage_id;
    } else if (crmSyncTypeOrStageRow.crm_sync_type) {
      targetCrmStageId = await getCrmStageIdBySyncType(crmSyncTypeOrStageRow.crm_sync_type);
    }
  } else if (typeof crmSyncTypeOrStageRow === 'string' && crmSyncTypeOrStageRow) {
    targetCrmStageId = await getCrmStageIdBySyncType(crmSyncTypeOrStageRow);
  }

  if (!targetCrmStageId) return;

  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('type', 'deal');

  for (const lead of leads || []) {
    await supabase.from('crm_leads').update({ stage_id: targetCrmStageId }).eq('id', lead.id);
  }
}

/**
 * Tìm ID stage "Thắng" trong CRM deal pipeline (is_won=true).
 */
async function getCrmThangStageId() {
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_type', 'deal')
    .eq('is_won', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

/**
 * Cập nhật crm_leads.sx_pipeline_stage_id cho mọi deal gắn project_id.
 * Đồng thời cập nhật stage_id CRM:
 *   - Project rời "Chờ vào xưởng" (có current_stage_id thực) → stage_id = "Sản xuất"
 *   - Project quay về intake (current_stage_id = null) → stage_id = "Thắng"
 */
async function syncCrmLeadSxPipelineFromProject(projectId) {
  const { data: project } = await supabase
    .from('projects')
    .select('id, current_stage_id, status, company_id')
    .eq('id', projectId)
    .single();
  if (!project) return;

  const [stageUuid, pipeRows] = await Promise.all([
    resolveSxPipelineStageUuidForProject(project),
    loadProductionPipelineStagesRows(true, project.company_id),
  ]);
  const prodPipeList = (pipeRows || [])
    .filter((r) => r.workflow_stage_id)
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const prodWorkflowStageIds = new Set(
    prodPipeList.map((r) => r.workflow_stage_id).filter(Boolean).map(String),
  );

  // Kiểm tra project có đang ở stage sản xuất thực không
  const isInRealProductionStage =
    !!project.current_stage_id &&
    prodWorkflowStageIds.has(String(project.current_stage_id));

  // Tìm cột hiện tại trong pipeline config
  const currentRow = prodPipeList.find(
    (r) => project.current_stage_id && String(r.workflow_stage_id) === String(project.current_stage_id),
  );

  // ── Ưu tiên: dùng crm_target_stage_id trực tiếp nếu đã cấu hình ──
  if (currentRow?.crm_target_stage_id) {
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, stage_id, sx_handover_at')
      .eq('project_id', projectId)
      .eq('type', 'deal');
    await Promise.all(
      (leads || []).map((lead) => {
        if (!lead.sx_handover_at) return Promise.resolve();
        return supabase.from('crm_leads').update({
          sx_pipeline_stage_id: stageUuid,
          stage_id: currentRow.crm_target_stage_id,
        }).eq('id', lead.id);
      }),
    );
    return;
  }

  // ── Fallback: dùng crm_sync_type='production' (hành vi cũ) ──
  const triggerRows = prodPipeList.filter((r) => r.crm_sync_type === 'production');
  let isInCrmProductionTriggerStage = isInRealProductionStage; // fallback hành vi cũ

  if (triggerRows.length > 0 && project.current_stage_id) {
    // Tìm order_index nhỏ nhất của các trigger rows
    const minTriggerOrder = Math.min(...triggerRows.map((r) => r.order_index ?? 999));
    if (currentRow) {
      isInCrmProductionTriggerStage = (currentRow.order_index ?? 999) >= minTriggerOrder;
    } else {
      isInCrmProductionTriggerStage = false;
    }
  }

  const [sanXuatStageId, thangStageId] = await Promise.all([
    getCrmSanXuatStageId(),
    getCrmThangStageId(),
  ]);

  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id, stage_id, sx_handover_at')
    .eq('project_id', projectId)
    .eq('type', 'deal');

  await Promise.all(
    (leads || []).map((lead) => {
      if (!lead.sx_handover_at) return Promise.resolve();

      const update = { sx_pipeline_stage_id: stageUuid };

      const isOnWonOrSx =
        (thangStageId && lead.stage_id === thangStageId) ||
        (sanXuatStageId && lead.stage_id === sanXuatStageId);

      if (isOnWonOrSx) {
        if (isInCrmProductionTriggerStage && sanXuatStageId) {
          update.stage_id = sanXuatStageId;
        } else if (!isInCrmProductionTriggerStage && thangStageId) {
          update.stage_id = thangStageId;
        }
      }

      return supabase.from('crm_leads').update(update).eq('id', lead.id);
    }),
  );
}

/**
 * Cập nhật vc_pipeline_stage_id trên mọi CRM deal gắn với project.
 * @param {string} projectId
 * @param {string|null} vcPipelineStageId — ID của logistics_pipeline_stages (null = xoá)
 */
async function syncVcPipelineStageToLead(projectId, vcPipelineStageId) {
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('type', 'deal');
  await Promise.all(
    (leads || []).map((lead) =>
      supabase
        .from('crm_leads')
        .update({ vc_pipeline_stage_id: vcPipelineStageId || null })
        .eq('id', lead.id),
    ),
  );
}

/**
 * Emit socket event `crm:badge_updated` cho các CRM deals gắn với project.
 * Frontend lắng nghe event này để cập nhật badge SX/VC realtime mà không cần F5.
 * @param {string} projectId
 * @param {object} io - Socket.IO server instance
 */
async function emitCrmBadgeUpdateForProject(projectId, io) {
  if (!io) return;
  try {
    // Thử với cả hai join trước
    const { data: leadsWithBoth, error: bothErr } = await supabase
      .from('crm_leads')
      .select(`
        id, project_id, stage_id,
        sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug),
        vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)
      `)
      .eq('project_id', projectId)
      .eq('type', 'deal');

    if (bothErr) {
      // Fallback: chỉ lấy SX (join VC chưa sẵn sàng)
      // KHÔNG emit vc_pipeline_stage để tránh xóa badge VC hiện tại trên frontend
      const { data: leadsWithSx } = await supabase
        .from('crm_leads')
        .select('id, project_id, stage_id, sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug)')
        .eq('project_id', projectId)
        .eq('type', 'deal');
      for (const lead of (leadsWithSx || [])) {
        const sx = Array.isArray(lead.sx_pipeline_stage) ? lead.sx_pipeline_stage[0] : lead.sx_pipeline_stage;
        io.emit('crm:badge_updated', {
          lead_id: String(lead.id),
          project_id: lead.project_id ? String(lead.project_id) : null,
          stage_id: lead.stage_id ? String(lead.stage_id) : null,
          sx_pipeline_stage: sx || null,
          // vc_pipeline_stage không có trong payload → frontend giữ nguyên
        });
      }
      return;
    }

    for (const lead of (leadsWithBoth || [])) {
      const sx = Array.isArray(lead.sx_pipeline_stage) ? lead.sx_pipeline_stage[0] : lead.sx_pipeline_stage;
      const vc = Array.isArray(lead.vc_pipeline_stage) ? lead.vc_pipeline_stage[0] : lead.vc_pipeline_stage;
      io.emit('crm:badge_updated', {
        lead_id: String(lead.id),
        project_id: lead.project_id ? String(lead.project_id) : null,
        stage_id: lead.stage_id ? String(lead.stage_id) : null,
        sx_pipeline_stage: sx || null,
        vc_pipeline_stage: vc || null,
      });
    }
  } catch (e) {
    console.warn('[workshopKanban] emitCrmBadgeUpdateForProject:', e.message);
  }
}

module.exports = {
  WORKSHOP_STAGE_SLUGS,
  WORKSHOP_STATUSES,
  INTAKE_BUCKET,
  getWorkshopStageMap,
  getWonDealProjectIds,
  buildScopeOrFilter,
  loadProductionPipelineStagesRows,
  getResolvedKanbanStages,
  kanbanColumnIdForProject,
  enrichProjectsForSx,
  buildPipelineSummary,
  emitCrmBadgeUpdateForProject,
  getDbIntakeStageId,
  resolveSxPipelineStageUuidForProject,
  syncCrmLeadSxPipelineFromProject,
  syncVcPipelineStageToLead,
  syncCrmLeadFromLogisticsStage,
  // Generic helpers (dùng sync_role — không phụ thuộc tên cột)
  getCrmStageByRole,
  getCrmStageIdBySyncType,
  CRM_SYNC_TYPE_TO_ROLE,
  // Deprecated wrappers (backward compat)
  getCrmSanXuatStageId,
  getCrmThangStageId,
  getCrmVcDeliveryStageId,
  getCrmVcInstallationStageId,
  getCrmVcCustomerCareStageId,
};
