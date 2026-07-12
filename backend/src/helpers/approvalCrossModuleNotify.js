const { supabase } = require('../config/supabase');
const { notifyMultiple } = require('./notifications');
const { loadProjectProductionStaffUserIds } = require('./productionWorkshopTypeStaff');

const APPROVAL_SOURCE_MODULES = new Set(['crm', 'production', 'logistics', 'project']);

function normalizeApprovalRequestSource(body) {
  const raw = String(body?.request_source || body?.source_module || 'crm').toLowerCase().trim();
  if (raw === 'workshop' || raw === 'sx') return 'production';
  if (raw === 'vc') return 'logistics';
  if (APPROVAL_SOURCE_MODULES.has(raw)) return raw;
  return 'crm';
}

async function loadCrmApprovalRecipients(projectId) {
  const ids = new Set();
  let primaryDealId = null;

  const { data: deals } = await supabase
    .from('crm_leads')
    .select('id, assigned_to, lead_owner_id, created_by')
    .eq('project_id', projectId)
    .eq('type', 'deal')
    .order('created_at', { ascending: false });

  for (const deal of deals || []) {
    if (!primaryDealId) primaryDealId = deal.id;
    if (deal.assigned_to) ids.add(deal.assigned_to);
    if (deal.lead_owner_id) ids.add(deal.lead_owner_id);
    if (deal.created_by) ids.add(deal.created_by);
  }

  if (primaryDealId) {
    const { data: members } = await supabase
      .from('lead_members')
      .select('user_id')
      .eq('lead_id', primaryDealId);
    for (const row of members || []) {
      if (row.user_id) ids.add(row.user_id);
    }
  }

  const { data: proj } = await supabase
    .from('projects')
    .select('sales_person_id, designer_id')
    .eq('id', projectId)
    .maybeSingle();
  if (proj?.sales_person_id) ids.add(proj.sales_person_id);
  if (proj?.designer_id) ids.add(proj.designer_id);

  return { recipientIds: [...ids], primaryDealId };
}

async function loadProductionApprovalRecipients(projectId) {
  const ids = new Set();

  const { data: proj } = await supabase
    .from('projects')
    .select('production_person_id')
    .eq('id', projectId)
    .maybeSingle();
  if (proj?.production_person_id) ids.add(proj.production_person_id);

  const staffIds = await loadProjectProductionStaffUserIds(projectId);
  for (const uid of staffIds) ids.add(uid);

  return [...ids];
}

/**
 * Thông báo sang module đối diện khi gửi yêu cầu duyệt:
 * - Từ SX/VC → CRM (deal owner, thành viên deal)
 * - Từ CRM/Dự án → SX (NV sản xuất gắn dự án)
 */
async function notifyCrossModuleApprovalRequest(req, opts) {
  const {
    projectId,
    projectCode,
    requesterName,
    stageName,
    notes,
    approvalMeta,
    requestSource,
    excludeUserIds = [],
  } = opts;

  const exclude = new Set((excludeUserIds || []).filter(Boolean).map(String));
  const baseMeta = {
    ...(approvalMeta || {}),
    request_source: requestSource,
    cross_module: true,
  };

  if (requestSource === 'production' || requestSource === 'logistics') {
    const moduleLabel = requestSource === 'logistics' ? 'Vận chuyển' : 'Sản xuất';
    const { recipientIds, primaryDealId } = await loadCrmApprovalRecipients(projectId);
    const targets = recipientIds.filter((id) => !exclude.has(String(id)));
    if (!targets.length) return;

    const navUrl = primaryDealId ? `/crm/leads/${primaryDealId}?tab=approvals` : null;
    const meta = {
      ...baseMeta,
      nav_url: navUrl,
      nav_tab: 'approvals',
      lead_id: primaryDealId,
      from_module: requestSource,
      to_module: 'crm',
    };

    await notifyMultiple(
      req,
      targets,
      'approval_request',
      `🔍 Chờ duyệt từ ${moduleLabel}: ${projectCode}`,
      `${requesterName} (${moduleLabel}) gửi yêu cầu duyệt GĐ "${stageName}" — DA ${projectCode}${notes ? `\n📝 ${notes}` : ''}`,
      primaryDealId ? 'crm_deal' : 'project',
      primaryDealId || projectId,
      meta,
    );
    return;
  }

  if (requestSource === 'crm' || requestSource === 'project') {
    const moduleLabel = requestSource === 'crm' ? 'CRM' : 'Dự án';
    const targets = (await loadProductionApprovalRecipients(projectId))
      .filter((id) => !exclude.has(String(id)));
    if (!targets.length) return;

    const meta = {
      ...baseMeta,
      nav_url: `/sx/projects/${projectId}?tab=approvals`,
      nav_tab: 'approvals',
      project_id: projectId,
      from_module: requestSource,
      to_module: 'production',
    };

    await notifyMultiple(
      req,
      targets,
      'approval_request',
      `🔍 Chờ duyệt từ ${moduleLabel}: ${projectCode}`,
      `${requesterName} (${moduleLabel}) gửi yêu cầu duyệt GĐ "${stageName}" — DA ${projectCode}${notes ? `\n📝 ${notes}` : ''}`,
      'project',
      projectId,
      meta,
    );
  }
}

module.exports = {
  normalizeApprovalRequestSource,
  notifyCrossModuleApprovalRequest,
};
