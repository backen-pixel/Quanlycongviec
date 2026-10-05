/**
 * Phạm vi dữ liệu của khoá đối tác: HỆ SINH THÁI → CÔNG TY → PAGE.
 *
 * Fail-closed: không suy ra được hệ sinh thái hoặc công ty nào thì khoá
 * KHÔNG thấy gì, chứ không mở toàn bộ. Trong DB có hai công ty trùng tên
 * ở hai hệ sinh thái khác nhau nên đây là chỗ dễ rò dữ liệu nhất.
 *
 *   1. tenant_id   — cột trên khoá, hoặc suy từ công ty / chủ khoá
 *   2. company_ids — company_id → allowed_company_ids → mọi công ty trong hệ sinh thái
 *   3. page_ids    — allowed_page_ids (khai tay) → mọi page của các công ty trên
 */
const { supabase } = require('../config/supabase');

const CACHE_MS = 60000;
const _cache = new Map();
const CONG_TY_RONG = '00000000-0000-0000-0000-000000000000';

function xoaCachePhamVi(keyId) {
  if (keyId) _cache.delete(String(keyId));
  else _cache.clear();
}

function ds(v) {
  return Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : [];
}

function phamViRong(lyDo, tenantId, tenantName) {
  return {
    hop_le: false,
    ly_do: lyDo,
    tenant_id: tenantId || null,
    tenant_name: tenantName || null,
    company_ids: [],
    companies: [],
    page_ids: [],
    pages: [],
    page_ids_khai_tay: [],
  };
}

async function tenantCuaChuKhoa(keyRow) {
  const ownerId = (keyRow && (keyRow.created_by || keyRow.default_assigned_to)) || null;
  if (!ownerId) return null;
  try {
    const { data } = await supabase.from('users').select('tenant_id, company_id').eq('id', ownerId).maybeSingle();
    if (data && data.tenant_id) return String(data.tenant_id);
    if (data && data.company_id) {
      const { data: c } = await supabase.from('companies').select('tenant_id').eq('id', data.company_id).maybeSingle();
      if (c && c.tenant_id) return String(c.tenant_id);
    }
  } catch (e) {
    console.warn('[pham-vi] tenant chu khoa:', e.message);
  }
  return null;
}

async function giaiPhamVi(keyRow) {
  if (!keyRow || !keyRow.id) return phamViRong('thieu_khoa');
  const ck = String(keyRow.id);
  const hit = _cache.get(ck);
  if (hit && Date.now() < hit.exp) return hit.scope;

  const luu = (scope) => {
    _cache.set(ck, { scope, exp: Date.now() + CACHE_MS });
    return scope;
  };

  let tenantId = keyRow.tenant_id ? String(keyRow.tenant_id) : null;
  if (!tenantId && keyRow.company_id) {
    const { data } = await supabase.from('companies').select('tenant_id').eq('id', keyRow.company_id).maybeSingle();
    if (data && data.tenant_id) tenantId = String(data.tenant_id);
  }
  if (!tenantId) tenantId = await tenantCuaChuKhoa(keyRow);
  if (!tenantId) return luu(phamViRong('khong_xac_dinh_he_sinh_thai'));

  const { data: tenantRow } = await supabase.from('tenants').select('id, name').eq('id', tenantId).maybeSingle();
  const tenantName = tenantRow ? tenantRow.name : null;

  const { data: ctTrongHst } = await supabase
    .from('companies').select('id, name').eq('tenant_id', tenantId).order('name');
  const trongHst = ctTrongHst || [];
  const idTrongHst = new Set(trongHst.map((c) => String(c.id)));

  let companyIds;
  if (keyRow.company_id && idTrongHst.has(String(keyRow.company_id))) {
    companyIds = [String(keyRow.company_id)];
  } else {
    const khai = ds(keyRow.allowed_company_ids).filter((id) => idTrongHst.has(id));
    companyIds = khai.length ? khai : trongHst.map((c) => String(c.id));
  }

  const companies = trongHst
    .filter((c) => companyIds.indexOf(String(c.id)) >= 0)
    .map((c) => ({ id: String(c.id), name: c.name }));
  if (!companies.length) return luu(phamViRong('he_sinh_thai_khong_co_cong_ty_hop_le', tenantId, tenantName));

  const { data: pageRows } = await supabase
    .from('facebook_pages')
    .select('page_id, page_name, default_company_id, is_active')
    .in('default_company_id', companies.map((c) => c.id));
  const pagesCuaCT = (pageRows || []).map((p) => ({
    page_id: String(p.page_id),
    page_name: p.page_name || null,
    company_id: p.default_company_id ? String(p.default_company_id) : null,
    is_active: p.is_active !== false,
  }));

  const khaiTay = ds(keyRow.allowed_page_ids);
  const hopLeKhaiTay = khaiTay.filter((pid) => pagesCuaCT.some((p) => p.page_id === pid));
  const pages = hopLeKhaiTay.length
    ? pagesCuaCT.filter((p) => hopLeKhaiTay.indexOf(p.page_id) >= 0)
    : pagesCuaCT;

  return luu({
    hop_le: true,
    ly_do: null,
    tenant_id: tenantId,
    tenant_name: tenantName,
    company_ids: companies.map((c) => c.id),
    companies,
    page_ids: pages.map((p) => p.page_id),
    pages,
    page_ids_khai_tay: hopLeKhaiTay,
  });
}

/** Áp lọc công ty lên query Supabase. Phạm vi rỗng → không trả gì. */
function locTheoCongTy(q, scope, cot) {
  const c = cot || 'company_id';
  if (!scope || !scope.company_ids || !scope.company_ids.length) return q.eq(c, CONG_TY_RONG);
  return q.in(c, scope.company_ids);
}

/** Lọc page trên query lead_attribution — chỉ khi khoá khai page cụ thể. */
function locTheoPage(q, scope, cot) {
  const c = cot || 'fb_page_id';
  const l = scope && scope.page_ids_khai_tay;
  if (!l || !l.length) return q;
  return q.in(c, l);
}

/** Lọc mảng dòng quy kết đã nạp vào RAM theo page khai tay. */
function locMangTheoPage(rows, scope) {
  const l = scope && scope.page_ids_khai_tay;
  if (!l || !l.length) return rows || [];
  const bo = new Set(l);
  return (rows || []).filter((r) => bo.has(String(r.fb_page_id || '')));
}

module.exports = {
  giaiPhamVi,
  locTheoCongTy,
  locTheoPage,
  locMangTheoPage,
  xoaCachePhamVi,
  CONG_TY_RONG,
};
