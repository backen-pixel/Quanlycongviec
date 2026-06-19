const { supabase } = require('../config/supabase');
const { normalizeEmail } = require('./adminRole');
const {
  isAccountingUser,
  getAccountingCompanyId,
  crmDealBelongsToAccountingCompany,
  getAccountingClientProjectIdsAtWorkshop,
  getAccountingScopedProjectIds,
} = require('./accountingScope');

/** Kế toán VPT — chỉ xem SX các deal được thêm tab Thành viên (lead_members). */
const DEAL_PARTICIPANT_PRODUCTION_EMAILS = new Set([
  'ketoanvanphuthanh.vpt@gmail.com',
  'ketoan1@vpt.vn',
]);

/** Legacy email — role `accounting` dùng isAccountingUser. */
const CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS = new Set([]);

/** UUID công ty SX — đồng bộ với DB prod (HCB, Metalla). */
const METALLA_HUCABI_COMPANY_ID_SET = new Set([
  '18c2563f-3495-498d-8199-23200c9f420e', // Công ty Hucabi
  'b78baba2-2486-434c-a72d-9c937fac2164', // Công Ty Metalla
]);

let cachedMetallaHucabiIds = null;

let cachedVptCompanyId = null;

const VPT_COMPANY_ID_FALLBACK = '991dc79d-cbf5-49f9-a364-35227cb47635';

function isVptCompanyIdSync(companyId) {
  if (!companyId) return false;
  if (cachedVptCompanyId) return String(companyId) === String(cachedVptCompanyId);
  return String(companyId) === VPT_COMPANY_ID_FALLBACK;
}

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
  if (CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS.has(normalizeEmail(user?.email))) return true;
  return isAccountingUser(user);
}

/** NV kế toán / cross-viewer được chọn công ty Metalla/Hucabi/VPT trên query SX. */
function canCrossWorkshopProductionViewerUseCompanyQuery(user, queryCompanyId) {
  if (isAccountingUser(user)) {
    const ac = getAccountingCompanyId(user);
    const q = queryCompanyId != null ? String(queryCompanyId).trim() : '';
    if (!q || !ac) return false;
    if (q === ac) return true;
    return isMetallaOrHucabiCompanyIdSync(q);
  }
  if (!CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS.has(normalizeEmail(user?.email))) return false;
  const q = queryCompanyId != null ? String(queryCompanyId).trim() : '';
  if (!q) return false;
  return isMetallaOrHucabiCompanyIdSync(q) || isVptCompanyIdSync(q);
}

/** Participant-only: VPT theo lead_members; Metalla/Hucabi lọc deal VPT riêng. */
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

let cachedVptCompanyLabel = null;

async function resolveVptCompanyLabel() {
  if (cachedVptCompanyLabel) return cachedVptCompanyLabel;
  const vptId = await resolveVptCompanyId();
  if (!vptId) return 'Vạn Phú Thành';
  const { data } = await supabase.from('companies').select('name, short_name').eq('id', vptId).maybeSingle();
  cachedVptCompanyLabel = data?.short_name || data?.name || 'Vạn Phú Thành';
  return cachedVptCompanyLabel;
}

/** Deal CRM gắn công ty khách: company_id, external_company_id hoặc tên text (legacy). */
function crmDealRowIsClientCompanyRelated(dealRow, clientCompanyId) {
  if (!dealRow || !clientCompanyId) return false;
  if (String(dealRow.company_id || '') === String(clientCompanyId)) return true;
  if (dealRow.external_company_id && String(dealRow.external_company_id) === String(clientCompanyId)) return true;
  const ext = String(dealRow.external_company_name || '').toLowerCase();
  if (!ext) return false;
  if (isVptCompanyIdSync(clientCompanyId)) {
    return (
      ext.includes('vạn phú')
      || ext.includes('van phu')
      || ext.includes('vpt')
      || ext.includes('vạn phú thành')
    );
  }
  return false;
}

/** @deprecated alias — dùng crmDealRowIsClientCompanyRelated */
function crmDealRowIsVptRelated(dealRow, vptId) {
  return crmDealRowIsClientCompanyRelated(dealRow, vptId);
}

/**
 * Dự án tại xưởng HCB/Metalla có deal liên quan Vạn Phú Thành.
 */
async function getVptRelatedProjectIdsAtWorkshop(workshopCompanyId) {
  if (!workshopCompanyId) return [];
  const vptId = await resolveVptCompanyId();
  if (!vptId) return [];

  const { data: projects, error: pErr } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', workshopCompanyId);
  if (pErr) {
    console.warn('[dealParticipantProduction] projects at workshop:', pErr.message);
    return [];
  }
  const projectIds = (projects || []).map((p) => p.id).filter(Boolean);
  if (!projectIds.length) return [];

  const { data: deals, error: dErr } = await supabase
    .from('crm_leads')
    .select('project_id, company_id, external_company_id, external_company_name, type, parent_lead_id')
    .eq('type', 'deal')
    .in('project_id', projectIds);
  if (dErr) {
    console.warn('[dealParticipantProduction] crm_leads at workshop:', dErr.message);
    return [];
  }

  const matched = new Set();
  for (const d of deals || []) {
    if (!d.project_id) continue;
    if (crmDealRowIsVptRelated(d, vptId)) {
      matched.add(String(d.project_id));
    }
  }
  return [...matched];
}

