const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase');

const AGENT_DEBUG_LOG_PATH = path.join(__dirname, '../../../debug-fb4228.log');
const { normalizeWorkshopCompanyId } = require('./workshopCompanyScope');
const {
  buildPipelineStageSelect,
  isHandoverMissingError,
  isCrmTargetStageMissingError,
  isCrmTargetStageEmbedRelationshipError,
  isProductionCompanyIdMissingError,
  isPipelineWorkshopTypeMissingError,
  isPipelineWorkshopTypeEmbedRelationshipError,
  markHandoverColumnMissing,
  markCrmTargetStageColumnMissing,
  markCrmTargetStageJoinMissing,
  markProductionCompanyIdColumnMissing,
  markPipelineWorkshopTypeColumnMissing,
  markPipelineWorkshopTypeJoinMissing,
  isPipelineKpiSlaMissingError,
  markPipelineKpiSlaColumnMissing,
} = require('./productionPipelineSchema');
const { isCrmPostWonManagedStage } = require('./crmDealStageGate');

/**
 * Race-guard cho auto-sync stage CRM theo project SX/VC.
 * Chỉ cho phép ghi đè `crm_leads.stage_id` khi cột hiện tại là cột do module
 * xưởng/VC quản lý (post-Thắng) hoặc đang ở Thắng. Nếu Sale đã chủ động kéo
 * deal về cột pre-Thắng (Đàm phán/Báo giá…) hay Thua, không được đè.
 * Trường hợp chưa load được stage object → cho phép ghi (giữ hành vi cũ).
 */
