/**
 * Đồng bộ Kanban Dashboard dự án (workflow_stages / current_stage_id)
 * ↔ cột SX / VC (+ CRM deal) qua cầu workflow_stage_id.
 */
const { supabase } = require('../config/supabase');
const {
  resolveProductionPipelineStageId,
  resolveLogisticsPipelineStageId,
} = require('./workshopApplyTemplates');
const {
  SX_STAGE_SLUG_STATUS,
  syncCrmLeadSxPipelineFromProject,
  syncVcPipelineStageToLead,
  syncCrmLeadFromLogisticsStage,
  getCrmStageIdBySyncType,
  getCrmStageByRole,
  shouldAutoOverwriteCrmStage,
} = require('./workshopKanban');

/** Slug Dashboard → module */
const DELIVERY_SLUG_MODULE = {
  order: 'crm',
  design: 'crm',
  approve: 'crm',
  measure: 'crm',
  warranty: 'crm',
  production: 'production',
  materials: 'production',
  delivery: 'logistics',
  installation: 'logistics',
  acceptance: 'logistics',
};

/** Slug Dashboard → projects.status */
const DELIVERY_SLUG_STATUS = {
  order: 'contract_signed',
  design: 'designing',
  approve: 'designing',
  measure: 'designing',
  production: 'producing',
  materials: 'producing',
  delivery: 'shipping',
  installation: 'installing',
  acceptance: 'completed',
  warranty: 'warranty',
  ...SX_STAGE_SLUG_STATUS,
};

/** Slug Dashboard → crm_sync_type (CRM deal) */
const DELIVERY_SLUG_CRM_SYNC = {
  production: 'production',
  materials: 'production',
  delivery: 'delivery',
  installation: 'installation',
  acceptance: 'customer_care',
  warranty: 'customer_care',
};

/** Heuristic cột pipeline thiếu workflow_stage_id → slug delivery 543 */
const PIPELINE_HINT_TO_DELIVERY_SLUG = [
  { re: /material|v[aậ]t\s*t[uư]|chu[aẩ]n\s*b[iị]/i, slug: 'materials' },
  { re: /production|s[aả]n\s*xu[aấ]t|gia\s*c[oô]ng|cnc|l[aắ]p\s*r[aá]p/i, slug: 'production' },
  { re: /install|l[aắ]p\s*[đd][aặ]t/i, slug: 'installation' },
  { re: /accept|nghi[eệ]m\s*thu/i, slug: 'acceptance' },
  { re: /warrant|b[aả]o\s*h[aà]nh|ch[aă]m\s*s[oó]c|customer.?care/i, slug: 'warranty' },
  { re: /deliver|giao\s*h[aà]ng|v[aậ]n\s*chuy[eể]n|shipping/i, slug: 'delivery' },
];

const CRM_SYNC_TYPE_TO_DELIVERY_SLUG = {
  production: 'production',
  packaging_done: 'production',
  delivery: 'delivery',
  installation: 'installation',
  customer_care: 'warranty',
};

async function loadWorkflowStageBySlug(slug) {
  if (!slug) return null;
  const { data } = await supabase
    .from('workflow_stages')
    .select('id, slug, name, color')
    .eq('slug', slug)
    .eq('is_active', true)
    .is('company_id', null)
    .maybeSingle();
  if (data) return data;
  const { data: any } = await supabase
    .from('workflow_stages')
    .select('id, slug, name, color')
    .eq('slug', slug)
    .maybeSingle();
  return any || null;
}

/**
 * Khi cột SX/VC thiếu workflow_stage_id — đoán slug delivery rồi trả workflow_stages.id.
 * @param {object} colRow — production/logistics pipeline stage
 * @returns {Promise<string|null>}
 */
