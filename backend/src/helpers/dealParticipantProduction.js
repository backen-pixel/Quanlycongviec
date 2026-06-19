const { supabase } = require('../config/supabase');
const { normalizeEmail } = require('./adminRole');

/** Kế toán VPT — chỉ xem SX các deal được thêm tab Thành viên (lead_members). */
const DEAL_PARTICIPANT_PRODUCTION_EMAILS = new Set([
  'ketoanvanphuthanh.vpt@gmail.com',
  'ketoan1@vpt.vn',
]);

/** Xem toàn bộ module SX Metalla + Hucabi (không giới hạn lead_members). */
const CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS = new Set([
  'ketoanvanphuthanh.vpt@gmail.com',
  'phuongcuc5313@gmail.com',
]);

/** UUID công ty SX — đồng bộ với DB prod (HCB, Metalla). */
const METALLA_HUCABI_COMPANY_ID_SET = new Set([
  '18c2563f-3495-498d-8199-23200c9f420e', // Công ty Hucabi
  'b78baba2-2486-434c-a72d-9c937fac2164', // Công Ty Metalla
]);

let cachedMetallaHucabiIds = null;

let cachedVptCompanyId = null;

async function resolveMetallaHucabiCompanyIds() {
  if (cachedMetallaHucabiIds) return cachedMetallaHucabiIds;
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .or('short_name.ilike.HCB,name.ilike.%metalla%');
  if (error) {
    console.warn('[dealParticipantProduction] resolveMetallaHucabiCompanyIds:', error.message);
    cachedMetallaHucabiIds = [...METALLA_HUCABI_COMPANY_ID_SET];
    return cachedMetallaHucabiIds;
  }
  const ids = (data || []).map((c) => String(c.id)).filter(Boolean);
  cachedMetallaHucabiIds = ids.length ? ids : [...METALLA_HUCABI_COMPANY_ID_SET];
  return cachedMetallaHucabiIds;
}

function isMetallaOrHucabiCompanyIdSync(companyId) {
  if (!companyId) return false;
  return METALLA_HUCABI_COMPANY_ID_SET.has(String(companyId));
}

async function isMetallaOrHucabiCompanyId(companyId) {
  if (!companyId) return false;
  if (isMetallaOrHucabiCompanyIdSync(companyId)) return true;
  const ids = await resolveMetallaHucabiCompanyIds();
  return ids.includes(String(companyId));
}

function isCrossWorkshopProductionViewer(user) {
  return CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS.has(normalizeEmail(user?.email));
}

/** NV kế toán được chọn công ty Metalla/Hucabi trên query SX. */
function canCrossWorkshopProductionViewerUseCompanyQuery(user, queryCompanyId) {
  if (!isCrossWorkshopProductionViewer(user)) return false;
  const q = queryCompanyId != null ? String(queryCompanyId).trim() : '';
  if (!q) return false;
  return isMetallaOrHucabiCompanyIdSync(q);
}

async function userCanAccessCrossWorkshopProductionProject(user, projectCompanyId) {
  if (!isCrossWorkshopProductionViewer(user)) return false;
  return isMetallaOrHucabiCompanyId(projectCompanyId);
}

/** Participant-only: VPT theo lead_members; Metalla/Hucabi xem hết khi user được cấu hình. */
async function userNeedsParticipantOnlyProductionScopeForWorkshop(user, workshopCompanyId) {
  if (!userNeedsParticipantOnlyProductionScope(user)) return false;
  if (isCrossWorkshopProductionViewer(user) && workshopCompanyId) {
    if (await isMetallaOrHucabiCompanyId(workshopCompanyId)) return false;
  }
  return true;
}

async function resolveVptCompanyId() {
  if (cachedVptCompanyId) return cachedVptCompanyId;
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .or('name.ilike.%Bếp Vạn Phú%,name.ilike.%Vạn Phú%Thành%,name.ilike.%Van Phu%Thanh%,short_name.ilike.%VPT%')
    .order('name')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[dealParticipantProduction] resolveVptCompanyId:', error.message);
    return null;
  }
  cachedVptCompanyId = data?.id || null;
  return cachedVptCompanyId;
}

/** Deal thuộc công ty Vạn Phú Thành. */
async function isVptDealCompany(companyId) {
  if (!companyId) return false;
  const vptId = await resolveVptCompanyId();
  return !!vptId && String(vptId) === String(companyId);
}

let cachedAutoParticipantUserIds = null;

/** User id các tài khoản được cấu hình tự thêm vào deal VPT khi qua SX. */
async function resolveConfiguredProductionParticipantUserIds() {
  if (cachedAutoParticipantUserIds) return cachedAutoParticipantUserIds;
  const emails = [...DEAL_PARTICIPANT_PRODUCTION_EMAILS];
  const { data, error } = await supabase
    .from('users')
    .select('id, email')
    .eq('is_active', true);
  if (error) {
    console.warn('[dealParticipantProduction] resolve participants:', error.message);
    return [];
  }
  const ids = (data || [])
    .filter((u) => DEAL_PARTICIPANT_PRODUCTION_EMAILS.has(normalizeEmail(u.email)))
    .map((u) => String(u.id));
  cachedAutoParticipantUserIds = ids;
  return ids;
}

async function getDealCompanyAutoParticipantUserIds(dealCompanyId) {
  if (!(await isVptDealCompany(dealCompanyId))) return [];
  return resolveConfiguredProductionParticipantUserIds();
}

