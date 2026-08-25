/**
 * Người trên deal / dự án — mời vào sự kiện tạo từ kế hoạch SX / lắp đặt / hoàn thiện:
 * tab Thành viên, roster xưởng, người phụ trách CRM/SX/VC.
 */
const { supabase } = require('../config/supabase');

function uniqIds(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}

const ALL_MODULE_OWNER_EVENT_TYPES = new Set([
  'installation',
  'production_finish',
  'design_review',
  'pickup',
  'delivery',
]);

function isInstallationEventType(eventType) {
  return String(eventType || '').toLowerCase() === 'installation';
}

/** Sự kiện từ kế hoạch SX / lắp đặt / hoàn thiện → mời mọi người trên dự án. */
function shouldInviteAllModuleOwners(eventType, title = '') {
  const t = String(eventType || '').toLowerCase();
  if (ALL_MODULE_OWNER_EVENT_TYPES.has(t)) return true;
  const label = String(title || '');
  if (/hoàn\s*thiện/i.test(label) || /hoan\s*thien/i.test(label)) return true;
  if (/duyệt\s*thiết\s*kế|kế\s*hoạch\s*thiết\s*kế|duyet\s*thiet\s*ke/i.test(label)) return true;
  if (/lấy\s*hàng|lap\s*dat|lắp\s*đặt/i.test(label)) return true;
  return false;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

/**
 * @param {{ leadId?: string|null, projectId?: string|null }} opts
 * @returns {Promise<{ userIds: string[], crmIds: string[], sxIds: string[], vcIds: string[], leadId: string|null, projectId: string|null }>}
 */
async function collectDealModuleResponsibleUserIds({ leadId = null, projectId = null } = {}) {
  let lead = null;
  let pid = projectId || null;

  if (leadId) {
    const { data } = await supabase
      .from('crm_leads')
      .select('id, assigned_to, lead_owner_id, project_id')
      .eq('id', leadId)
      .maybeSingle();
    lead = data || null;
    if (!pid && lead?.project_id) pid = lead.project_id;
  }

  let project = null;
  if (pid) {
    const staffCols = 'id, production_person_id, logistics_person_id, installer_person_id, installation_person_id, sales_person_id, designer_id, design_person_id';
    let sel = await supabase.from('projects').select(staffCols).eq('id', pid).maybeSingle();
    if (sel.error && /column/i.test(String(sel.error.message || ''))) {
      sel = await supabase
        .from('projects')
        .select('id, production_person_id, logistics_person_id, installer_person_id, installation_person_id, sales_person_id')
        .eq('id', pid)
        .maybeSingle();
    }
    project = sel.data || null;
  }

  const crmIds = uniqIds([
    lead?.assigned_to,
    lead?.lead_owner_id,
    project?.sales_person_id,
    project?.designer_id,
    project?.design_person_id,
  ]);
  const sxIds = uniqIds([project?.production_person_id]);
  const vcIds = uniqIds([
    project?.logistics_person_id,
    project?.installer_person_id,
    project?.installation_person_id,
  ]);

  return {
    userIds: uniqIds([...crmIds, ...sxIds, ...vcIds]),
    crmIds,
    sxIds,
    vcIds,
    leadId: lead?.id || leadId || null,
    projectId: pid || null,
  };
}

/**
 * Toàn bộ người trên dự án: thành viên deal + NV xưởng + người phụ trách các khối.
 */
async function collectProjectEventParticipantIds({ leadId = null, projectId = null } = {}) {
  const owners = await collectDealModuleResponsibleUserIds({ leadId, projectId });
  const extra = [];
  const lid = owners.leadId;
  const pid = owners.projectId;

  if (lid) {
    try {
      const { data } = await supabase.from('lead_members').select('user_id').eq('lead_id', lid);
      extra.push(...(data || []).map((r) => r.user_id));
    } catch (_) { /* ignore */ }
  }

  if (pid) {
    try {
      const { data } = await supabase.from('project_production_staff').select('user_id').eq('project_id', pid);
      extra.push(...(data || []).map((r) => r.user_id));
    } catch (_) { /* ignore */ }
    try {
      const { data: p } = await supabase
        .from('projects')
        .select('consulting_person_id, quotation_person_id, contract_person_id, shipping_person_id, care_person_id, project_manager_id, supervisor_id')
        .eq('id', pid)
        .maybeSingle();
      if (p) extra.push(...Object.values(p));
    } catch (_) { /* ignore */ }
  }

  return {
    ...owners,
    userIds: uniqIds([...owners.userIds, ...extra.filter((id) => isUuid(id))]),
  };
}

module.exports = {
  collectDealModuleResponsibleUserIds,
  collectProjectEventParticipantIds,
  isInstallationEventType,
  shouldInviteAllModuleOwners,
  ALL_MODULE_OWNER_EVENT_TYPES,
};
