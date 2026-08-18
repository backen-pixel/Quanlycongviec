/**
 * Helper bộ lọc Kanban SX — đồng bộ logic với frontend/src/lib/crossWorkshopProduction.js
 * và ProductionDashboard.jsx (web).
 */
import type { ProductionProject } from '../types';

export type CompanyRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

export type ClientCompanyOption = {
  id: string;
  name: string;
  short_name?: string | null;
  client_company_id?: string | null;
  external_catalog_id?: string | null;
  source?: string;
};

export type AuthUserLite = {
  role?: string | null;
  company_id?: string | null;
  email?: string | null;
};

export function isSystemAdmin(user?: AuthUserLite | null): boolean {
  return String(user?.role || '').trim() === 'admin'
    && (user?.company_id == null || String(user.company_id).trim() === '');
}

/** Admin gắn company_id — chỉ xem phạm vi công ty mình (khớp web isCompanyScopedAdmin). */
export function isCompanyScopedAdmin(user?: AuthUserLite | null): boolean {
  return String(user?.role || '').trim() === 'admin'
    && user?.company_id != null
    && String(user.company_id).trim() !== '';
}

export function isMetallaOrHucabiCompany(company?: CompanyRow | null): boolean {
  if (!company) return false;
  const sn = String(company.short_name || '').trim().toUpperCase();
  const name = String(company.name || '').trim().toLowerCase();
  return sn === 'HCB' || name.includes('metalla') || name.includes('hucabi');
}

export function isMetallaOrHucabiCompanyId(companyId: string | null | undefined, companies: CompanyRow[]): boolean {
  if (!companyId) return false;
  const c = companies.find((x) => String(x.id) === String(companyId));
  return c ? isMetallaOrHucabiCompany(c) : false;
}

/** Hiện bộ lọc «Công ty đặt hàng» khi NV thuộc công ty CRM (không phải xưởng HCB/Metalla). */
export function shouldShowDealCompanyFilter(user: AuthUserLite | null | undefined, companies: CompanyRow[]): boolean {
  if (isSystemAdmin(user)) return true;
  if (!user?.company_id) return false;
  return !isMetallaOrHucabiCompanyId(user.company_id, companies);
}

/** Xưởng HCB/Metalla — dùng làm company_id khi gọi GET /production/client-companies. */
export function productionCreateCompanyOptions(companies: CompanyRow[]): CompanyRow[] {
  return companies.filter(isMetallaOrHucabiCompany);
}

export function workshopCompaniesForCrossViewer(companies: CompanyRow[], user: AuthUserLite | null | undefined): CompanyRow[] {
  if (isSystemAdmin(user)) return companies;
  if (isCompanyScopedAdmin(user) && user?.company_id) {
    const cid = String(user.company_id);
    const own = (companies || []).find((c) => String(c.id) === cid);
    return own ? [own] : [{ id: cid, name: cid, short_name: cid }];
  }
  return productionCreateCompanyOptions(companies);
}

export function resolveDealCompanyParam(opts: {
  filterDealCompany: string;
  dealCompanyOptions: ClientCompanyOption[];
  showDealCompanyFilter: boolean;
  user: AuthUserLite | null | undefined;
  isAdmin: boolean;
}): string | undefined {
  const pick = opts.filterDealCompany
    ? opts.dealCompanyOptions.find((c) => String(c.id) === String(opts.filterDealCompany))
    : null;
  if (pick?.client_company_id) return String(pick.client_company_id);
  if (opts.filterDealCompany && !String(opts.filterDealCompany).startsWith('ext:')) {
    return String(opts.filterDealCompany);
  }
  if (opts.showDealCompanyFilter && !opts.isAdmin && !isSystemAdmin(opts.user) && opts.user?.company_id) {
    return String(opts.user.company_id);
  }
  return undefined;
}

export function resolveDealCompanyExternalFilter(
  filterDealCompany: string,
  dealCompanyOptions: ClientCompanyOption[],
): { catalogId?: string | null; name?: string } | null {
  const pick = filterDealCompany
    ? dealCompanyOptions.find((c) => String(c.id) === String(filterDealCompany))
    : null;
  if (!pick || pick.client_company_id) return null;
  const rawId = String(pick.id || '');
  const catalogId = pick.external_catalog_id || (rawId.startsWith('ext:') ? rawId.slice(4) : null);
  return {
    catalogId,
    name: String(pick.short_name || pick.name || '').trim(),
  };
}

/** Cột Lắp đặt — khớp isInstallVcStage (frontend/src/lib/managementDashboardUtils.js). */
export function isInstallVcStage(stage?: {
  name?: string | null;
  slug?: string | null;
  bucket_slug?: string | null;
  crm_sync_type?: string | null;
  workflow_stage?: { slug?: string | null } | null;
} | null): boolean {
  if (!stage) return false;
  const name = String(stage.name || '').toLowerCase();
  const slug = String(stage.bucket_slug || '').toLowerCase();
  const wfSlug = String(stage.slug || stage.workflow_stage?.slug || '').toLowerCase();

  // Tên/slug Vận chuyển là tín hiệu ưu tiên. Một số cột cũ còn giữ
  // crm_sync_type=installation nên trước đây bị đẩy nhầm sang tab Lắp đặt.
  if (
    name.includes('đang vận chuyển')
    || name.includes('dang van chuyen')
    || wfSlug === 'delivery'
    || wfSlug === 'shipping'
  ) {
    return false;
  }
  if (String(stage.crm_sync_type || '').toLowerCase() === 'installation') return true;
  return (
    slug.includes('install')
    || wfSlug.includes('install')
    || name.includes('lắp')
    || name.includes('lap dat')
    || name.includes('lắp đặt')
  );
}

/** Id NV phụ trách VC/LĐ/SX trên thẻ — khớp web matchesProject + installer. */
export function projectStaffPersonIds(project: ProductionProject): string[] {
  const ids = new Set<string>();
  const push = (v?: string | null) => {
    const s = String(v || '').trim();
    if (s) ids.add(s);
  };
  push(project.logistics_person_id);
  push(project.installer_person_id);
  push(project.production_person_id);
  push(project.sales_person_id);
  const deals = project.crm_deals || [];
  const primary = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
  push(primary?.assignee?.id);
  push(primary?.lead_owner?.id);
  return [...ids];
}

/** Lọc NV phụ trách — khớp web useWorkshopStaffFilter.matchesProject (logistics). */
export function projectMatchesPerson(project: ProductionProject, personId?: string | null): boolean {
  const id = String(personId || '').trim();
  if (!id) return true;
  return projectStaffPersonIds(project).includes(id);
}

export function projectHasCustomerPhone(project: ProductionProject): boolean {
  return Boolean(String(project.customer_phone || '').trim());
}

/** Lọc client-side công ty đặt hàng ngoài CRM (ext:...) — khớp web. */
export function projectMatchesDealCompanyExternalFilter(
  project: ProductionProject,
  externalFilter: { catalogId?: string | null; name?: string } | null,
): boolean {
  if (!externalFilter) return true;
  const deals = project.crm_deals || [];
  const deal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
  if (!deal) return false;
  if (externalFilter.catalogId && deal.external_catalog_id
    && String(deal.external_catalog_id) === String(externalFilter.catalogId)) {
    return true;
  }
  if (externalFilter.name) {
    const dealName = String(deal.external_company_name || '').trim();
    if (dealName && dealName === externalFilter.name) return true;
  }
  return false;
}