/**
 * Tự thêm thành viên đã cấu hình (kế toán VPT) vào tab Thành viên khi deal vào SX.
 * Không ghi đè role responsible hiện có.
 */
async function ensureDealProductionAutoParticipants({ dealId, dealCompanyId, addedBy = null }) {
  if (!dealId) return { added: 0, skipped: true };
  let companyId = dealCompanyId;
  if (!companyId) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('company_id, project_id')
      .eq('id', dealId)
      .maybeSingle();
    companyId = lead?.company_id || null;
    if (!companyId) return { added: 0, skipped: true };
  }
  const userIds = await getDealCompanyAutoParticipantUserIds(companyId);
  if (!userIds.length) return { added: 0, skipped: true };

  const { data: existing } = await supabase
    .from('lead_members')
    .select('user_id, role')
    .eq('lead_id', dealId);
  const existingByUser = new Map((existing || []).map((r) => [String(r.user_id), r.role]));

  const rows = userIds
    .filter((uid) => !existingByUser.has(String(uid)))
    .map((uid) => ({
      lead_id: dealId,
      user_id: uid,
      role: 'member',
      ...(addedBy ? { added_by: addedBy } : {}),
    }));
  if (!rows.length) return { added: 0, skipped: false };

  const { error } = await supabase
    .from('lead_members')
    .upsert(rows, { onConflict: 'lead_id,user_id', ignoreDuplicates: true });
  if (error) {
    console.warn('[dealParticipantProduction] ensureDealProductionAutoParticipants:', error.message);
    return { added: 0, error: error.message };
  }
  return { added: rows.length, skipped: false };
}

/** Mọi deal gắn project — thêm thành viên cấu hình theo company deal. */
async function ensureProjectProductionAutoParticipants(projectId, addedBy = null) {
  if (!projectId) return { added: 0, deals: 0 };
  const { data: deals, error } = await supabase
    .from('crm_leads')
    .select('id, company_id')
    .eq('project_id', projectId)
    .eq('type', 'deal');
  if (error) {
    console.warn('[dealParticipantProduction] ensureProjectProductionAutoParticipants:', error.message);
    return { added: 0, deals: 0 };
  }
  let total = 0;
  for (const deal of deals || []) {
    const r = await ensureDealProductionAutoParticipants({
      dealId: deal.id,
      dealCompanyId: deal.company_id,
      addedBy,
    });
    total += r.added || 0;
  }
  return { added: total, deals: (deals || []).length };
}

function isDealParticipantProductionViewer(user) {
  return DEAL_PARTICIPANT_PRODUCTION_EMAILS.has(normalizeEmail(user?.email));
}

/** Kanban SX chỉ hiện dự án gắn deal mình tham gia (lead_members). */
function userNeedsParticipantOnlyProductionScope(user) {
  return isDealParticipantProductionViewer(user);
}

/** Báo giá / ĐH / HĐ — xem toàn công ty VPT (không chỉ chứng từ do mình tạo). */
function isVptCompanyCommercialDocViewer(user) {
  return isDealParticipantProductionViewer(user);
}

async function getLeadMemberProjectIdsForUser(userId) {
  if (!userId) return [];
  const { data: mems, error: memErr } = await supabase
    .from('lead_members')
    .select('lead_id')
    .eq('user_id', userId);
  if (memErr) {
    console.warn('[dealParticipantProduction] lead_members:', memErr.message);
    return [];
  }
  const leadIds = [...new Set((mems || []).map((m) => m.lead_id).filter(Boolean))];
  if (!leadIds.length) return [];

  const { data: leads, error: leadErr } = await supabase
    .from('crm_leads')
    .select('project_id')
    .in('id', leadIds)
    .not('project_id', 'is', null);
  if (leadErr) {
    console.warn('[dealParticipantProduction] crm_leads:', leadErr.message);
    return [];
  }
  return [...new Set((leads || []).map((l) => l.project_id).filter(Boolean))];
}

async function userCanAccessProductionProjectAsParticipant(userId, projectId, user = null) {
  if (!userId || !projectId) return false;
  if (user && isCrossWorkshopProductionViewer(user)) {
    const { data: proj } = await supabase
      .from('projects')
      .select('company_id')
      .eq('id', projectId)
      .maybeSingle();
    if (await isMetallaOrHucabiCompanyId(proj?.company_id)) return true;
  }
  const ids = await getLeadMemberProjectIdsForUser(userId);
  return ids.some((id) => String(id) === String(projectId));
}

module.exports = {
  DEAL_PARTICIPANT_PRODUCTION_EMAILS,
  CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS,
  isDealParticipantProductionViewer,
  isCrossWorkshopProductionViewer,
  isVptCompanyCommercialDocViewer,
  userNeedsParticipantOnlyProductionScope,
  userNeedsParticipantOnlyProductionScopeForWorkshop,
  getLeadMemberProjectIdsForUser,
  userCanAccessProductionProjectAsParticipant,
  userCanAccessCrossWorkshopProductionProject,
  canCrossWorkshopProductionViewerUseCompanyQuery,
  isMetallaOrHucabiCompanyId,
  isMetallaOrHucabiCompanyIdSync,
  resolveMetallaHucabiCompanyIds,
  resolveVptCompanyId,
  isVptDealCompany,
  resolveConfiguredProductionParticipantUserIds,
  getDealCompanyAutoParticipantUserIds,
  ensureDealProductionAutoParticipants,
  ensureProjectProductionAutoParticipants,
};