async function resolveWorkflowStageIdFromPipelineColumn(colRow) {
  if (!colRow) return null;
  if (colRow.workflow_stage_id) return colRow.workflow_stage_id;

  const syncType = String(colRow.crm_sync_type || '').toLowerCase();
  if (CRM_SYNC_TYPE_TO_DELIVERY_SLUG[syncType]) {
    const st = await loadWorkflowStageBySlug(CRM_SYNC_TYPE_TO_DELIVERY_SLUG[syncType]);
    if (st?.id) return st.id;
  }

  const bucket = String(colRow.bucket_slug || '').toLowerCase();
  const name = String(colRow.name || '');
  const hay = `${bucket} ${name}`;
  for (const hint of PIPELINE_HINT_TO_DELIVERY_SLUG) {
    if (hint.re.test(hay)) {
      const st = await loadWorkflowStageBySlug(hint.slug);
      if (st?.id) return st.id;
    }
  }
  return null;
}

async function loadProjectForSync(projectId) {
  let { data: project, error } = await supabase
    .from('projects')
    .select('id, company_id, logistics_company_id, sx_kanban_column_id, vc_kanban_column_id, current_stage_id, status, workshop_type_id')
    .eq('id', projectId)
    .maybeSingle();
  if (error && /sx_kanban_column_id|vc_kanban_column_id|logistics_company_id/.test(String(error.message || ''))) {
    ({ data: project } = await supabase
      .from('projects')
      .select('id, company_id, current_stage_id, status, workshop_type_id')
      .eq('id', projectId)
      .maybeSingle());
  }
  return project;
}

async function updateProjectSafe(projectId, patch) {
  let { error } = await supabase.from('projects').update(patch).eq('id', projectId);
  if (!error) return { ok: true, patch };
  const msg = String(error.message || '');
  const fallback = { ...patch };
  if (msg.includes('sx_kanban_column_id')) delete fallback.sx_kanban_column_id;
  if (msg.includes('vc_kanban_column_id')) delete fallback.vc_kanban_column_id;
  if (msg.includes('logistics_company_id')) delete fallback.logistics_company_id;
  if (Object.keys(fallback).length === 0) {
    console.warn('[syncProjectDeliveryStage] update skipped:', msg);
    return { ok: false, error };
  }
  ({ error } = await supabase.from('projects').update(fallback).eq('id', projectId));
  if (error) {
    console.warn('[syncProjectDeliveryStage] update failed:', error.message);
    return { ok: false, error };
  }
  return { ok: true, patch: fallback };
}

async function findLogisticsColByDeliverySlug(companyId, slug) {
  const syncType = DELIVERY_SLUG_CRM_SYNC[slug] || null;
  const pick = async (scope) => {
    let q = supabase
      .from('logistics_pipeline_stages')
      .select('id, name, crm_sync_type, bucket_slug, workflow_stage_id')
      .eq('is_active', true)
      .order('order_index');
    if (scope === 'company' && companyId) q = q.eq('company_id', companyId);
    if (scope === 'global') q = q.is('company_id', null);
    const { data } = await q.limit(40);
    return data || [];
  };
  const rows = [
    ...(companyId ? await pick('company') : []),
    ...(await pick('global')),
  ];
  if (syncType) {
    const bySync = rows.find((r) => String(r.crm_sync_type || '').toLowerCase() === syncType);
    if (bySync?.id) return bySync.id;
  }
  for (const hint of PIPELINE_HINT_TO_DELIVERY_SLUG) {
    if (hint.slug !== slug) continue;
    const hit = rows.find((r) => hint.re.test(`${r.bucket_slug || ''} ${r.name || ''}`));
    if (hit?.id) return hit.id;
  }
  return null;
}

