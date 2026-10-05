'use strict';

// Legacy merge still spans HTTP writes. This is an authorization checkpoint,
// not a transaction or a reusable permit. Never accept actor/scope from body.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LEADS = 500;
const LEAD_SELECT = 'id,company_id,customer_id,type,pipeline_id,region_id,assigned_to,lead_owner_id';
const error = (code, status, message) => Object.assign(new Error(message), { code, status });
const denied = () => error('CRM_MERGE_FORBIDDEN', 403, 'Không có quyền gộp toàn bộ hồ sơ đã chọn.');
const unavailable = () => error('CRM_MERGE_UNAVAILABLE', 503, 'Chưa xác minh được dữ liệu gộp. Giữ hồ sơ nguồn và đối soát trước khi thử lại.');
const normalizeId = value => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;

async function checkedMergeResult(call) {
  let result;
  try { result = await call; } catch (_) { throw unavailable(); }
  if (!result || result.error) throw unavailable();
  return result;
}
async function mergeRows(call) {
  const result = await checkedMergeResult(call);
  if (!Array.isArray(result.data)) throw unavailable();
  return result.data;
}
async function mergeRow(call) {
  const result = await checkedMergeResult(call);
  if (!result.data || Array.isArray(result.data) || typeof result.data !== 'object') throw unavailable();
  return result.data;
}
function normalizeMergeIds(keepId, deleteIds) {
  const keep = normalizeId(keepId);
  if (!keep || !Array.isArray(deleteIds) || !deleteIds.length || deleteIds.length >= MAX_LEADS
      || deleteIds.some(x => !normalizeId(x))) {
    throw error('CRM_MERGE_INVALID', 400, 'Chọn từ 2 đến 500 hồ sơ hợp lệ để gộp.');
  }
  const sources = [...new Set(deleteIds.map(normalizeId))].filter(x => x !== keep);
  if (!sources.length) throw error('CRM_MERGE_INVALID', 400, 'Cần hồ sơ nguồn khác hồ sơ giữ lại.');
  return { keepId: keep, deleteIds: sources, allIds: [keep, ...sources] };
}

async function loadMergeActor(db, req) {
  const id = normalizeId(req?.user?.userId || req?.user?.id);
  if (!id) throw denied();
  const actor = await mergeRow(db.from('users').select('id,role,company_id,tenant_id,is_active').eq('id', id).maybeSingle());
  if (actor.id !== id || actor.is_active !== true || !String(actor.role || '').trim()) throw denied();
  return { ...actor, role: String(actor.role || '').trim().toLowerCase() };
}
async function assertMergeCompany(db, actor, companyId) {
  const id = normalizeId(companyId);
  if (!id) throw denied();
  const company = await mergeRow(db.from('companies').select('id,tenant_id,is_active').eq('id', id).maybeSingle());
  if (company.id !== id || company.is_active === false) throw denied();
  if (company.tenant_id) {
    const tenant = await mergeRow(db.from('tenants').select('id,is_active').eq('id', company.tenant_id).maybeSingle());
    if (tenant.id !== company.tenant_id || tenant.is_active !== true) throw denied();
  }
  if (actor.role === 'platform_admin') return company;
  const sameTenant = (actor.tenant_id || null) === (company.tenant_id || null);
  if (actor.role === 'ecosystem_admin' || (actor.role === 'admin' && !actor.company_id)) {
    if (!actor.tenant_id || !sameTenant) throw denied();
  } else if (actor.company_id !== id || !sameTenant) throw denied();
  return company;
}
function companyAdmin(actor) {
  return ['platform_admin', 'ecosystem_admin', 'admin', 'sales_admin', 'crm_production_admin'].includes(actor.role);
}

