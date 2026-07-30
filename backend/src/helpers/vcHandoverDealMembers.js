/**
 * Sau khi Sale chọn công ty VC/LĐ:
 *  - thêm thành viên công ty VC vào deal (lead_members)
 *  - đảm bảo project hiện trên module VC
 *  - nếu công ty VC ≠ CRM gốc: tạo deal CRM con trên pipeline công ty VC
 */
const { supabase } = require('../config/supabase');
const { getCrmStageByRole } = require('./workshopKanban');

/** Toàn bộ user đang active của công ty VC/LĐ. */
async function listActiveCompanyUserIds(companyId) {
  if (!companyId) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true);
  if (error) {
    console.warn('[vcHandoverDealMembers] list users:', error.message);
    return [];
  }
  return [...new Set((data || []).map((u) => String(u.id)).filter(Boolean))];
}

async function nextDealCode() {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('code_sequences')
    .select('current_number, year')
    .eq('prefix', 'DEAL')
    .maybeSingle();
  let num = 1;
  if (data) {
    num = data.year === year ? Number(data.current_number || 0) + 1 : 1;
  }
  await supabase.from('code_sequences').upsert({ prefix: 'DEAL', current_number: num, year });
  return `DEAL-${year}-${String(num).padStart(3, '0')}`;
}

/**
 * Tìm pipeline deal + cột vc_delivery của công ty VC.
 * @returns {Promise<{ pipelineId: string, stageId: string }|null>}
 */
async function resolveVcCompanyCrmTarget(logisticsCompanyId) {
  if (!logisticsCompanyId) return null;
  const { data: pipes } = await supabase
    .from('crm_pipelines')
    .select('id')
    .eq('company_id', logisticsCompanyId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  for (const pipe of pipes || []) {
    const stageId = await getCrmStageByRole('vc_delivery', pipe.id);
    if (stageId) return { pipelineId: pipe.id, stageId };
  }
  // Pipeline không có sync_role — lấy cột tên vận chuyển / cột đầu deal
  for (const pipe of pipes || []) {
    const { data: byName } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipe.id)
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .ilike('name', '%vận chuyển%')
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (byName?.id) return { pipelineId: pipe.id, stageId: byName.id };
    const { data: first } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipe.id)
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (first?.id) return { pipelineId: pipe.id, stageId: first.id };
  }
  return null;
}

/**
 * Đảm bảo có deal CRM thuộc công ty VC (cùng project) để bên VC thấy trên CRM Kanban.
 * - Cùng công ty với deal gốc → dùng deal gốc (đã sync vc_delivery).
 * - Khác công ty → tạo/reuse deal con parent_lead_id + company_id = VC.
 */