async function findProductionColByDeliverySlug(companyId, slug) {
  const syncType = DELIVERY_SLUG_CRM_SYNC[slug] || null;
  const pick = async (scope) => {
    let q = supabase
      .from('production_pipeline_stages')
      .select('id, name, crm_sync_type, bucket_slug, workflow_stage_id')
      .eq('is_active', true)
      .order('order_index');
    if (scope === 'company' && companyId) q = q.eq('company_id', companyId);
    if (scope === 'global') q = q.is('company_id', null);
    const { data } = await q.limit(40);
    return data || [];
  };
  const rows = [
    ...(companyId ? await pick('company') : []),
    ...(await pick('global')),
  ];
  if (syncType) {
    const bySync = rows.find((r) => String(r.crm_sync_type || '').toLowerCase() === syncType);
    if (bySync?.id) return bySync.id;
  }
  for (const hint of PIPELINE_HINT_TO_DELIVERY_SLUG) {
    if (hint.slug !== slug) continue;
    const hit = rows.find((r) => hint.re.test(`${r.bucket_slug || ''} ${r.name || ''}`));
    if (hit?.id) return hit.id;
  }
  return null;
}

async function loadSxPipelineRow(colId) {
  if (!colId) return null;
  const { data } = await supabase
    .from('production_pipeline_stages')
    .select('id, name, bucket_slug, crm_sync_type, crm_target_stage_id, workflow_stage_id, company_id, is_handover_to_logistics')
    .eq('id', colId)
    .maybeSingle();
  return data;
}

async function loadVcPipelineRow(colId) {
  if (!colId) return null;
  let { data, error } = await supabase
    .from('logistics_pipeline_stages')
    .select('id, name, bucket_slug, crm_sync_type, crm_target_stage_id, workflow_stage_id, company_id')
    .eq('id', colId)
    .maybeSingle();
  if (error && String(error.message || '').includes('crm_target_stage_id')) {
    ({ data } = await supabase
      .from('logistics_pipeline_stages')
      .select('id, name, bucket_slug, crm_sync_type, workflow_stage_id, company_id')
      .eq('id', colId)
      .maybeSingle());
  }
  return data;
}

/**
 * Cập nhật CRM deal stage_id theo sync_type / sync_role (không map tên cứng).
 */
