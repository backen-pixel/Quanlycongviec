import { isProductionAdmin, isProductionStaff, isSystemAdmin, isCompanyScopedAdmin } from './adminRole';

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

/** Nhãn chip xưởng — Metalla thường thiếu short_name. */
export function workshopCompanyDisplayName(company) {
  if (!company) return '';
  const sn = String(company.short_name || '').trim();
  if (sn) return sn;
  const name = String(company.name || '').trim();
  const lower = name.toLowerCase();
  if (lower.includes('metalla')) return 'Metalla';
  if (lower.includes('hucabi')) return 'HCB';
  return name;
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

/** Admin công ty xưởng (HCB/Metalla) — khóa SX/VC đúng xưởng mình. Admin CRM VPT thì false. */
export function isOwnWorkshopCompanyAdmin(user, companies = []) {
  if (!isCompanyScopedAdmin(user) || !user?.company_id) return false;
  return isMetallaOrHucabiCompanyId(String(user.company_id), companies, user);
}

/** Chip xưởng SX: admin hệ thống → tất cả; admin/NV xưởng → chỉ công ty mình; NV CRM → HCB/Metalla. */
export function workshopCompaniesForCrossViewer(companies, user) {
  if (isSystemAdmin(user)) return companies || [];
  const ownWorkshop = resolveStaffWorkshopCompanyId(user, companies);
  if (ownWorkshop) {
    const own = (companies || []).find((c) => String(c.id) === ownWorkshop);
    return own ? [own] : [{ id: ownWorkshop, name: ownWorkshop, short_name: ownWorkshop }];
  }
  // Admin công ty Metalla/Hucabi: không hiện xưởng đối tác
  if (isOwnWorkshopCompanyAdmin(user, companies)) {
    const cid = String(user.company_id);
    const own = (companies || []).find((c) => String(c.id) === cid);
    return own ? [own] : [{ id: cid, name: cid, short_name: cid }];
  }
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

/** NV sản xuất gắn xưởng HCB/Metalla (không phải NV CRM xem chéo). */
export function isWorkshopProductionStaff(user) {
  return isProductionAdmin(user) || isProductionStaff(user);
}

/** Công ty xưởng của NV sản xuất — tin JWT/dept khi danh sách companies chưa tải. */
export function resolveStaffWorkshopCompanyId(user, companies = []) {
  const cid = String(user?.company_id || '').trim();
  if (!cid || !isWorkshopProductionStaff(user)) return '';
  if (isMetallaOrHucabiCompanyId(cid, companies, user)) return cid;
  return '';
}

/**
 * Công ty dùng để nạp phân loại xưởng (workshop_project_types).
 * Ưu tiên xưởng thực tế (HCB/Metalla) — không dùng công ty CRM (VPT) làm nguồn phân loại.
 */
export function resolveWorkshopCompanyForTypes({
  filterCompany = '',
  filterSxWorkshopCompany = '',
  userCompanyId = '',
  user = null,
  showVptSxWorkshopFilter = false,
  companies = [],
} = {}) {
  const trim = (id) => String(id || '').trim();

  /** Công ty hợp lệ làm nguồn phân loại pipeline SX. */
  const isWorkshopTypesSource = (id) => {
    const s = trim(id);
    if (!s) return false;
    if (isMetallaOrHucabiCompanyId(s, companies, user)) return true;
    // Công ty CRM (VPT) không có pipeline SX — tránh board trống / cột Global.
    // (Chỉ chặn đúng VPT theo short_name/tên — không chặn công ty tự vận hành xưởng riêng như Phúc Đạt.)
    const c = (companies || []).find((x) => String(x.id) === s);
    if (c) {
      const sn = String(c.short_name || '').trim().toUpperCase();
      const name = String(c.name || '').trim().toLowerCase();
      if (sn === 'VPT' || name.includes('vạn phú')) return false;
    }
    return (companies || []).some((x) => String(x.id) === s);
  };

  /** Chỉ HCB/Metalla — dùng khi suy ra từ JWT, tránh nhầm công ty CRM (VPT/Phúc Đạt deal). */
  const workshopIdStrict = (id) => {
    const s = trim(id);
    if (!s) return '';
    return isMetallaOrHucabiCompanyId(s, companies, user) ? s : '';
  };

  const workshopIdFromFilter = (id) => {
    const s = trim(id);
    if (!s) return '';
    return isWorkshopTypesSource(s) ? s : '';
  };

  if (showVptSxWorkshopFilter && filterSxWorkshopCompany) {
    return workshopIdFromFilter(filterSxWorkshopCompany) || trim(filterSxWorkshopCompany);
  }

  const ownWorkshop = resolveStaffWorkshopCompanyId(
    user || (userCompanyId ? { company_id: userCompanyId } : null),
    companies,
  );
  const fromFilter = workshopIdFromFilter(filterCompany);

  // Chip xưởng trên UI (Metalla / HCB) — không ghi đè bằng xưởng JWT của NV.
  if (fromFilter) return fromFilter;

  const fromUser = workshopIdStrict(userCompanyId);
  if (fromUser) return fromUser;

  if (ownWorkshop) return ownWorkshop;

  const firstWorkshop = productionWorkshopFilterCompanies(companies)[0];
  return firstWorkshop?.id ? String(firstWorkshop.id) : '';
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

export function isMetallaOrHucabiCompanyId(companyId, companies, user = null) {
  if (!companyId) return false;
  const c = (companies || []).find((x) => String(x.id) === String(companyId));
  if (c) return isMetallaOrHucabiCompany(c);
  // Companies chưa tải: NV xưởng có company_id từ JWT/dept — tránh race Kanban trống.
  if (user && isWorkshopProductionStaff(user)) {
    const cid = String(user.company_id || '').trim();
    if (cid && String(companyId) === cid) return true;
  }
  return false;
}
