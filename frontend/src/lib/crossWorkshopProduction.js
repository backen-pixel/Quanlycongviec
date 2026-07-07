import { isProductionAdmin, isProductionStaff, isSystemAdmin } from './adminRole';

/** Legacy email list — ưu tiên role `accounting` (isAccountingUser). */
export const CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS = new Set([]);

export function isAccountingUser(user) {
  return String(user?.role || '').trim().toLowerCase() === 'accounting'
    && user?.company_id != null
    && String(user.company_id).trim() !== '';
}

/** NV gắn công ty CRM — chọn xưởng SX, deal lọc theo công ty họ (backend). */
export function isCrossWorkshopProductionViewer(user) {
  if (isAccountingUser(user)) return true;
  const email = String(user?.email || '').trim().toLowerCase();
  if (CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS.has(email)) return true;
  return user?.company_id != null && String(user.company_id).trim() !== '';
}

export function isMetallaOrHucabiCompany(company) {
  if (!company) return false;
  const sn = String(company.short_name || '').trim().toUpperCase();
  const name = String(company.name || '').trim().toLowerCase();
  return sn === 'HCB' || name.includes('metalla') || name.includes('hucabi');
}

/** Bộ lọc 1 — xưởng / công ty thực hiện sản xuất (HCB, Metalla…). */
export function productionWorkshopFilterCompanies(companies) {
  return (companies || []).filter(isMetallaOrHucabiCompany);
}

/** Bộ lọc 2 — hiện khi NV thuộc công ty CRM (không phải NV xưởng HCB/Metalla). */
export function shouldShowDealCompanyFilter(user, companies) {
  if (isSystemAdmin(user)) return true;
  if (!user?.company_id) return false;
  return !isMetallaOrHucabiCompanyId(user.company_id, companies);
}

/** Danh sách chip «Deal công ty». */
export function dealCompanyFilterOptions(companies, user) {
  if (isSystemAdmin(user)) return companies || [];
  const cid = user?.company_id ? String(user.company_id) : '';
  if (!cid) return [];
  const own = (companies || []).find((c) => String(c.id) === cid);
  return own ? [own] : [{ id: cid, name: cid, short_name: cid }];
}

export function isCrmCompanyProductionViewer(user) {
  if (!user?.company_id || !String(user.company_id).trim()) return false;
  const cid = String(user.company_id);
  if (isAccountingUser(user)) return !isMetallaOrHucabiCompanyId(cid, []);
  return !isMetallaOrHucabiCompany(user && { id: cid, short_name: '', name: '' });
}

/** Chip xưởng SX: NV CRM → HCB/Metalla; admin → tất cả công ty module SX. */
export function workshopCompaniesForCrossViewer(companies, user) {
  if (isSystemAdmin(user)) return companies || [];
  return productionWorkshopFilterCompanies(companies);
}

/** @deprecated — dùng productionWorkshopFilterCompanies + dealCompanyFilterOptions */
export function sxWorkshopFilterCompanies(companies, user) {
  return productionWorkshopFilterCompanies(companies);
}

export function isDealParticipantProductionViewer(user) {
  if (isAccountingUser(user)) return false;
  const email = String(user?.email || '').trim().toLowerCase();
  return email === 'ketoanvanphuthanh.vpt@gmail.com' || email === 'ketoan1@vpt.vn';
}

export function isCrossWorkshopProductionViewerUser(user) {
  return isCrossWorkshopProductionViewer(user);
}

export function isVptCompanyChip(companyId, companies, user) {
  if (!companyId) return false;
  if (user?.company_id && String(companyId) === String(user.company_id)) return true;
  const vpt = (companies || []).find((c) => {
    const sn = String(c.short_name || '').trim().toUpperCase();
    const name = String(c.name || '').trim().toLowerCase();
    return sn === 'VPT' || name.includes('vạn phú');
  });
  if (vpt && String(vpt.id) === String(companyId)) return true;
  return false;
}

export function canPickWorkshopCompany(user, isAdmin, isCompanyScopedAdmin) {
  if (isAdmin && !isCompanyScopedAdmin) return true;
  if (user?.company_id) return true;
  if (isProductionAdmin(user) || isProductionStaff(user)) return true;
  return isCrossWorkshopProductionViewer(user);
}

/**
 * Công ty dùng để nạp phân loại xưởng (workshop_project_types).
 * Ưu tiên xưởng thực tế (HCB/Metalla) — không dùng công ty CRM (VPT) làm nguồn phân loại.
 */
export function resolveWorkshopCompanyForTypes({
  filterCompany = '',
  filterSxWorkshopCompany = '',
  userCompanyId = '',
  showVptSxWorkshopFilter = false,
  companies = [],
} = {}) {
  const workshopId = (id) => {
    const s = String(id || '').trim();
    if (!s) return '';
    return isMetallaOrHucabiCompanyId(s, companies) ? s : '';
  };

  if (showVptSxWorkshopFilter && filterSxWorkshopCompany) {
    return workshopId(filterSxWorkshopCompany) || String(filterSxWorkshopCompany);
  }

  const fromFilter = workshopId(filterCompany);
  if (fromFilter) return fromFilter;

  const fromUser = workshopId(userCompanyId);
  if (fromUser) return fromUser;

  return '';
}

/** Công ty chọn khi tạo deal SX tại xưởng (HCB, Metalla). */
export function productionCreateCompanyOptions(companies) {
  return (companies || []).filter(isMetallaOrHucabiCompany);
}

export function findVptCompany(companies) {
  return (companies || []).find((c) => {
    const sn = String(c.short_name || '').trim().toUpperCase();
    const name = String(c.name || '').trim().toLowerCase();
    return sn === 'VPT' || name.includes('vạn phú');
  }) || null;
}

export function isMetallaOrHucabiCompanyId(companyId, companies) {
  if (!companyId) return false;
  const c = (companies || []).find((x) => String(x.id) === String(companyId));
  return c ? isMetallaOrHucabiCompany(c) : false;
}