async function syncCrmDealFromDeliverySlug(projectId, slug) {
  const syncType = DELIVERY_SLUG_CRM_SYNC[slug];
  let targetId = syncType ? await getCrmStageIdBySyncType(syncType) : null;

  // CRM-only slugs: cố gắng theo sync_role nếu admin đã cấu hình
  if (!targetId && DELIVERY_SLUG_MODULE[slug] === 'crm') {
    const roleBySlug = {
      order: 'deal_won',
      design: 'design',
      approve: 'approve',
      measure: 'measure',
      warranty: 'vc_customer_care',
    };
    const role = roleBySlug[slug];
    if (role) targetId = await getCrmStageByRole(role);
  }
  if (!targetId) return { synced: false };

  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id, stage_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, sync_role, is_won, is_lost)')
    .eq('project_id', projectId)
    .eq('type', 'deal');

  let n = 0;
  for (const lead of leads || []) {
    if (String(lead.stage_id || '') === String(targetId)) continue;
    if (!shouldAutoOverwriteCrmStage(lead.stage)) continue;
    const { error } = await supabase
      .from('crm_leads')
      .update({ stage_id: targetId, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (!error) n += 1;
  }
  return { synced: n > 0, target_stage_id: targetId, count: n };
}

/**
 * Sau khi Dashboard đổi current_stage — đẩy sang cột SX/VC + CRM.
 *
 * @param {string} projectId
 * @param {{ id: string, slug: string, name?: string }} workflowStage
 * @param {{ userId?: string, skipProjectCoreUpdate?: boolean }} [opts]
 *   skipProjectCoreUpdate — true nếu caller đã ghi current_stage_id/status
 */
async function syncModulesFromDeliveryStage(projectId, workflowStage, opts = {}) {
  const slug = String(workflowStage?.slug || '').toLowerCase();
  const stageId = workflowStage?.id || null;
  if (!projectId || !slug || !stageId) {
    return { ok: false, reason: 'missing_args' };
  }

  const moduleKey = DELIVERY_SLUG_MODULE[slug] || 'other';
  const project = await loadProjectForSync(projectId);
  if (!project) return { ok: false, reason: 'project_not_found' };

  const alreadyInVc = Boolean(project.logistics_company_id || project.vc_kanban_column_id);
  const status = DELIVERY_SLUG_STATUS[slug] || null;
  const result = {
    ok: true,
    module: moduleKey,
    slug,
    sx_kanban_column_id: null,
    vc_kanban_column_id: null,
    crm: null,
    warnings: [],
  };

  const corePatch = {};
  if (!opts.skipProjectCoreUpdate) {
    corePatch.current_stage_id = stageId;
    if (status) corePatch.status = status;
  } else if (status && !(alreadyInVc && moduleKey === 'production')) {
    // Caller đã set current_stage_id; có thể bổ sung status nếu thiếu
    if (!project.status || project.status !== status) corePatch.status = status;
  }

  if (moduleKey === 'production') {
    if (alreadyInVc) {
      result.warnings.push('already_in_vc_skip_sx_overwrite');
      // Chỉ giữ current_stage nếu caller đã set; không đổi sx/status về production
      if (Object.keys(corePatch).length && !opts.skipProjectCoreUpdate) {
        // Không kéo current_stage về production khi đã VC
        delete corePatch.current_stage_id;
        delete corePatch.status;
      }
    } else {
      const companyId = project.company_id || null;
      let sxColId = await resolveProductionPipelineStageId(stageId, companyId);
      if (!sxColId) {
        sxColId = await findProductionColByDeliverySlug(companyId, slug);
        if (sxColId) result.warnings.push('sx_column_from_slug_fallback');
      }
      if (!sxColId) {
        result.warnings.push('sx_column_not_linked');
        console.warn(
          `[syncProjectDeliveryStage] No SX column for workflow_stage=${slug} company=${companyId}`,
        );
      } else {
        corePatch.sx_kanban_column_id = sxColId;
        result.sx_kanban_column_id = sxColId;
      }
      if (status) corePatch.status = status;
      if (!opts.skipProjectCoreUpdate) corePatch.current_stage_id = stageId;
    }
  } else if (moduleKey === 'logistics') {
    const companyId = project.logistics_company_id || project.company_id || null;
    let vcColId = await resolveLogisticsPipelineStageId(stageId, companyId);
    if (!vcColId) {
      vcColId = await findLogisticsColByDeliverySlug(companyId, slug);
      if (vcColId) result.warnings.push('vc_column_from_slug_fallback');
    }
    if (!vcColId) {
      result.warnings.push('vc_column_not_linked');
      console.warn(
        `[syncProjectDeliveryStage] No VC column for workflow_stage=${slug} company=${companyId}`,
      );
    } else {
      corePatch.vc_kanban_column_id = vcColId;
      result.vc_kanban_column_id = vcColId;
    }
    if (status) corePatch.status = status;
    if (!opts.skipProjectCoreUpdate) corePatch.current_stage_id = stageId;
  } else {
    // CRM-only delivery stages
    if (!opts.skipProjectCoreUpdate) {
      corePatch.current_stage_id = stageId;
      if (status) corePatch.status = status;
    }
  }

  corePatch.updated_at = new Date().toISOString();
  if (Object.keys(corePatch).length > 1 || !opts.skipProjectCoreUpdate) {
    // luôn có updated_at
    const keys = Object.keys(corePatch).filter((k) => k !== 'updated_at');
    if (keys.length) {
      await updateProjectSafe(projectId, corePatch);
    }
  }

  // CRM + badge module
  try {
    if (moduleKey === 'production' && result.sx_kanban_column_id && !alreadyInVc) {
      await supabase
        .from('crm_leads')
        .update({
          sx_pipeline_stage_id: result.sx_kanban_column_id,
          updated_at: new Date().toISOString(),
        })
        .eq('project_id', projectId)
        .eq('type', 'deal');
      await syncCrmLeadSxPipelineFromProject(projectId);
      const sxRow = await loadSxPipelineRow(result.sx_kanban_column_id);
      if (sxRow?.crm_target_stage_id || sxRow?.crm_sync_type) {
        // Prefer column config; fallback delivery slug map
        if (sxRow.crm_target_stage_id) {
          const { data: leads } = await supabase
            .from('crm_leads')
            .select('id, stage_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, sync_role, is_won, is_lost)')
            .eq('project_id', projectId)
            .eq('type', 'deal');
          for (const lead of leads || []) {
            if (!shouldAutoOverwriteCrmStage(lead.stage)) continue;
            if (String(lead.stage_id) === String(sxRow.crm_target_stage_id)) continue;
            await supabase.from('crm_leads')
              .update({ stage_id: sxRow.crm_target_stage_id })
              .eq('id', lead.id);
          }
        } else {
          result.crm = await syncCrmDealFromDeliverySlug(projectId, slug);
        }
      } else {
        result.crm = await syncCrmDealFromDeliverySlug(projectId, slug);
      }
    } else if (moduleKey === 'logistics' && result.vc_kanban_column_id) {
      const vcRow = await loadVcPipelineRow(result.vc_kanban_column_id);
      await syncVcPipelineStageToLead(projectId, result.vc_kanban_column_id);
      if (vcRow) await syncCrmLeadFromLogisticsStage(projectId, vcRow);
      else result.crm = await syncCrmDealFromDeliverySlug(projectId, slug);
    } else if (moduleKey === 'crm') {
      result.crm = await syncCrmDealFromDeliverySlug(projectId, slug);
    }
  } catch (e) {
    result.warnings.push(`crm_sync:${e.message}`);
    console.warn('[syncProjectDeliveryStage] CRM sync:', e.message);
  }

  return result;
}

/**
 * Chiều module → Dashboard: đảm bảo current_stage_id từ cột SX/VC
 * (kể cả khi cột thiếu workflow_stage_id).
 *
 * @param {object} project
 * @param {object} colRow — pipeline column
 * @param {'production'|'logistics'} area
 * @returns {Promise<{ current_stage_id: string|null, status: string|null, from_fallback: boolean }>}
 */
async function resolveDeliveryFieldsFromModuleColumn(project, colRow, area) {
  let wfId = colRow?.workflow_stage_id || null;
  let fromFallback = false;
  if (!wfId) {
    wfId = await resolveWorkflowStageIdFromPipelineColumn(colRow);
    fromFallback = !!wfId;
  }
  if (!wfId) {
    return { current_stage_id: null, status: null, from_fallback: false };
  }

  const alreadyInVc = Boolean(project?.logistics_company_id || project?.vc_kanban_column_id);
  if (area === 'production' && alreadyInVc) {
    return { current_stage_id: null, status: null, from_fallback: fromFallback, skipped_vc: true };
  }

  const { data: st } = await supabase
    .from('workflow_stages')
    .select('id, slug')
    .eq('id', wfId)
    .maybeSingle();
  const slug = String(st?.slug || '').toLowerCase();
  const status = DELIVERY_SLUG_STATUS[slug] || SX_STAGE_SLUG_STATUS[slug] || null;
  return {
    current_stage_id: wfId,
    status,
    from_fallback: fromFallback,
    slug,
  };
}

module.exports = {
  DELIVERY_SLUG_MODULE,
  DELIVERY_SLUG_STATUS,
  DELIVERY_SLUG_CRM_SYNC,
  loadWorkflowStageBySlug,
  resolveWorkflowStageIdFromPipelineColumn,
  syncModulesFromDeliveryStage,
  syncCrmDealFromDeliverySlug,
  resolveDeliveryFieldsFromModuleColumn,
};