async function ensureVcCompanyCrmDeal({
  sourceLeadId,
  logisticsCompanyId,
  projectId,
  vcKanbanColumnId = null,
  logisticsPersonId = null,
  actorUserId,
}) {
  if (!sourceLeadId || !logisticsCompanyId || !projectId) {
    return { dealId: sourceLeadId || null, created: false, reason: 'missing_params' };
  }

  const { data: source } = await supabase
    .from('crm_leads')
    .select('id, code, title, customer_id, company_id, pipeline_id, stage_id, assigned_to, lead_owner_id, estimated_value, install_address, region_id, project_id')
    .eq('id', sourceLeadId)
    .maybeSingle();
  if (!source) return { dealId: null, created: false, reason: 'source_not_found' };

  // Cùng công ty CRM = VC → deal gốc đã đủ (performVcHandoverCore đã đẩy vc_delivery).
  if (String(source.company_id || '') === String(logisticsCompanyId)) {
    return { dealId: source.id, created: false, reason: 'same_company' };
  }

  // Đã có deal con cho công ty VC?
  const { data: existing } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('parent_lead_id', source.id)
    .eq('company_id', logisticsCompanyId)
    .eq('type', 'deal')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    const patch = {
      updated_at: new Date().toISOString(),
      project_id: projectId,
    };
    if (vcKanbanColumnId) patch.vc_pipeline_stage_id = vcKanbanColumnId;
    if (logisticsPersonId) {
      patch.assigned_to = logisticsPersonId;
      patch.lead_owner_id = logisticsPersonId;
    }
    await supabase.from('crm_leads').update(patch).eq('id', existing.id);
    return { dealId: existing.id, created: false, reason: 'reuse' };
  }

  const target = await resolveVcCompanyCrmTarget(logisticsCompanyId);
  if (!target) {
    console.warn('[vcHandoverDealMembers] công ty VC chưa có pipeline CRM / cột vận chuyển:', logisticsCompanyId);
    return { dealId: null, created: false, reason: 'no_vc_pipeline' };
  }

  const code = await nextDealCode();
  const now = new Date().toISOString();
  const assignee = logisticsPersonId || actorUserId;
  const insert = {
    code,
    title: source.title || `VC — ${source.code || code}`,
    description: `Deal VC/LĐ từ ${source.code || source.id} (bàn giao vận chuyển).`,
    type: 'deal',
    customer_id: source.customer_id || null,
    company_id: logisticsCompanyId,
    pipeline_id: target.pipelineId,
    stage_id: target.stageId,
    stage_entered_at: now,
    assigned_to: assignee,
    lead_owner_id: assignee,
    project_id: projectId,
    parent_lead_id: source.id,
    estimated_value: source.estimated_value || 0,
    install_address: source.install_address || null,
    region_id: source.region_id || null,
    created_by: actorUserId || null,
    vc_pipeline_stage_id: vcKanbanColumnId || null,
  };

  const { data: created, error } = await supabase
    .from('crm_leads')
    .insert(insert)
    .select('id, code')
    .single();
  if (error) {
    // Cột vc_pipeline_stage_id có thể chưa migrate
    if (String(error.message || '').includes('vc_pipeline_stage_id')) {
      delete insert.vc_pipeline_stage_id;
      const retry = await supabase.from('crm_leads').insert(insert).select('id, code').single();
      if (retry.error) {
        console.warn('[vcHandoverDealMembers] create VC deal:', retry.error.message);
        return { dealId: null, created: false, reason: retry.error.message };
      }
      return { dealId: retry.data.id, created: true, code: retry.data.code, reason: 'created' };
    }
    console.warn('[vcHandoverDealMembers] create VC deal:', error.message);
    return { dealId: null, created: false, reason: error.message };
  }
  return { dealId: created.id, created: true, code: created.code, reason: 'created' };
}

/**
 * Gom user VC cần thêm vào deal + đảm bảo deal/project VC.
 */
async function afterVcCompanySelected({
  sourceLeadId,
  logisticsCompanyId,
  projectId,
  vcKanbanColumnId = null,
  logisticsPersonId = null,
  installerPersonId = null,
  actorUserId,
  extraUserIds = [],
  addMembersFn,
}) {
  const companyUserIds = await listActiveCompanyUserIds(logisticsCompanyId);
  const memberIds = [...new Set([
    ...companyUserIds,
    logisticsPersonId,
    installerPersonId,
    ...(extraUserIds || []),
  ].filter(Boolean).map(String))];

  const addedToSource = typeof addMembersFn === 'function'
    ? await addMembersFn(sourceLeadId, memberIds, actorUserId)
    : [];

  const vcDeal = await ensureVcCompanyCrmDeal({
    sourceLeadId,
    logisticsCompanyId,
    projectId,
    vcKanbanColumnId,
    logisticsPersonId,
    actorUserId,
  });

  let addedToVcDeal = [];
  if (vcDeal.dealId && String(vcDeal.dealId) !== String(sourceLeadId) && typeof addMembersFn === 'function') {
    addedToVcDeal = await addMembersFn(vcDeal.dealId, memberIds, actorUserId);
  }

  // Đảm bảo project còn trong scope VC (phòng status bị SX ghi đè).
  if (projectId && logisticsCompanyId) {
    const patch = {
      logistics_company_id: logisticsCompanyId,
      status: 'shipping',
      current_stage_id: null,
      updated_at: new Date().toISOString(),
    };
    if (vcKanbanColumnId) patch.vc_kanban_column_id = vcKanbanColumnId;
    if (logisticsPersonId) patch.logistics_person_id = logisticsPersonId;
    if (installerPersonId) patch.installer_person_id = installerPersonId;
    const { error: pe } = await supabase.from('projects').update(patch).eq('id', projectId);
    if (pe) console.warn('[vcHandoverDealMembers] project assert:', pe.message);
  }

  return {
    memberIds,
    addedToSource: addedToSource || [],
    addedToVcDeal: addedToVcDeal || [],
    vcDeal,
  };
}

module.exports = {
  listActiveCompanyUserIds,
  ensureVcCompanyCrmDeal,
  afterVcCompanySelected,
  resolveVcCompanyCrmTarget,
};