/**
 * Deal VPT đang SX — lọc thêm theo công ty xưởng thực hiện (projects.company_id).
 */
async function filterProjectIdsBySxWorkshopCompany(projectIds, sxWorkshopCompanyId) {
  if (!sxWorkshopCompanyId || !projectIds?.length) return projectIds || [];
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .in('id', projectIds)
    .eq('company_id', sxWorkshopCompanyId);
  if (error) {
    console.warn('[dealParticipantProduction] filterProjectIdsBySxWorkshopCompany:', error.message);
    return [];
  }
  return (data || []).map((p) => String(p.id));
}

async function userCanAccessCrossWorkshopProductionProject(user, projectId) {
  if (!isCrossWorkshopProductionViewer(user) || !projectId) return false;
  const { data: proj } = await supabase
    .from('projects')
    .select('company_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!proj?.company_id) return false;

  const clientCoId = isAccountingUser(user)
    ? getAccountingCompanyId(user)
    : await resolveVptCompanyId();

  if (await isMetallaOrHucabiCompanyId(proj.company_id)) {
    if (!clientCoId) return false;
    const ids = await getAccountingClientProjectIdsAtWorkshop(proj.company_id, clientCoId);
    return ids.some((id) => String(id) === String(projectId));
  }
  if (clientCoId && String(proj.company_id) === String(clientCoId)) {
    if (isAccountingUser(user)) return true;
    return userCanAccessProductionProjectAsParticipant(user?.userId, projectId, user);
  }
  return false;
}

/**
 * Kanban SX — kế toán cross-viewer:
 * HCB/Metalla: chỉ deal liên quan VPT; VPT: lead_members + lọc xưởng (sx_workshop_company_id).
 */
async function applyCrossWorkshopVptProductionFilter(query, user, {
  workshopCompanyId = null,
  sxWorkshopCompanyId = null,
} = {}) {
  if (!isCrossWorkshopProductionViewer(user)) {
    return { query, memberProjectIds: null };
  }

  const clientCoId = isAccountingUser(user)
    ? getAccountingCompanyId(user)
    : await resolveVptCompanyId();

  const isPartnerWorkshop = workshopCompanyId && await isMetallaOrHucabiCompanyId(workshopCompanyId);
  const isClientWorkshopChip = clientCoId && workshopCompanyId && String(workshopCompanyId) === String(clientCoId);

  if (isPartnerWorkshop && clientCoId) {
    const ids = await getAccountingClientProjectIdsAtWorkshop(workshopCompanyId, clientCoId);
    if (!ids.length) {
      return { query: query.in('id', ['00000000-0000-0000-0000-000000000000']), memberProjectIds: [] };
    }
    return { query: query.in('id', ids), memberProjectIds: ids };
  }

  if (isClientWorkshopChip && isAccountingUser(user)) {
    let projectIds = await getAccountingScopedProjectIds(clientCoId);
    if (sxWorkshopCompanyId) {
      projectIds = await filterProjectIdsBySxWorkshopCompany(projectIds, sxWorkshopCompanyId);
    }
    if (!projectIds.length) {
      return { query: query.in('id', ['00000000-0000-0000-0000-000000000000']), memberProjectIds: [] };
    }
    return { query: query.in('id', projectIds), memberProjectIds: projectIds };
  }

  if (isClientWorkshopChip && userNeedsParticipantOnlyProductionScope(user)) {
    let memberProjectIds = await getLeadMemberProjectIdsForUser(user?.userId);
    if (sxWorkshopCompanyId) {
      memberProjectIds = await filterProjectIdsBySxWorkshopCompany(memberProjectIds, sxWorkshopCompanyId);
    }
    if (!memberProjectIds.length) {
      return { query: query.in('id', ['00000000-0000-0000-0000-000000000000']), memberProjectIds: [] };
    }
    return { query: query.in('id', memberProjectIds), memberProjectIds };
  }

  return { query, memberProjectIds: null };
}

async function ensureVptExternalCompanyCatalogForWorkshop(workshopCompanyId, userId = null) {
  if (!(await isMetallaOrHucabiCompanyId(workshopCompanyId))) return null;
  try {
    const { upsertProductionExternalCompany } = require('./productionExternalCompanies');
    const { ensureWorkshopClientCompanyLink } = require('./productionClientCompanies');
    const vptId = await resolveVptCompanyId();
    const label = await resolveVptCompanyLabel();
    const saved = await upsertProductionExternalCompany({
      productionCompanyId: workshopCompanyId,
      name: label,
      userId,
      linkedCompanyId: vptId,
    });
    if (vptId) await ensureWorkshopClientCompanyLink(workshopCompanyId, vptId);
    return saved;
  } catch (e) {
    console.warn('[dealParticipantProduction] ensureVptExternalCompanyCatalog:', e.message);
    return null;
  }
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

async function getDealCompanyAutoParticipantUserIds(dealCompanyId, externalCompanyId = null) {
  const targetCo = externalCompanyId ? String(externalCompanyId) : (dealCompanyId ? String(dealCompanyId) : null);
  if (!targetCo) return [];

  const { data: accountingUsers, error: accErr } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'accounting')
    .eq('company_id', targetCo)
    .eq('is_active', true);
  if (!accErr && (accountingUsers || []).length) {
    return accountingUsers.map((u) => String(u.id));
  }

  if (await isVptDealCompany(targetCo)) {
    return resolveConfiguredProductionParticipantUserIds();
  }
  return [];
}

/**
 * Tự thêm thành viên đã cấu hình (kế toán VPT) vào tab Thành viên khi deal vào SX.
 * Không ghi đè role responsible hiện có.
 */
async function ensureDealProductionAutoParticipants({ dealId, dealCompanyId, addedBy = null }) {
  if (!dealId) return { added: 0, skipped: true };
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('company_id, external_company_id, project_id')
    .eq('id', dealId)
    .maybeSingle();
  const companyId = dealCompanyId || lead?.company_id || null;
  const externalCompanyId = lead?.external_company_id || null;
  if (!companyId && !externalCompanyId) return { added: 0, skipped: true };
  const userIds = await getDealCompanyAutoParticipantUserIds(companyId, externalCompanyId);
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

/** Kanban SX chỉ hiện dự án gắn deal mình tham gia (lead_members) — không áp dụng role accounting. */
function userNeedsParticipantOnlyProductionScope(user) {
  if (isAccountingUser(user)) return false;
  return isDealParticipantProductionViewer(user);
}

/** Báo giá / ĐH / HĐ — xem toàn công ty (role accounting hoặc kế toán VPT cũ). */
function isVptCompanyCommercialDocViewer(user) {
  return isAccountingUser(user) || isDealParticipantProductionViewer(user);
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
    return userCanAccessCrossWorkshopProductionProject(user, projectId);
  }
  const ids = await getLeadMemberProjectIdsForUser(userId);
  return ids.some((id) => String(id) === String(projectId));
}

/**
 * Phạm vi dự án SX / Lắp đặt — kế toán (accounting) + cross-viewer legacy.
 * HCB/Metalla: chỉ dự án có deal thuộc công ty kế toán (external_company_id).
 */
async function applyWorkshopProjectVisibilityScope(query, user, workshopCompanyId = null, sxWorkshopCompanyId = null) {
  if (isCrossWorkshopProductionViewer(user)) {
    const acId = isAccountingUser(user) ? getAccountingCompanyId(user) : null;
    const vptId = acId || await resolveVptCompanyId();
    const isPartner = workshopCompanyId && isMetallaOrHucabiCompanyIdSync(workshopCompanyId);
    const isOwnChip = vptId && workshopCompanyId && String(workshopCompanyId) === String(vptId);
    if (isPartner || isOwnChip || (isOwnChip && userNeedsParticipantOnlyProductionScope(user))) {
      return applyCrossWorkshopVptProductionFilter(query, user, {
        workshopCompanyId,
        sxWorkshopCompanyId,
      });
    }
  }
  if (!(await userNeedsParticipantOnlyProductionScopeForWorkshop(user, workshopCompanyId))) {
    return { query, memberProjectIds: null };
  }
  let memberProjectIds = await getLeadMemberProjectIdsForUser(user?.userId);
  if (sxWorkshopCompanyId && memberProjectIds.length) {
    memberProjectIds = await filterProjectIdsBySxWorkshopCompany(memberProjectIds, sxWorkshopCompanyId);
  }
  if (!memberProjectIds.length) {
    return { query: query.in('id', ['00000000-0000-0000-0000-000000000000']), memberProjectIds: [] };
  }
  return { query: query.in('id', memberProjectIds), memberProjectIds };
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
  isVptCompanyIdSync,
  resolveVptCompanyId,
  resolveVptCompanyLabel,
  isVptDealCompany,
  crmDealRowIsVptRelated,
  crmDealRowIsClientCompanyRelated,
  getVptRelatedProjectIdsAtWorkshop,
  filterProjectIdsBySxWorkshopCompany,
  applyCrossWorkshopVptProductionFilter,
  applyWorkshopProjectVisibilityScope,
  ensureVptExternalCompanyCatalogForWorkshop,
  resolveConfiguredProductionParticipantUserIds,
  getDealCompanyAutoParticipantUserIds,
  ensureDealProductionAutoParticipants,
  ensureProjectProductionAutoParticipants,
};
