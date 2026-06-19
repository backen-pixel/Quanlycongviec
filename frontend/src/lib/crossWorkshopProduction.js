/** Legacy email list — ưu tiên role `accounting` (isAccountingUser). */
export const CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS = new Set([]);

export function isAccountingUser(user) {
  return String(user?.role || '').trim().toLowerCase() === 'accounting'
    && user?.company_id != null
    && String(user.company_id).trim() !== '';
}

export function isCrossWorkshopProductionViewer(user) {
  if (isAccountingUser(user)) return true;
  const email = String(user?.email || '').trim().toLowerCase();
  return CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS.has(email);
}

export function isMetallaOrHucabiCompany(company) {
  if (!company) return false;
  const sn = String(company.short_name || '').trim().toUpperCase();
  const name = String(company.name || '').trim().toLowerCase();
  return sn === 'HCB' || name.includes('metalla');
}

/** Công ty có thể chọn trên Kanban SX (VPT + Metalla + Hucabi). */
export function workshopCompaniesForCrossViewer(companies, user) {
  if (!isCrossWorkshopProductionViewer(user)) return [];
  const cross = (companies || []).filter(isMetallaOrHucabiCompany);
  const own = user?.company_id
    ? (companies || []).filter((c) => String(c.id) === String(user.company_id))
    : [];
  const byId = new Map();
  [...own, ...cross].forEach((c) => byId.set(String(c.id), c));
  return [...byId.values()];
}

/** Công ty xưởng thực hiện (HCB, Metalla, VPT) — lọc deal VPT theo nơi SX. */
export function sxWorkshopFilterCompanies(companies, user) {
  if (!isCrossWorkshopProductionViewer(user) && !isDealParticipantProductionViewer(user)) return [];
  const cross = (companies || []).filter(isMetallaOrHucabiCompany);
  const vpt = (companies || []).filter((c) => {
    const sn = String(c.short_name || '').trim().toUpperCase();
    const name = String(c.name || '').trim().toLowerCase();
    return sn === 'VPT' || name.includes('vạn phú');
  });
  const byId = new Map();
  [...cross, ...vpt].forEach((c) => byId.set(String(c.id), c));
  return [...byId.values()];
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
  const vpt = (companies || []).find((c) => {
    const sn = String(c.short_name || '').trim().toUpperCase();
    const name = String(c.name || '').trim().toLowerCase();
    return sn === 'VPT' || name.includes('vạn phú');
  });
  if (vpt && String(vpt.id) === String(companyId)) return true;
  return String(companyId) === String(user?.company_id || '');
}

export function canPickWorkshopCompany(user, isAdmin, isCompanyScopedAdmin) {
  if (isAdmin && !isCompanyScopedAdmin) return true;
  return isCrossWorkshopProductionViewer(user);
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