function shouldAutoOverwriteCrmStage(stage) {
  const s = Array.isArray(stage) ? stage[0] : stage;
  if (!s) return true;
  if (s.is_won) return true;
  if (s.is_lost) return false;
  return isCrmPostWonManagedStage(s);
}

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

  // Lấy deals có project:
  // - đang ở stage is_won=true
  // - hoặc đã từng thắng (actual_close_date IS NOT NULL)
  // - hoặc (fallback) chỉ cần có project_id (tránh mất deal khi stage đã đổi nhưng chưa set actual_close_date)
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

  // Fallback: chỉ cần có project_id (để intake không bị mất card ngay sau khi chuyển stage CRM)
  queries.push(
    supabase
      .from('crm_leads')
      .select('project_id')
      .eq('type', 'deal')
      .not('project_id', 'is', null),
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
    if (error && isPipelineWorkshopTypeMissingError(error)) {
      markPipelineWorkshopTypeColumnMissing();
      const retry = await runBase(scope);
      data = retry.data;
      error = retry.error;
    }
    if (error && isPipelineWorkshopTypeEmbedRelationshipError(error)) {
      markPipelineWorkshopTypeJoinMissing();
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
    if (error && isPipelineKpiSlaMissingError(error)) {
      markPipelineKpiSlaColumnMissing();
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

/**
 * @param {string|null} companyId
 * @param {object} [opts]
 * @param {string|null} [opts.workshopTypeId]  null = không filter, 'none' = chỉ cột Bộ chung,
 *                                              <uuid> = cột của loại đó + Bộ chung (fallback)
 */
async function getResolvedKanbanStages(companyId = null, opts = {}) {
  const rows = await loadProductionPipelineStagesRows(false, companyId);
  const { stages: ws, bySlug, ids: workshopIds } = await getWorkshopStageMap();

  /** Lọc rows theo workshop_type_id: cột intake luôn được giữ. */
  const filterByType = (list) => {
    if (!list?.length) return list;
    const wkt = opts?.workshopTypeId;
    if (!wkt) return list;
    if (String(wkt).toLowerCase() === 'none') {
      return list.filter((r) => r.bucket_slug === INTAKE_BUCKET || !r.workshop_type_id);
    }
    return list.filter((r) => (
      r.bucket_slug === INTAKE_BUCKET
      || !r.workshop_type_id
      || String(r.workshop_type_id) === String(wkt)
    ));
  };

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

  const filtered = filterByType(rows);
  const active = (filtered || rows).filter((r) => r.is_active).sort((a, b) => a.order_index - b.order_index);
  return { stages: active, fromDb: true, workshopIds };
}

function firstSxPipelineColumnId(sortedStages) {
  const sorted = [...(sortedStages || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  if (!sorted.length) return null;
  const intake = sorted.find((s) => s.bucket_slug === INTAKE_BUCKET);
  if (intake) return intake.id;
  return sorted[0].id;
}

/** sx_pipeline_stage_id + sx_handover_at theo project_id (deal CRM). */
async function loadDealSxPipelineMetaByProjectIds(projectIds) {
  const ids = [...new Set((projectIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await supabase
    .from('crm_leads')
    .select('project_id, sx_pipeline_stage_id, sx_handover_at')
    .in('project_id', ids)
    .eq('type', 'deal');
  const map = new Map();
  for (const row of data || []) {
    if (row.project_id) map.set(String(row.project_id), row);
  }
  return map;
}

function kanbanColumnIdForProject(project, sortedStages, wonIdSet, leadMeta = null) {
  const sorted = [...(sortedStages || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const stageIds = new Set(sorted.map((s) => String(s.id)));
  const leadCol = leadMeta?.sx_pipeline_stage_id;
  const leadColValid = leadCol && stageIds.has(String(leadCol)) ? leadCol : null;

  // Deal thắng mới vào xưởng (chưa có current_stage_id) → cột đầu; đã vào SX giữ cột deal.
  if (wonIdSet.has(project.id)) {
    const inWorkshop = Boolean(project.current_stage_id);
    if (!inWorkshop && !leadMeta?.sx_handover_at) {
      return firstSxPipelineColumnId(sorted);
    }
    if (leadColValid) return leadColValid;
    return firstSxPipelineColumnId(sorted);
  }

  if (leadColValid) return leadColValid;

  const cid = project.current_stage_id;
  const wfMatches = sorted.filter((col) => {
    const wid = col.workflow_stage_id || col.workflow_stage?.id;
    return wid && cid && String(wid) === String(cid);
  });
  if (wfMatches.length === 1) return wfMatches[0].id;
  return null;
}

function enrichOneSxProject(project, sortedStages, wonSet, leadMeta = null) {
  const handoverCol = sortedStages.find((s) => s.is_handover_to_logistics === true);
  const VC_STATUSES = new Set(['shipping', 'installing', 'warranty']);
  let colId = kanbanColumnIdForProject(project, sortedStages, wonSet, leadMeta);
  // Khi đã bàn giao sang VC (status shipping/installing/warranty), ưu tiên ghim ở cột "bàn giao VC"
  // (tránh bị rơi lại cột intake do wonSet).
  if (VC_STATUSES.has(project.status) && handoverCol) {
    colId = handoverCol.id;
  }
  const intakeCol = sortedStages.find((s) => s.bucket_slug === INTAKE_BUCKET);
  const inIntake = intakeCol && colId === intakeCol.id;
  const matchedCol = sortedStages.find((s) => String(s.id) === String(colId)) || null;
  return {
    ...project,
    sx_won_deal: wonSet.has(project.id),
    sx_kanban_column_id: colId,
    sx_intake: Boolean(inIntake),
    sx_pipeline_percent: matchedCol?.progress_percent ?? null,
    sx_pipeline_stage: matchedCol ? {
      id: matchedCol.id,
      name: matchedCol.name,
      color: matchedCol.color,
      icon: matchedCol.icon,
      sla_days: matchedCol.sla_days,
      default_probability: matchedCol.default_probability,
      counts_as_won_revenue: matchedCol.counts_as_won_revenue,
      counts_as_completed_revenue: matchedCol.counts_as_completed_revenue,
      counts_as_collected_revenue: matchedCol.counts_as_collected_revenue,
      requires_deadline: matchedCol.requires_deadline,
      bucket_slug: matchedCol.bucket_slug,
    } : null,
    sx_pipeline_stage_entered_at: project.sx_pipeline_stage_entered_at ?? null,
  };
}

/**
 * Gắn sx_kanban_column_id theo pipeline đã cấu hình (theo công ty dự án, hoặc filterCompanyId khi dashboard lọc 1 công ty).
 * @param {string|null} [workshopTypeId]  Khi dashboard filter 1 phân loại → dùng pipeline của phân loại đó.
 *                                         'none' = bộ chung; <uuid> = loại + bộ chung (fallback).
 */
async function enrichProjectsForSx(projects, wonIds, filterCompanyId = null, workshopTypeId = null) {
  const wonSet = new Set(wonIds);
  const f = normalizeWorkshopCompanyId(filterCompanyId);
  const wktKey = workshopTypeId || '__any__';
  const keyFor = (p) => {
    if (f) return `__f:${f}|t:${wktKey}`;
    const id = p.company_id || p.company?.id;
    return `${id ? String(id) : '__global__'}|t:${wktKey}`;
  };
  const keys = f ? [`__f:${f}|t:${wktKey}`] : [...new Set((projects || []).map(keyFor))];
  const cache = new Map();
  for (const key of keys) {
    const [scopePart] = key.split('|');
    const cid = scopePart.startsWith('__f:')
      ? scopePart.slice(4)
      : (scopePart === '__global__' ? null : scopePart);
    const { stages } = await getResolvedKanbanStages(cid, { workshopTypeId });
    const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
    cache.set(key, sorted);
  }
  const leadMetaMap = await loadDealSxPipelineMetaByProjectIds((projects || []).map((p) => p.id));
  return (projects || []).map((p) => enrichOneSxProject(
    p,
    cache.get(keyFor(p)),
    wonSet,
    leadMetaMap.get(String(p.id)) || null,
  ));
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
    default_probability: col.default_probability ?? null,
    sla_days: col.sla_days ?? null,
    counts_as_won_revenue: col.counts_as_won_revenue ?? null,
    counts_as_completed_revenue: col.counts_as_completed_revenue ?? null,
    counts_as_collected_revenue: col.counts_as_collected_revenue ?? null,
    requires_deadline: col.requires_deadline ?? false,
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
  let workshopTypeId = project?.workshop_type_id || null;
  if ((!compId || !workshopTypeId) && project?.id) {
    const { data: pr } = await supabase
      .from('projects')
      .select('company_id, workshop_type_id')
      .eq('id', project.id)
      .maybeSingle();
    compId = compId || pr?.company_id;
    workshopTypeId = workshopTypeId || pr?.workshop_type_id || null;
  }
  const wonIds = await getWonDealProjectIds();
  const wonSet = new Set(wonIds);
  const wktResolve = workshopTypeId || 'none';
  const { stages: kanbanStages } = await getResolvedKanbanStages(compId ? String(compId) : null, { workshopTypeId: wktResolve });
  const sortedKanban = [...kanbanStages].sort((a, b) => a.order_index - b.order_index);
  const leadMetaMap = project?.id
    ? await loadDealSxPipelineMetaByProjectIds([project.id])
    : new Map();
  const leadMeta = leadMetaMap.get(String(project.id)) || null;
  const colId = kanbanColumnIdForProject(project, sortedKanban, wonSet, leadMeta);
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

/** Tìm CRM stage ID theo sync_role. Nếu chưa cấu hình, fallback theo tên.
 *  @param {string} role
 *  @param {string|null} pipelineId — ưu tiên cột thuộc pipeline này (để hỗ trợ multi-pipeline)
 */
async function getCrmStageByRole(role, pipelineId = null) {
  if (!role) return null;

  // ── Ưu tiên: tìm theo sync_role + pipeline_id ──
  if (pipelineId) {
    const { data: byRoleInPipe } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name')
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .eq('sync_role', role)
      .eq('pipeline_id', pipelineId)
      .limit(1)
      .maybeSingle();
    if (byRoleInPipe?.id) return byRoleInPipe.id;
  }

  // ── Fallback 1: bất kỳ pipeline nào có sync_role ──
  const { data: byRole } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name')
    .eq('pipeline_type', 'deal')
    .eq('is_active', true)
    .eq('sync_role', role)
    .limit(1)
    .maybeSingle();
  if (byRole?.id) return byRole.id;

  // ── Fallback 2: tìm theo pattern tên nếu chưa cấu hình ──
  const patterns = ROLE_NAME_PATTERNS[role];
  if (!patterns) return null;

  for (const pattern of patterns) {
    let q = supabase
      .from('crm_pipeline_stages')
      .select('id, name')
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .ilike('name', pattern)
      .order('order_index')
      .limit(1);
    if (pipelineId) q = q.eq('pipeline_id', pipelineId);
    const { data: byName } = await q.maybeSingle();
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
    .select('id, stage_id, sx_handover_at, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, sync_role, is_won, is_lost)')
    .eq('project_id', projectId)
    .eq('type', 'deal');

  for (const lead of leads || []) {
    if (!lead.sx_handover_at) continue;
    if (String(lead.stage_id || '') === String(targetCrmStageId)) continue;
    if (!shouldAutoOverwriteCrmStage(lead.stage)) continue; // Race-guard
    await supabase.from('crm_leads').update({ stage_id: targetCrmStageId }).eq('id', lead.id);
  }
}

/**
 * Tìm ID stage "Thắng" trong CRM deal pipeline (is_won=true).
 * @param {string|null} pipelineId — ưu tiên cột Thắng thuộc pipeline của deal
 */
async function getCrmThangStageId(pipelineId = null) {
  if (pipelineId) {
    const { data: inPipe } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'deal')
      .eq('is_won', true)
      .eq('is_active', true)
      .eq('pipeline_id', pipelineId)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (inPipe?.id) return inPipe.id;
  }
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_type', 'deal')
    .eq('is_won', true)
    .eq('is_active', true)
    .order('order_index')
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

/** Cột SX khi Sale kéo deal CRM sang «Sản xuất»: ưu tiên cột trigger, không thì cột đầu sau intake. */
function pickSxColumnOnCrmProductionEntry(sortedStages) {
  const sorted = [...(sortedStages || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const real = (s) => s?.id && !String(s.id).startsWith('__fb_');
  const triggerCol = sorted.find(
    (s) => real(s) && s.crm_sync_type === 'production' && s.bucket_slug !== INTAKE_BUCKET,
  );
  if (triggerCol) return triggerCol.id;
  const nonIntake = sorted.find((s) => real(s) && s.bucket_slug !== INTAKE_BUCKET);
  if (nonIntake) return nonIntake.id;
  return firstSxPipelineColumnId(sorted);
}

async function resolveSxColumnUuidForDb(colId, companyId) {
  if (!colId) return null;
  const s = String(colId);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s;
  if (s.startsWith('__fb_')) return getDbIntakeStageId(companyId ? String(companyId) : null);
  return null;
}

/**
 * CRM → SX: deal vào cột sync_role='sx_production' → gán sx_pipeline_stage_id (+ workflow project nếu có).
 */
async function syncSxKanbanFromCrmProductionStage(leadId) {
  const lid = String(leadId || '').trim();
  if (!lid) return { ok: false, skipped: 'no_lead_id' };

  const { data: lead, error: le } = await supabase
    .from('crm_leads')
    .select('id, type, project_id, pipeline_id, stage_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, sync_role)')
    .eq('id', lid)
    .maybeSingle();
  if (le) throw le;
  if (!lead || lead.type !== 'deal' || !lead.project_id) {
    return { ok: false, skipped: 'no_project' };
  }
  const st = Array.isArray(lead.stage) ? lead.stage[0] : lead.stage;
  if (String(st?.sync_role || '') !== 'sx_production') {
    return { ok: false, skipped: 'not_sx_production_stage' };
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, company_id, workshop_type_id, current_stage_id, status')
    .eq('id', lead.project_id)
    .maybeSingle();
  if (!project) return { ok: false, skipped: 'project_not_found' };

  const wkt = project.workshop_type_id || 'none';
  const { stages } = await getResolvedKanbanStages(
    project.company_id ? String(project.company_id) : null,
    { workshopTypeId: wkt },
  );
  const sorted = [...(stages || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const pickedColId = pickSxColumnOnCrmProductionEntry(sorted);
  const sxColUuid = await resolveSxColumnUuidForDb(pickedColId, project.company_id);
  if (!sxColUuid) return { ok: false, skipped: 'no_pipeline_column' };

  const colRow = sorted.find((s) => String(s.id) === String(pickedColId))
    || (await supabase
      .from('production_pipeline_stages')
      .select('id, workflow_stage_id, bucket_slug')
      .eq('id', sxColUuid)
      .maybeSingle()).data;

  const now = new Date().toISOString();
  await supabase
    .from('crm_leads')
    .update({ sx_pipeline_stage_id: sxColUuid, updated_at: now })
    .eq('id', lid);

  const projectUpd = { updated_at: now };
  const wfId = colRow?.workflow_stage_id || null;
  if (wfId) {
    projectUpd.current_stage_id = wfId;
    const { data: targetStage } = await supabase
      .from('workflow_stages')
      .select('slug')
      .eq('id', wfId)
      .maybeSingle();
    const statusMap = { production: 'producing', delivery: 'shipping', 'customer-care': 'warranty' };
    if (targetStage?.slug && statusMap[targetStage.slug]) {
      projectUpd.status = statusMap[targetStage.slug];
    }
  }

  if (Object.keys(projectUpd).length > 1) {
    await supabase.from('projects').update(projectUpd).eq('id', project.id);
  }

  return {
    ok: true,
    sx_pipeline_stage_id: sxColUuid,
    project_id: project.id,
    workflow_stage_id: wfId,
  };
}

/**
 * Cập nhật crm_leads.sx_pipeline_stage_id cho mọi deal gắn project_id.
 * Đồng thời cập nhật stage_id CRM:
 *   - Project rời "Chờ vào xưởng" (có current_stage_id thực) → stage_id = "Sản xuất"
 *   - Project quay về intake (current_stage_id = null) → stage_id = "Thắng"
 */
/** @param {string} location @param {string} message @param {object} data @param {string} hypothesisId */
function agentDebugLog(location, message, data, hypothesisId) {
  const payload = {
    sessionId: 'fb4228',
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
    runId: 'post-fix',
  };
  // #region agent log
  try {
    fs.appendFileSync(AGENT_DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch (_) { /* ignore */ }
  fetch('http://127.0.0.1:7754/ingest/c6417520-0159-4c13-a5f9-ac15886b2276', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fb4228' },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}

async function syncCrmLeadSxPipelineFromProject(projectId) {
  const { data: project } = await supabase
    .from('projects')
    .select('id, current_stage_id, status, company_id, workshop_type_id')
    .eq('id', projectId)
    .single();
  if (!project) {
    agentDebugLog('workshopKanban.js:syncCrm', 'project not found', { projectId }, 'E');
    return;
  }

  const stageUuid = await resolveSxPipelineStageUuidForProject(project);

  // Deal mới CRM → SX (chờ xưởng, chưa có workflow): gán cột đầu pipeline — không ghi đè khi đã producing.
  if (stageUuid && !project.current_stage_id) {
    const { data: intakeLeads } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('project_id', projectId)
      .eq('type', 'deal')
      .is('sx_handover_at', null);
    if (intakeLeads?.length) {
      await supabase
        .from('crm_leads')
        .update({ sx_pipeline_stage_id: stageUuid, updated_at: new Date().toISOString() })
        .in('id', intakeLeads.map((l) => l.id));
    }
  }

  const pipeRows0 = await loadProductionPipelineStagesRows(true, project.company_id);
  let pipeRows = pipeRows0 || [];

  // Nếu project.company_id lệch với company của deal CRM
  const hasStageUuidInRows = stageUuid && pipeRows.some((r) => r?.id && String(r.id) === String(stageUuid));
  if (stageUuid && !hasStageUuidInRows) {
    try {
      const { data: leadCompanyRow } = await supabase
        .from('crm_leads')
        .select('company_id')
        .eq('project_id', projectId)
        .eq('type', 'deal')
        .limit(1)
        .maybeSingle();
      const leadCompanyId = leadCompanyRow?.company_id || null;
      if (leadCompanyId && String(leadCompanyId) !== String(project.company_id || '')) {
        const altRows = await loadProductionPipelineStagesRows(true, leadCompanyId);
        if (Array.isArray(altRows) && altRows.length) pipeRows = altRows;
      } else {
        // Fallback cuối: load pipeline global (company_id null) nếu có
        const gRows = await loadProductionPipelineStagesRows(true, null);
        if (Array.isArray(gRows) && gRows.length) pipeRows = gRows;
      }
    } catch (e) {
      console.warn('[syncCrmLeadSxPipelineFromProject] pipeline company mismatch fallback:', e.message);
    }
  }

  // pipeRows có thể có cả các cột bucket (vd "Chờ vào xưởng") không có workflow_stage_id.
  // Ta cần giữ lại để lookup currentRow theo stageUuid/crm_target_stage_id.
  const prodPipeAll = (pipeRows || [])
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const prodPipeList = prodPipeAll.filter((r) => r.workflow_stage_id);
  const prodWorkflowStageIds = new Set(
    prodPipeList.map((r) => r.workflow_stage_id).filter(Boolean).map(String),
  );

  // Kiểm tra project có đang ở stage sản xuất thực không
  const isInRealProductionStage =
    !!project.current_stage_id &&
    prodWorkflowStageIds.has(String(project.current_stage_id));

  // Cột Kanban thực tế có thể lưu trên deal (kéo cột bucket không có workflow_stage_id).
  let leadPipelineColId = null;
  try {
    const { data: leadColRow } = await supabase
      .from('crm_leads')
      .select('sx_pipeline_stage_id')
      .eq('project_id', projectId)
      .eq('type', 'deal')
      .not('sx_pipeline_stage_id', 'is', null)
      .limit(1)
      .maybeSingle();
    leadPipelineColId = leadColRow?.sx_pipeline_stage_id || null;
  } catch (_) { /* ignore */ }

  // Tìm cột hiện tại trong pipeline config
  const currentRow =
    prodPipeAll.find((r) => leadPipelineColId && String(r.id) === String(leadPipelineColId))
    || prodPipeAll.find((r) => stageUuid && String(r.id) === String(stageUuid))
    || prodPipeAll.find((r) => project.current_stage_id && r.workflow_stage_id && String(r.workflow_stage_id) === String(project.current_stage_id));

  agentDebugLog(
    'workshopKanban.js:syncCrm:context',
    'pipeline context',
    {
      projectId,
      projectCompanyId: project.company_id || null,
      currentStageId: project.current_stage_id || null,
      stageUuid: stageUuid || null,
      currentRowId: currentRow?.id || null,
      currentRowName: currentRow?.name || null,
      currentRowOrder: currentRow?.order_index ?? null,
      crmTargetStageId: currentRow?.crm_target_stage_id || null,
      crmSyncType: currentRow?.crm_sync_type || null,
      pipeRowCount: prodPipeAll.length,
      hasStageUuidInRows,
    },
    'D',
  );

  // ── Ưu tiên: dùng crm_target_stage_id trực tiếp nếu đã cấu hình ──
  if (currentRow?.crm_target_stage_id) {
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, stage_id, sx_handover_at, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, sync_role, is_won, is_lost)')
      .eq('project_id', projectId)
      .eq('type', 'deal');
    await Promise.all(
      (leads || []).map((lead) => {
        const patch = {};
        if (stageUuid) patch.sx_pipeline_stage_id = stageUuid;
        const st = Array.isArray(lead.stage) ? lead.stage[0] : lead.stage;
        const canOverwrite = shouldAutoOverwriteCrmStage(lead.stage);
        const skipReasons = [];
        if (!lead.sx_handover_at) skipReasons.push('no_sx_handover_at');
        if (String(lead.stage_id || '') === String(currentRow.crm_target_stage_id)) skipReasons.push('already_at_target');
        if (!canOverwrite) skipReasons.push('race_guard_blocked');
        if (
          lead.sx_handover_at
          && String(lead.stage_id || '') !== String(currentRow.crm_target_stage_id)
          && canOverwrite
        ) {
          patch.stage_id = currentRow.crm_target_stage_id;
        }
        agentDebugLog(
          'workshopKanban.js:syncCrm:targetBranch',
          'lead patch decision',
          {
            leadId: lead.id,
            branch: 'crm_target_stage_id',
            skipReasons,
            hasHandover: !!lead.sx_handover_at,
            canOverwrite,
            stageName: st?.name || null,
            stageIsWon: !!st?.is_won,
            stageSyncRole: st?.sync_role || null,
            patchKeys: Object.keys(patch),
          },
          skipReasons.includes('no_sx_handover_at') ? 'A' : skipReasons.includes('race_guard_blocked') ? 'B' : 'D',
        );
        if (!Object.keys(patch).length) return Promise.resolve();
        return supabase.from('crm_leads').update(patch).eq('id', lead.id);
      }),
    );
    return;
  }

  // ── Trigger SX → CRM: chỉ cột đã tick crm_sync_type='production' (không theo order_index) ──
  let isInCrmProductionTriggerStage = false;
  if (currentRow?.crm_sync_type === 'production') {
    isInCrmProductionTriggerStage = true;
  } else if (project.current_stage_id) {
    const rowByWorkflow = prodPipeAll.find(
      (r) => r.workflow_stage_id && String(r.workflow_stage_id) === String(project.current_stage_id),
    );
    if (rowByWorkflow?.crm_sync_type === 'production') {
      isInCrmProductionTriggerStage = true;
    }
  }

  agentDebugLog(
    'workshopKanban.js:syncCrm:legacy',
    'production trigger sync',
    {
      projectId,
      isInCrmProductionTriggerStage,
      currentRowSyncType: currentRow?.crm_sync_type || null,
      isInRealProductionStage,
    },
    isInCrmProductionTriggerStage ? 'D' : 'C',
  );

  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id, stage_id, pipeline_id, sx_handover_at, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, sync_role, is_won, is_lost)')
    .eq('project_id', projectId)
    .eq('type', 'deal');

  await Promise.all(
    (leads || []).map(async (lead) => {
      const update = {};
      // Không ghi null — tránh xóa badge SX khi chưa map được cột pipeline.
      if (stageUuid) update.sx_pipeline_stage_id = stageUuid;

      // Chỉ đổi cột CRM sau khi Sale đã bàn giao SX (sx_handover_at) — trước đó chỉ cập nhật badge.
      // Race-guard: bỏ qua nếu Sale đang để deal ở cột pre-Thắng (Đàm phán/Báo giá…) hoặc Thua.
      const st = Array.isArray(lead.stage) ? lead.stage[0] : lead.stage;
      const canOverwrite = shouldAutoOverwriteCrmStage(lead.stage);
      const skipReasons = [];
      if (!lead.sx_handover_at) skipReasons.push('no_sx_handover_at');
      if (!canOverwrite) skipReasons.push('race_guard_blocked');
      // Lookup cột «Sản xuất» CRM theo PIPELINE của deal (mỗi pipeline có cột riêng).
      const sanXuatStageId = isInCrmProductionTriggerStage
        ? await getCrmStageByRole('sx_production', lead.pipeline_id || null)
        : null;
      const thangStageId = !isInCrmProductionTriggerStage
        ? await getCrmThangStageId(lead.pipeline_id || null)
        : null;
      if (!isInCrmProductionTriggerStage && !thangStageId) skipReasons.push('not_in_trigger_no_thang');
      if (isInCrmProductionTriggerStage && !sanXuatStageId) skipReasons.push('no_sx_production_crm_stage');
      if (lead.sx_handover_at && canOverwrite) {
        if (isInCrmProductionTriggerStage && sanXuatStageId) {
          if (String(lead.stage_id || '') !== String(sanXuatStageId)) update.stage_id = sanXuatStageId;
          else skipReasons.push('already_at_san_xuat');
        } else if (!isInCrmProductionTriggerStage && thangStageId) {
          if (String(lead.stage_id || '') !== String(thangStageId)) update.stage_id = thangStageId;
          else skipReasons.push('already_at_thang');
        }
      }

      agentDebugLog(
        'workshopKanban.js:syncCrm:legacyLead',
        'lead patch decision',
        {
          leadId: lead.id,
          branch: 'crm_sync_type_production',
          skipReasons,
          hasHandover: !!lead.sx_handover_at,
          canOverwrite,
          isInCrmProductionTriggerStage,
          stageName: st?.name || null,
          stageIsWon: !!st?.is_won,
          stageSyncRole: st?.sync_role || null,
          updateKeys: Object.keys(update),
        },
        skipReasons.includes('no_sx_handover_at') ? 'A'
          : skipReasons.includes('race_guard_blocked') ? 'B'
            : skipReasons.includes('no_sx_production_crm_stage') ? 'C'
              : skipReasons.includes('not_in_trigger') ? 'D' : 'D',
      );

      if (!Object.keys(update).length) return Promise.resolve();
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
        sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name)),
        vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)
      `)
      .eq('project_id', projectId)
      .eq('type', 'deal');

    if (bothErr) {
      // Fallback: chỉ lấy SX (join VC chưa sẵn sàng)
      // KHÔNG emit vc_pipeline_stage để tránh xóa badge VC hiện tại trên frontend
      const { data: leadsWithSx } = await supabase
        .from('crm_leads')
        .select('id, project_id, stage_id, sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name))')
        .eq('project_id', projectId)
        .eq('type', 'deal');
      for (const lead of (leadsWithSx || [])) {
        const sx = Array.isArray(lead.sx_pipeline_stage) ? lead.sx_pipeline_stage[0] : lead.sx_pipeline_stage;
        const payloadSx = {
          lead_id: String(lead.id),
          project_id: lead.project_id ? String(lead.project_id) : null,
          stage_id: lead.stage_id ? String(lead.stage_id) : null,
        };
        if (sx) payloadSx.sx_pipeline_stage = sx;
        io.emit('crm:badge_updated', payloadSx);
      }
      return;
    }

    for (const lead of (leadsWithBoth || [])) {
      const sx = Array.isArray(lead.sx_pipeline_stage) ? lead.sx_pipeline_stage[0] : lead.sx_pipeline_stage;
      const vc = Array.isArray(lead.vc_pipeline_stage) ? lead.vc_pipeline_stage[0] : lead.vc_pipeline_stage;
      const payload = {
        lead_id: String(lead.id),
        project_id: lead.project_id ? String(lead.project_id) : null,
        stage_id: lead.stage_id ? String(lead.stage_id) : null,
      };
      if (sx) payload.sx_pipeline_stage = sx;
      if (vc) payload.vc_pipeline_stage = vc;
      io.emit('crm:badge_updated', payload);
    }
  } catch (e) {
    console.warn('[workshopKanban] emitCrmBadgeUpdateForProject:', e.message);
  }
}

/**
 * Sửa deal cũ: làm mới badge SX/VC; nếu chưa bàn giao SX mà đang kẹt cột Sản xuất/VC trên CRM → đưa về Thắng.
 */
async function repairCrmDealPipelineDisplay(leadId) {
  const lid = String(leadId || '').trim();
  if (!lid) return { ok: false, error: 'Thiếu lead id' };

  const { data: lead, error: le } = await supabase
    .from('crm_leads')
    .select('id, type, project_id, pipeline_id, company_id, stage_id, sx_handover_at')
    .eq('id', lid)
    .maybeSingle();
  if (le) throw le;
  if (!lead || lead.type !== 'deal') return { ok: false, error: 'Không phải deal' };
  if (!lead.project_id) return { ok: false, error: 'Deal chưa có dự án' };

  await syncCrmLeadSxPipelineFromProject(lead.project_id);

  let stageReset = false;
  if (!lead.sx_handover_at && lead.stage_id) {
    const { data: st } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, is_won, is_lost, sync_role')
      .eq('id', lead.stage_id)
      .maybeSingle();
    if (st && isCrmPostWonManagedStage(st)) {
      let sq = supabase
        .from('crm_pipeline_stages')
        .select('id')
        .eq('pipeline_type', 'deal')
        .eq('is_won', true)
        .eq('is_active', true)
        .order('order_index', { ascending: true })
        .limit(1);
      if (lead.pipeline_id) sq = sq.eq('pipeline_id', lead.pipeline_id);
      else if (lead.company_id) sq = sq.eq('company_id', lead.company_id);
      const { data: won } = await sq.maybeSingle();
      if (won?.id && String(won.id) !== String(lead.stage_id)) {
        await supabase
          .from('crm_leads')
          .update({ stage_id: won.id, updated_at: new Date().toISOString() })
          .eq('id', lid);
        stageReset = true;
      }
    }
  }

  return { ok: true, stage_reset_to_won: stageReset, project_id: lead.project_id };
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
  firstSxPipelineColumnId,
  loadDealSxPipelineMetaByProjectIds,
  kanbanColumnIdForProject,
  enrichProjectsForSx,
  buildPipelineSummary,
  emitCrmBadgeUpdateForProject,
  getDbIntakeStageId,
  resolveSxPipelineStageUuidForProject,
  syncCrmLeadSxPipelineFromProject,
  syncSxKanbanFromCrmProductionStage,
  pickSxColumnOnCrmProductionEntry,
  shouldAutoOverwriteCrmStage,
  repairCrmDealPipelineDisplay,
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