async function assertLeadMergeAuthority(db, actor, lead, { deleting = false } = {}) {
  // A view/member/task grant does not authorize destruction of an entire Lead.
  // Region admin membership is read now, not taken from a cached token.
  if (companyAdmin(actor)) return;
  if (actor.role === 'region_admin') {
    if (!normalizeId(lead.region_id)) throw denied();
    const region = await mergeRow(db.from('company_regions').select('id,company_id,is_active').eq('id', lead.region_id).maybeSingle());
    if (region.id !== lead.region_id || region.company_id !== lead.company_id || region.is_active !== true) throw denied();
    const memberships = await mergeRows(db.from('user_company_regions').select('region_id')
      .eq('user_id', actor.id).eq('region_id', lead.region_id));
    if (!memberships.some(x => x.region_id === lead.region_id)) throw denied();
    return;
  }
  if (lead.assigned_to !== actor.id && lead.lead_owner_id !== actor.id) throw denied();
  if (deleting) {
    if (!normalizeId(lead.pipeline_id)) throw unavailable();
    const pipeline = await mergeRow(db.from('crm_pipelines')
      .select('id,company_id,allow_employee_delete_lead,allow_employee_delete_deal').eq('id', lead.pipeline_id).maybeSingle());
    if (pipeline.company_id !== lead.company_id || pipeline.id !== lead.pipeline_id) throw denied();
    const flag = lead.type === 'deal' ? 'allow_employee_delete_deal' : 'allow_employee_delete_lead';
    if (pipeline[flag] === false) throw denied();
    if (typeof pipeline[flag] !== 'boolean') throw unavailable();
  }
}

async function assertLegacyLeadMergeAccess(db, req, rawKeepId, rawDeleteIds, { mergeCustomers = false } = {}) {
  const ids = normalizeMergeIds(rawKeepId, rawDeleteIds);
  const actor = await loadMergeActor(db, req);
  const leads = await mergeRows(db.from('crm_leads').select(LEAD_SELECT).in('id', ids.allIds));
  if (leads.length !== ids.allIds.length || new Set(leads.map(x => x.id)).size !== ids.allIds.length) throw denied();
  const byId = new Map(leads.map(x => [x.id, x]));
  const keep = byId.get(ids.keepId);
  if (!keep || !['lead', 'deal'].includes(keep.type)) throw denied();
  const company = await assertMergeCompany(db, actor, keep.company_id);
  for (const id of ids.allIds) {
    const lead = byId.get(id);
    if (!lead || lead.company_id !== company.id || lead.type !== keep.type) throw denied();
    await assertLeadMergeAuthority(db, actor, lead, { deleting: id !== ids.keepId });
  }
  const customerIds = [...new Set(leads.map(x => x.customer_id).filter(Boolean))];
  if (customerIds.length) {
    const customers = await mergeRows(db.from('customers').select('id,company_id').in('id', customerIds));
    if (customers.length !== customerIds.length || customerIds.some(id => !customers.some(c => c.id === id && c.company_id === company.id))) throw denied();
  }
  // The old Customer helper reassigns every dependent, including unselected or
  // cross-company records. Until that command has a complete authorized scope
  // and transactional preservation, no role can use it through this checkpoint.
  if (mergeCustomers && customerIds.length > 1) {
    throw error('CRM_CUSTOMER_MERGE_REVIEW_REQUIRED', 409,
      'Các hồ sơ thuộc những bản ghi khách hàng khác nhau. Cần đối soát đầy đủ liên kết trước khi gộp; chưa chuyển hoặc xóa hồ sơ.');
  }
  return { ...ids, actor, companyId: company.id, leads, customerIds };
}

async function legacyCleanupScope(db, req) {
  const actor = await loadMergeActor(db, req);
  if (!companyAdmin(actor)) throw denied();
  const explicit = req?.body?.company_id;
  const wide = actor.role === 'platform_admin' || actor.role === 'ecosystem_admin' || (actor.role === 'admin' && !actor.company_id);
  const companyId = wide ? (explicit || actor.company_id) : actor.company_id;
  if (explicit && explicit !== companyId) throw denied();
  const company = await assertMergeCompany(db, actor, companyId);
  return { actor, companyId: company.id };
}

module.exports = { checkedMergeResult, mergeRows, mergeRow, normalizeMergeIds,
  assertLegacyLeadMergeAccess, legacyCleanupScope, MAX_LEADS };
