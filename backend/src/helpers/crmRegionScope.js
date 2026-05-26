const {
  isCrmSystemAdminUser,
  isCrmCompanyAdminUser,
  isCrmRegionAdminUser,
  isCrmSalesAdminUser,
} = require('./crmAccessRoles');

/** UUID hợp lệ từ token / body */
function normalizeRegionIdList(raw) {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const s = String(x ?? '').trim();
    if (!s || !re.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Phạm vi region_id áp lên truy vấn crm_leads.
 * - Admin hệ thống / admin công ty: không ép region (client có thể truyền region_id query sau này).
 * - region_admin: bắt buộc trong danh sách khu vực của user.
 * - User khác: nếu có crm_region_ids trên JWT → chỉ các lead thuộc khu vực đó (cộng hưởng lọc assigned ở route).
 */
/** Admin / sales_admin công ty: gán khu vực tùy ý trong công ty (không khóa theo user_company_regions). */
function userCanAssignAnyCrmRegion(user) {
  return isCrmSystemAdminUser(user) || isCrmCompanyAdminUser(user) || isCrmSalesAdminUser(user);
}

function getCrmLeadRegionConstraint(req) {
  const user = req.user;
  if (!user) return { mode: 'none', ids: [] };
  if (userCanAssignAnyCrmRegion(user)) {
    return { mode: 'none', ids: [] };
  }
  const ids = normalizeRegionIdList(user.crm_region_ids);
  if (isCrmRegionAdminUser(user)) {
    return { mode: 'in', ids, required: true };
  }
  if (ids.length) {
    return { mode: 'in', ids, required: false };
  }
  return { mode: 'none', ids: [] };
}

function applyCrmLeadRegionFilterToQuery(q, req) {
  const c = getCrmLeadRegionConstraint(req);
  if (c.mode !== 'in') return q;
  if (!c.ids.length) {
    return q.eq('region_id', '00000000-0000-0000-0000-000000000000');
  }
  return q.in('region_id', c.ids);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
async function fetchUserCrmRegionIds(supabase, userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('user_company_regions')
    .select('region_id')
    .eq('user_id', userId);
  if (error) {
    console.warn('[crmRegionScope] fetchUserCrmRegionIds:', error.message);
    return [];
  }
  return normalizeRegionIdList((data || []).map((r) => r.region_id));
}

async function assertRegionBelongsToCompany(_supabase, companyId, regionId) {
  if (!companyId || !regionId) return { ok: false, error: 'Thiếu khu vực hoặc công ty' };
  // Cache L1+L2 cho region metadata (slow-changing taxonomy).
  // Lưu ý: tham số `supabase` cũ giữ lại để không phá callsite; helper dùng client mặc định.
  const { getRegionMetaById } = require('./crmTaxonomyCache');
  const data = await getRegionMetaById(regionId);
  if (!data) return { ok: false, error: 'Khu vực không tồn tại' };
  if (data.is_active === false) return { ok: false, error: 'Khu vực đã tắt' };
  if (String(data.company_id) !== String(companyId)) return { ok: false, error: 'Khu vực không thuộc công ty đã chọn' };
  return { ok: true };
}

function assertLeadReadableByRegionScope(req, leadRow) {
  const c = getCrmLeadRegionConstraint(req);
  if (c.mode !== 'in' || !c.ids?.length) return { ok: true };
  const rid = leadRow?.region_id;
  if (!rid || !c.ids.includes(String(rid))) {
    return { ok: false, error: 'Không có quyền xem lead/deal khu vực này' };
  }
  return { ok: true };
}

/** Gán region_id lên lead/deal — NV chỉ được chọn khu vực trong crm_region_ids (trừ admin / sales_admin). */
function assertUserCanAssignCrmRegion(req, regionId) {
  if (!regionId) return { ok: true };
  if (userCanAssignAnyCrmRegion(req?.user)) return { ok: true };
  const c = getCrmLeadRegionConstraint(req);
  if (c.mode === 'in' && c.ids?.length && !c.ids.includes(String(regionId))) {
    return { ok: false, error: 'Không gán khu vực ngoài phạm vi được phân cho bạn' };
  }
  return { ok: true };
}

module.exports = {
  normalizeRegionIdList,
  getCrmLeadRegionConstraint,
  applyCrmLeadRegionFilterToQuery,
  fetchUserCrmRegionIds,
  assertLeadReadableByRegionScope,
  assertRegionBelongsToCompany,
  userCanAssignAnyCrmRegion,
  assertUserCanAssignCrmRegion,
};
